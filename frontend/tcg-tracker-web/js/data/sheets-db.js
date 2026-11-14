import { CONFIG } from '../core/config.js';
import { signIn } from '../core/auth.js';
import {
  EVENT_SHEETS_WRITE_FAILED,
  EVENT_SHEETS_WRITE_RETRY,
  EVENT_SHEETS_WRITE_SUCCESS,
} from '../core/storage-keys.js';
import {
  normalizeCardNumber,
  toBoolean,
  extractDisplayTextFromHyperlink,
  colToA1
} from '../core/utils.js';
import {
  SET_DB_HEADERS,
  CARD_DB_HEADERS,
  SET_MATCH_STATUS,
  CARD_MATCH_STATUS,
  resolveDisplaySet,
  resolveDisplayCard,
  getCardLanguage
} from './schema-contract.js?v=20261114-api-images';
import { withV3CardmarketIds } from './v3-cardmarket-ids.js';
import {
  planSetScopedUpsert,
  planSetScopedDedup
} from './set-scoped-upsert.js';
import {
  ensureResolverForSet,
  ensureSetResolver,
  collectCollectionSetIds,
  buildCollectionMap,
  cellsForUpdate
} from './collection-aliases.js';
import { mergeAliasOverviewSets } from './set-aliases.js';

export { cellsForUpdate };

function quoteSheetName(sheetName) {
  const name = String(sheetName ?? '').replace(/'/g, "''");
  return `'${name}'`;
}

function buildRange(sheetName, a1Range) {
  return `${quoteSheetName(sheetName)}!${a1Range}`;
}

function isDbSheetTitle(title) {
  const normalized = normalizeName(title);
  return normalized === normalizeName(DB_SHEETS.sets)
    || normalized === normalizeName(DB_SHEETS.cards)
    || normalized === normalizeName(DB_SHEETS.collection);
}

let resolvedSheetsCache = null;
let schemaEnsuredPromise = null;
const dbRowsCache = new Map();
const sheetCapacityCache = new Map();
const legacyMigrationLocks = new Map();
let sheetsWriteQueue = Promise.resolve();
const SHEETS_WRITE_GAP_MS = 90;

const DB_SHEETS = {
  sets: 'db_sets',
  cards: 'db_cards',
  collection: 'db_collection'
};

const DB_HEADERS = {
  sets: SET_DB_HEADERS,
  cards: CARD_DB_HEADERS,
  collection: ['setId', 'cardId', 'g', 'rh', 'updatedAt']
};

function normalizeName(value) {
  return String(value ?? '').trim().toLowerCase();
}

export function resetSheetsDataCaches() {
  resolvedSheetsCache = null;
  schemaEnsuredPromise = null;
  dbRowsCache.clear();
  sheetCapacityCache.clear();
  // Sperren (legacyMigrationLocks, sheetAppendLocks) bleiben bewusst erhalten: Ein Reset waehrend eines
  // laufenden Writes darf keinen parallelen Anhaenge-Vorgang zulassen. Sie raeumen sich selbst auf.
  sheetsWriteQueue = Promise.resolve();
}

function invalidateSheetRowCache(sheetName) {
  const prefix = `${sheetName}:`;
  for (const key of dbRowsCache.keys()) {
    if (key.startsWith(prefix)) {
      dbRowsCache.delete(key);
    }
  }
}

function primeSheetCapacityCache(sheets = []) {
  (sheets || []).forEach((sheet) => {
    const title = sheet?.properties?.title;
    if (!title) return;
    sheetCapacityCache.set(normalizeName(title), {
      sheetId: sheet?.properties?.sheetId,
      title,
      rowCount: Number(sheet?.properties?.gridProperties?.rowCount) || 0,
      columnCount: Number(sheet?.properties?.gridProperties?.columnCount) || 0,
    });
  });
}

function waitForDelay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function enqueueSheetsMutation(task, { gapMs = SHEETS_WRITE_GAP_MS } = {}) {
  const runTask = async () => {
    const result = await task();
    if (gapMs > 0) {
      await waitForDelay(gapMs);
    }
    return result;
  };

  const scheduled = sheetsWriteQueue.then(runTask, runTask);
  sheetsWriteQueue = scheduled.catch(() => undefined);
  return scheduled;
}

function pickSheetTitle(titles, preferred, aliases, matcher) {
  const normalizedPreferred = normalizeName(preferred);
  const exact = titles.find((title) => normalizeName(title) === normalizedPreferred);
  if (exact) return exact;

  const normalizedAliases = aliases.map(normalizeName);
  const aliasHit = titles.find((title) => normalizedAliases.includes(normalizeName(title)));
  if (aliasHit) return aliasHit;

  return titles.find((title) => matcher(normalizeName(title))) || null;
}

function looksLikeSetId(value) {
  const text = String(value ?? '').trim().toLowerCase();
  if (!text) return false;
  if (text.startsWith('=hyperlink(')) {
    const display = extractDisplayTextFromHyperlink(text);
    return /^[a-z]+\d+[a-z0-9.]*$/.test(String(display ?? '').trim().toLowerCase());
  }
  return /^[a-z]+\d+[a-z0-9.]*$/.test(text);
}

function scoreOverviewRows(rows) {
  let score = 0;
  for (const row of rows) {
    if (!row || row.length === 0) continue;
    const idCell = row[0];
    const nameCell = row[1];
    const seriesCell = row[4];
    if (looksLikeSetId(idCell)) score += 3;
    if (String(nameCell ?? '').trim()) score += 1;
    if (String(seriesCell ?? '').trim()) score += 1;
  }
  return score;
}

async function detectOverviewByContent(titles) {
  let best = { title: null, score: -1 };
  for (const title of titles) {
    try {
      const rows = await getFormulas(buildRange(title, 'A3:J'));
      const score = scoreOverviewRows(rows.slice(0, 80));
      if (score > best.score) best = { title, score };
    } catch {
      // Blatt passt nicht fÃ¼r dieses Schema â€“ ignorieren
    }
  }
  return best.score > 0 ? best.title : null;
}

async function resolveSheetNames() {
  if (resolvedSheetsCache) return resolvedSheetsCache;

  if (!gapi?.client?.sheets?.spreadsheets?.get) {
    throw new Error('Sheets API nicht initialisiert â€“ bitte zuerst anmelden.');
  }

  const meta = await gapi.client.sheets.spreadsheets.get({
    spreadsheetId: CONFIG.SPREADSHEET_ID,
    fields: 'sheets(properties(sheetId,title,gridProperties(rowCount,columnCount)))'
  });

  const metaSheets = meta.result.sheets || [];
  primeSheetCapacityCache(metaSheets);

  const titles = metaSheets
    .map((sheet) => sheet.properties?.title)
    .filter(Boolean);

  const settings = pickSheetTitle(
    titles,
    CONFIG.SHEETS.SETTINGS,
    ['Settings', 'WebApp Setting', 'Einstellungen'],
    (name) => name.includes('setting') || name.includes('einstellung')
  ) || CONFIG.SHEETS.SETTINGS;

  const nonDbTitles = titles.filter((title) => !isDbSheetTitle(title) && normalizeName(title) !== normalizeName(settings));

  let overview = pickSheetTitle(
    nonDbTitles,
    CONFIG.SHEETS.OVERVIEW,
    ['Set Overview', 'PokÃ©mon TCG Sets Ãœbersicht', 'Pokemon TCG Sets Ãœbersicht', 'Sets Ãœbersicht'],
    (name) => (name.includes('set') || name.includes('sets')) && (name.includes('overview') || name.includes('Ã¼bersicht'))
  );
  if (!overview) {
    overview = await detectOverviewByContent(nonDbTitles);
  }
  // Last resort: exactly one non-DB, non-settings sheet â†’ use it as overview
  if (!overview && nonDbTitles.length === 1) {
    overview = nonDbTitles[0];
  }

  const summary = pickSheetTitle(
    nonDbTitles,
    CONFIG.SHEETS.SUMMARY,
    ['Summary', 'Collection', 'SammlungsÃ¼bersicht'],
    (name) => name.includes('summary') || name.includes('zusammenfassung') || name.includes('sammlung')
  );

  resolvedSheetsCache = {
    overview: overview || null,
    summary: summary || null,
    settings,
    titles
  };
  return resolvedSheetsCache;
}

function isInvalidRangeError(err) {
  const message = String(err?.result?.error?.message || err?.message || '').toLowerCase();
  return err?.status === 400 || message.includes('invalid_argument') || message.includes('unable to parse range');
}

// Fuer Lesungen, die Zielzeilen bestimmen: nur ein fehlendes Blatt/Range gilt als leer, alles andere wirft.
function rowsOrThrowUnlessMissing(err) {
  if (isInvalidRangeError(err)) return [];
  throw err;
}

async function getOverviewRows(sheets) {
  if (!sheets?.overview) return [];
  const primaryRange = buildRange(sheets.overview, 'A3:J');
  try {
    return await getFormulas(primaryRange);
  } catch (err) {
    if (!isInvalidRangeError(err) || !Array.isArray(sheets.titles) || sheets.titles.length === 0) {
      throw err;
    }

    const alternatives = sheets.titles.filter((title) => title !== sheets.overview);
    for (const title of alternatives) {
      try {
        const rows = await getFormulas(buildRange(title, 'A3:J'));
        sheets.overview = title;
        resolvedSheetsCache = sheets;
        return rows;
      } catch {
        // nÃ¤chstes Blatt probieren
      }
    }

    throw err;
  }
}

async function getValues(range, renderOption = 'UNFORMATTED_VALUE', suppressErrorLog = false) {
  const maxRetries = 6;
  try {
    if (!gapi?.client?.sheets?.spreadsheets?.values?.get) {
      throw new Error('Sheets API nicht initialisiert â€“ bitte melden Sie sich an');
    }
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const response = await gapi.client.sheets.spreadsheets.values.get({
          spreadsheetId: CONFIG.SPREADSHEET_ID,
          range,
          valueRenderOption: renderOption
        });
        return response.result.values || [];
      } catch (err) {
        if (err?.status !== 429 || attempt >= maxRetries) throw err;
        const delay = Math.min(10000, 400 * Math.pow(2, attempt)) + Math.floor(Math.random() * 120);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
    return [];
  } catch (err) {
    if (!suppressErrorLog) {
      console.error('[getValues]', err);
    }
    throw err;
  }
}

// Formeln mÃ¼ssen mit FORMULA gelesen werden (z.B. HYPERLINK in Overview)
async function getFormulas(range) {
  return getValues(range, 'FORMULA');
}

function isRetryableWriteError(err) {
  const status = Number(err?.status || err?.result?.error?.code || 0);
  if ([429, 500, 502, 503, 504].includes(status)) return true;
  const message = String(err?.result?.error?.message || err?.message || '').toLowerCase();
  return message.includes('timeout') || message.includes('temporar') || message.includes('rate limit');
}

function isAuthWriteError(err) {
  const status = Number(err?.status || err?.result?.error?.code || 0);
  if (status === 401 || status === 403) return true;
  const message = String(err?.result?.error?.message || err?.message || '').toLowerCase();
  return message.includes('unauthenticated')
    || message.includes('unauthorized')
    || message.includes('permission denied')
    || message.includes('auth');
}

function buildAuthWriteRecoveryError(err) {
  const wrapped = new Error('Google-Anmeldung abgelaufen. Bitte oben erneut anmelden und die Aktion wiederholen.');
  wrapped.cause = err;
  wrapped.code = 'AUTH_RELOGIN_REQUIRED';
  wrapped.status = Number(err?.status || err?.result?.error?.code || 0) || 401;
  return wrapped;
}

function emitWriteEvent(type, detail) {
  if (typeof window === 'undefined' || !window.dispatchEvent || typeof CustomEvent === 'undefined') return;
  window.dispatchEvent(new CustomEvent(type, { detail }));
}

async function putValues(range, values) {
  const maxRetries = 6;
  let reauthedOnce = false;
  try {
    if (!gapi?.client?.sheets?.spreadsheets?.values?.update) {
      throw new Error('Sheets API nicht initialisiert â€“ bitte melden Sie sich an');
    }
    return await enqueueSheetsMutation(async () => {
      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
          await gapi.client.sheets.spreadsheets.values.update({
            spreadsheetId: CONFIG.SPREADSHEET_ID,
            range,
            valueInputOption: 'USER_ENTERED',
            resource: { values }
          });
          emitWriteEvent(EVENT_SHEETS_WRITE_SUCCESS, {
            range,
            attemptsUsed: attempt + 1,
            maxRetries
          });
          return;
        } catch (err) {
          if (isAuthWriteError(err) && !reauthedOnce) {
            reauthedOnce = true;
            const canAttemptInteractiveReauth = typeof document === 'undefined' || document.visibilityState === 'visible';
            const reauthed = canAttemptInteractiveReauth
              ? await signIn({ forceConsent: false }).catch(() => false)
              : false;
            if (reauthed) {
              emitWriteEvent(EVENT_SHEETS_WRITE_RETRY, {
                range,
                attempt: attempt + 1,
                maxRetries,
                delayMs: 0,
                status: Number(err?.status || err?.result?.error?.code || 0) || null
              });
              continue;
            }
            throw buildAuthWriteRecoveryError(err);
          }
          if (!isRetryableWriteError(err) || attempt >= maxRetries) throw err;
          const delay = Math.min(10000, 500 * Math.pow(2, attempt)) + Math.floor(Math.random() * 150);
          emitWriteEvent(EVENT_SHEETS_WRITE_RETRY, {
            range,
            attempt: attempt + 1,
            maxRetries,
            delayMs: delay,
            status: Number(err?.status || err?.result?.error?.code || 0) || null
          });
          await waitForDelay(delay);
        }
      }
    });
  } catch (err) {
    emitWriteEvent(EVENT_SHEETS_WRITE_FAILED, {
      range,
      status: Number(err?.status || err?.result?.error?.code || 0) || null,
      message: String(err?.result?.error?.message || err?.message || 'Unbekannter Fehler')
    });
    console.error('[putValues]', err);
    throw err;
  }
}

async function batchPutValues(updates = []) {
  const normalizedUpdates = (updates || []).filter((entry) => entry?.range && Array.isArray(entry?.values) && entry.values.length > 0);
  if (!normalizedUpdates.length) return;

  const maxRetries = 6;
  let reauthedOnce = false;
  const rangeLabel = normalizedUpdates.length === 1 ? normalizedUpdates[0].range : `${normalizedUpdates.length} ranges`;

  try {
    if (!gapi?.client?.sheets?.spreadsheets?.values?.batchUpdate) {
      for (const entry of normalizedUpdates) {
        await putValues(entry.range, entry.values);
      }
      return;
    }

    return await enqueueSheetsMutation(async () => {
      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
          await gapi.client.sheets.spreadsheets.values.batchUpdate({
            spreadsheetId: CONFIG.SPREADSHEET_ID,
            resource: {
              valueInputOption: 'USER_ENTERED',
              data: normalizedUpdates.map((entry) => ({ range: entry.range, values: entry.values }))
            }
          });
          emitWriteEvent(EVENT_SHEETS_WRITE_SUCCESS, {
            range: rangeLabel,
            attemptsUsed: attempt + 1,
            maxRetries
          });
          return;
        } catch (err) {
          if (isAuthWriteError(err) && !reauthedOnce) {
            reauthedOnce = true;
            const canAttemptInteractiveReauth = typeof document === 'undefined' || document.visibilityState === 'visible';
            const reauthed = canAttemptInteractiveReauth
              ? await signIn({ forceConsent: false }).catch(() => false)
              : false;
            if (reauthed) {
              emitWriteEvent(EVENT_SHEETS_WRITE_RETRY, {
                range: rangeLabel,
                attempt: attempt + 1,
                maxRetries,
                delayMs: 0,
                status: Number(err?.status || err?.result?.error?.code || 0) || null
              });
              continue;
            }
            throw buildAuthWriteRecoveryError(err);
          }
          if (!isRetryableWriteError(err) || attempt >= maxRetries) throw err;
          const delay = Math.min(10000, 500 * Math.pow(2, attempt)) + Math.floor(Math.random() * 150);
          emitWriteEvent(EVENT_SHEETS_WRITE_RETRY, {
            range: rangeLabel,
            attempt: attempt + 1,
            maxRetries,
            delayMs: delay,
            status: Number(err?.status || err?.result?.error?.code || 0) || null
          });
          await waitForDelay(delay);
        }
      }
    });
  } catch (err) {
    emitWriteEvent(EVENT_SHEETS_WRITE_FAILED, {
      range: rangeLabel,
      status: Number(err?.status || err?.result?.error?.code || 0) || null,
      message: String(err?.result?.error?.message || err?.message || 'Unbekannter Fehler')
    });
    console.error('[batchPutValues]', err);
    throw err;
  }
}

async function listSheetTitles() {
  const meta = await gapi.client.sheets.spreadsheets.get({
    spreadsheetId: CONFIG.SPREADSHEET_ID,
    fields: 'sheets(properties(sheetId,title,gridProperties(rowCount,columnCount)))'
  });
  const metaSheets = meta.result.sheets || [];
  primeSheetCapacityCache(metaSheets);
  return metaSheets
    .map((sheet) => sheet.properties?.title)
    .filter(Boolean);
}

async function addSheet(title) {
  await enqueueSheetsMutation(async () => {
    await gapi.client.sheets.spreadsheets.batchUpdate({
      spreadsheetId: CONFIG.SPREADSHEET_ID,
      resource: {
        requests: [{ addSheet: { properties: { title } } }]
      }
    });
  }, { gapMs: 0 });
  resolvedSheetsCache = null;
  dbRowsCache.clear();
  sheetCapacityCache.clear();
}

function buildDataRange(sheetName, columnCount, startRow = 2, endRow = 200000) {
  const endColumn = colToA1(Math.max(1, columnCount));
  return buildRange(sheetName, `A${startRow}:${endColumn}${endRow}`);
}

async function ensureSheetWithHeader(sheetName, header) {
  const titles = await listSheetTitles();
  if (!titles.includes(sheetName)) {
    await addSheet(sheetName);
    await ensureSheetCapacity(sheetName, 1, header.length);
    await putValues(buildRange(sheetName, `A1:${colToA1(header.length)}1`), [header]);
    return;
  }

  const existingHeader = await getValues(buildRange(sheetName, `A1:${colToA1(header.length)}1`)).catch(() => []);
  const existingHeaderRow = Array.isArray(existingHeader[0]) ? existingHeader[0] : [];
  const hasHeader = existingHeaderRow.some((value) => String(value ?? '').trim() !== '');
  if (!hasHeader) {
    await ensureSheetCapacity(sheetName, 1, header.length);
    await putValues(buildRange(sheetName, `A1:${colToA1(header.length)}1`), [header]);
    return;
  }

  const normalizedCurrent = existingHeaderRow.map((value) => String(value ?? '').trim());
  const normalizedExpected = header.map((value) => String(value ?? '').trim());
  const headerMismatch = normalizedCurrent.length !== normalizedExpected.length
    || normalizedExpected.some((expected, idx) => normalizedCurrent[idx] !== expected);

  if (headerMismatch) {
    await clearSheetDataRows(sheetName);
    await ensureSheetCapacity(sheetName, 1, header.length);
    await putValues(buildRange(sheetName, `A1:${colToA1(header.length)}1`), [header]);
  }
}

async function clearSheetDataRows(sheetName) {
  if (!gapi?.client?.sheets?.spreadsheets?.values?.clear) {
    throw new Error('Sheets API nicht initialisiert â€“ bitte melden Sie sich an');
  }
  await gapi.client.sheets.spreadsheets.values.clear({
    spreadsheetId: CONFIG.SPREADSHEET_ID,
    range: buildRange(sheetName, 'A2:ZZ')
  });
  dbRowsCache.delete(sheetName);
}

function isValidSetStatus(value) {
  return [SET_MATCH_STATUS.MATCHED, SET_MATCH_STATUS.PRIMARY_ONLY, SET_MATCH_STATUS.TCGDEX_ONLY].includes(String(value || '').trim());
}

function isValidCardStatus(value) {
  return [CARD_MATCH_STATUS.MATCHED, CARD_MATCH_STATUS.PRIMARY_ONLY, CARD_MATCH_STATUS.TCGDEX_ONLY].includes(String(value || '').trim());
}

function isLikelyValidSetRow(row) {
  const setId = toSafeCellString(row?.[0]);
  if (!setId) return false;
  if (!isValidSetStatus(row?.[3])) return false;
  return true;
}

function isLikelyValidCardRow(row) {
  const setId = toSafeCellString(row?.[0]);
  const cardId = toSafeCellString(row?.[1]);
  if (!setId || !cardId) return false;
  if (!isValidCardStatus(row?.[3])) return false;
  return true;
}

async function ensureStrictDataRows(sheetName, columnCount, validator) {
  const sampleRows = await getValues(buildDataRange(sheetName, columnCount, 2, 80));
  if (!Array.isArray(sampleRows) || sampleRows.length === 0) return;

  let checked = 0;
  let invalid = 0;
  for (const row of sampleRows) {
    if (!Array.isArray(row) || row.length === 0) continue;
    checked += 1;
    if (!validator(row)) invalid += 1;
  }

  if (checked === 0) return;
  const invalidRatio = invalid / checked;
  if (invalidRatio >= 0.25) {
    // Legacy/misaligned rows are intentionally discarded in strict schema mode.
    await clearSheetDataRows(sheetName);
  }
}

async function ensureNormalizedSchema() {
  if (!schemaEnsuredPromise) {
    schemaEnsuredPromise = (async () => {
      await ensureSheetWithHeader(DB_SHEETS.sets, DB_HEADERS.sets);
      await ensureSheetWithHeader(DB_SHEETS.cards, DB_HEADERS.cards);
      await ensureSheetWithHeader(DB_SHEETS.collection, DB_HEADERS.collection);
      await ensureStrictDataRows(DB_SHEETS.sets, DB_HEADERS.sets.length, isLikelyValidSetRow);
      await ensureStrictDataRows(DB_SHEETS.cards, DB_HEADERS.cards.length, isLikelyValidCardRow);
    })();
  }
  await schemaEnsuredPromise;
}

// Lesefehler werden nie gecacht. strict: Lesungen, die eine Anhaenge-Startzeile oder ein Update-Ziel
// bestimmen, werfen bei jedem Fehler ausser "Blatt/Range existiert nicht" (dann leer, ungecacht) -
// sonst wuerde ab Zeile 2 ueberschrieben. Nicht-strict (Anzeige) liefert bei Fehlern [] (ungecacht).
async function readDbRows(sheetName, columnCount, force = false, { strict = false } = {}) {
  const key = `${sheetName}:${columnCount}`;
  if (!force && dbRowsCache.has(key)) {
    return dbRowsCache.get(key);
  }
  let rows;
  try {
    rows = await getValues(buildDataRange(sheetName, columnCount, 2, 200000));
  } catch (err) {
    if (isInvalidRangeError(err)) return [];
    if (strict) throw err;
    return [];
  }
  dbRowsCache.set(key, rows);
  return rows;
}

async function rewriteDbRows(sheetName, columnCount, rows) {
  await clearValues(buildDataRange(sheetName, columnCount, 2, 200000));
  invalidateSheetRowCache(sheetName);
  if (rows.length === 0) return;
  const endRow = rows.length + 1;
  const endCol = colToA1(columnCount);
  await putValues(buildRange(sheetName, `A2:${endCol}${endRow}`), rows);
  dbRowsCache.set(`${sheetName}:${columnCount}`, rows);
}

// Anhaengen wird pro Blatt serialisiert: Die Startzeile ergibt sich aus der tatsaechlichen Zeilenzahl,
// nachdem alle vorherigen Anhaenge-Writes gelandet sind. Ohne Sperre lasen parallele Aufrufer dieselbe
// Zeilenzahl und ueberschrieben sich gegenseitig. (enqueueSheetsMutation ist nicht nutzbar: putValues und
// ensureSheetCapacity reihen sich selbst dort ein -> Verschachtelung wuerde blockieren.)
const sheetAppendLocks = new Map();

function withSheetAppendLock(sheetName, task) {
  const key = normalizeName(sheetName);
  const previous = sheetAppendLocks.get(key) || Promise.resolve();
  const run = previous.catch(() => undefined).then(task);
  const tail = run.catch(() => undefined);
  sheetAppendLocks.set(key, tail);
  tail.then(() => {
    if (sheetAppendLocks.get(key) === tail) sheetAppendLocks.delete(key);
  });
  return run;
}

// Nur innerhalb von withSheetAppendLock aufrufen; `existing` = frisch gelesene Zeilen. Liefert die neuen Zeilen.
async function appendRowsUnlocked(sheetName, columnCount, existing, rows) {
  const start = existing.length + 2;
  const end = start + rows.length - 1;
  const endCol = colToA1(columnCount);
  await ensureSheetCapacity(sheetName, end, columnCount);
  await putValues(buildRange(sheetName, `A${start}:${endCol}${end}`), rows);
  const next = [...existing, ...rows];
  dbRowsCache.set(`${sheetName}:${columnCount}`, next);
  return next;
}

async function appendDbRows(sheetName, columnCount, rows) {
  if (!Array.isArray(rows) || rows.length === 0) return;
  await withSheetAppendLock(sheetName, async () => {
    const existing = await readDbRows(sheetName, columnCount, true, { strict: true });
    await appendRowsUnlocked(sheetName, columnCount, existing, rows);
  });
}

/** Haengt db_collection-Zeilen an (serialisiert ueber die Blatt-Sperre), z. B. fuer die Altschluessel-Migration. */
export async function appendCollectionRows(rows) {
  await ensureNormalizedSchema();
  await appendDbRows(DB_SHEETS.collection, DB_HEADERS.collection.length, rows);
}

async function ensureSheetCapacity(sheetName, requiredRows, requiredCols) {
  const normalizedSheetName = normalizeName(sheetName);
  const targetRows = Math.max(0, Number(requiredRows) || 0);
  const targetCols = Math.max(0, Number(requiredCols) || 0);

  let sheetInfo = sheetCapacityCache.get(normalizedSheetName) || null;
  if (sheetInfo && targetRows <= sheetInfo.rowCount && targetCols <= sheetInfo.columnCount) {
    return;
  }

  const meta = await gapi.client.sheets.spreadsheets.get({
    spreadsheetId: CONFIG.SPREADSHEET_ID,
    fields: 'sheets(properties(sheetId,title,gridProperties(rowCount,columnCount)))'
  });
  primeSheetCapacityCache(meta.result.sheets || []);
  sheetInfo = sheetCapacityCache.get(normalizedSheetName) || null;

  if (!sheetInfo?.sheetId) {
    throw new Error(`Sheet nicht gefunden: ${sheetName}`);
  }

  const currentRows = Number(sheetInfo.rowCount) || 0;
  const currentCols = Number(sheetInfo.columnCount) || 0;
  const requests = [];

  if (targetRows > currentRows) {
    requests.push({
      appendDimension: {
        sheetId: sheetInfo.sheetId,
        dimension: 'ROWS',
        length: targetRows - currentRows
      }
    });
  }

  if (targetCols > currentCols) {
    requests.push({
      appendDimension: {
        sheetId: sheetInfo.sheetId,
        dimension: 'COLUMNS',
        length: targetCols - currentCols
      }
    });
  }

  if (requests.length === 0) {
    return;
  }

  await enqueueSheetsMutation(async () => {
    await gapi.client.sheets.spreadsheets.batchUpdate({
      spreadsheetId: CONFIG.SPREADSHEET_ID,
      resource: { requests }
    });
  }, { gapMs: 0 });

  sheetCapacityCache.set(normalizedSheetName, {
    ...sheetInfo,
    rowCount: Math.max(currentRows, targetRows),
    columnCount: Math.max(currentCols, targetCols)
  });
  invalidateSheetRowCache(sheetName);
}

function toSafeCellString(value) {
  return String(value ?? '').trim();
}

function toPersistableMediaString(value) {
  const text = toSafeCellString(value);
  if (!text) return '';
  return /pokeball-fallback\.svg/i.test(text) ? '' : text;
}

function toSafeJsonString(value) {
  if (value == null) return '';
  if (Array.isArray(value) && value.length === 0) return '';
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed;
  }
  try {
    return JSON.stringify(value);
  } catch {
    return '';
  }
}

function tryParseJson(value, fallback) {
  const text = toSafeCellString(value);
  if (!text) return fallback;
  try {
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}

function nowIso() {
  return new Date().toISOString();
}

function buildEmptyRow(columnCount) {
  return Array.from({ length: columnCount }, () => '');
}


// lockedRows: Aufrufer haelt bereits withSheetAppendLock(sheetName) und hat diese Zeilen frisch gelesen;
// dann wird ohne erneute Sperre angehaengt (appendDbRows wuerde auf die eigene Sperre warten).
async function applySetScopedPlan(sheetName, columnCount, plan, { lockedRows = null } = {}) {
  if (!plan) return;
  const updates = Array.isArray(plan.updates) ? plan.updates : [];
  const clearIndices = Array.isArray(plan.clearIndices) ? plan.clearIndices : [];
  const appendRows = Array.isArray(plan.appendRows) ? plan.appendRows : [];

  if (updates.length > 0) {
    await batchPutValues(updates.map((update) => ({
      range: buildRange(sheetName, `A${update.rowIndex + 2}:${colToA1(columnCount)}${update.rowIndex + 2}`),
      values: [update.rowValues]
    })));
  }

  if (clearIndices.length > 0) {
    const emptyRow = buildEmptyRow(columnCount);
    await batchPutValues(clearIndices.map((rowIndex) => ({
      range: buildRange(sheetName, `A${rowIndex + 2}:${colToA1(columnCount)}${rowIndex + 2}`),
      values: [emptyRow]
    })));
  }

  if (appendRows.length > 0) {
    if (lockedRows) await appendRowsUnlocked(sheetName, columnCount, lockedRows, appendRows);
    else await appendDbRows(sheetName, columnCount, appendRows);
  }

  if (updates.length > 0 || clearIndices.length > 0 || appendRows.length > 0) {
    await readDbRows(sheetName, columnCount, true);
  }
}

// Format-Erkennung fÃ¼r RÃ¼ckwÃ¤rtskompatibilitÃ¤t mit Pre-Schema-Zeilen
function isNewSetFormat(row) {
  // Altes Format: row[1] = setName (kein Boolean)
  // Neues Format: row[1] = imported (Boolean â†’ 'true'/'false')
  const v = String(row?.[1] ?? '').toLowerCase().trim();
  return v === 'true' || v === 'false';
}

function isNewCardFormat(row) {
  // Altes Format: row[2] = Displaynummer (z.B. '1', 'TG01')
  // Neues Format: row[2] = updatedAt (ISO-Datum '2024-...')
  return /^\d{4}-\d{2}-\d{2}T/.test(String(row?.[2] ?? ''));
}

function isCardImageSplitFormat(row) {
  const slot16 = String(row?.[16] ?? '').trim();
  const slot19 = String(row?.[19] ?? '').trim();
  const slot18 = String(row?.[18] ?? '').trim();
  if (/^[\[{]/.test(slot19)) return true;   // neues Format: vera_types liegt bei [19]
  if (/^[\[{]/.test(slot18)) return false;  // altes Format: vera_types lag bei [18]
  if (/^https?:\/\//i.test(slot16)) return true; // neues Format: vera_cardmarket_url liegt bei [16]
  return Array.isArray(row) && row.length >= CARD_DB_HEADERS.length;
}

async function upsertDbSet(setMeta, imported = false) {
  // db_sets ist ein Cache (Spec §7.1); die Overview-Zeile schreibt upsertOverviewEntry unabhaengig davon.
  if (!CONFIG.WRITE_DB_CARDS) return;
  await ensureNormalizedSchema();
  const setId = toSafeCellString(setMeta?.setId);
  if (!setId) return;

  // Pro Blatt serialisiert: neue Zeile ans tatsaechliche Ende (frisch gelesen), kein Ueberschreiben paralleler Upserts.
  await withSheetAppendLock(DB_SHEETS.sets, async () => {
    const rows = await readDbRows(DB_SHEETS.sets, DB_HEADERS.sets.length, true, { strict: true });
    // Neues SET_DB_HEADERS-Format
    const target = [
      setId,                                                                   // [0]  setId
      Boolean(imported),                                                       // [1]  imported
      nowIso(),                                                                // [2]  updatedAt
      toSafeCellString(setMeta?.matchStatus ?? ''),                            // [3]  matchStatus
      Boolean(setMeta?.isTcgdexOnly),                                          // [4]  isTcgdexOnly
      toSafeCellString(setMeta?.vera_id ?? ''),                                // [5]  vera_id
      toSafeCellString(setMeta?.tcgdex_id ?? setMeta?.tcgdexId ?? ''),         // [6]  tcgdex_id
      toSafeCellString(setMeta?.vera_name ?? ''),                              // [7]  vera_name
      toSafeCellString(setMeta?.tcgdex_name ?? setMeta?.tcgdexName ?? ''),     // [8]  tcgdex_name
      toSafeCellString(setMeta?.vera_series ?? ''),                            // [9]  vera_series
      toSafeCellString(setMeta?.tcgdex_serie_name ?? ''),                      // [10] tcgdex_serie_name
      toSafeCellString(setMeta?.tcgdex_serie_id ?? ''),                        // [11] tcgdex_serie_id
      Number(setMeta?.vera_printedTotal) || 0,                                 // [12] vera_printedTotal
      Number(setMeta?.tcgdex_cardCount_official) || 0,                         // [13] tcgdex_cardCount_official
      Number(setMeta?.vera_total) || 0,                                        // [14] vera_total
      Number(setMeta?.tcgdex_cardCount_total) || 0,                            // [15] tcgdex_cardCount_total
      Number(setMeta?.tcgdex_cardCount_holo) || 0,                             // [16] tcgdex_cardCount_holo
      Number(setMeta?.tcgdex_cardCount_reverse) || 0,                          // [17] tcgdex_cardCount_reverse
      Number(setMeta?.tcgdex_cardCount_firstEdition) || 0,                     // [18] tcgdex_cardCount_firstEdition
      Number(setMeta?.tcgdex_cardCount_normal) || 0,                           // [19] tcgdex_cardCount_normal
      toSafeCellString(setMeta?.vera_ptcgoCode ?? ''),                         // [20] vera_ptcgoCode
      toSafeCellString(setMeta?.tcgdex_abbreviation_official ?? ''),           // [21] tcgdex_abbreviation_official
      toSafeCellString(setMeta?.vera_releaseDate ?? ''),                       // [22] vera_releaseDate
      toSafeCellString(setMeta?.tcgdex_releaseDate ?? ''),                     // [23] tcgdex_releaseDate
      toSafeJsonString(setMeta?.vera_legalities),                              // [24] vera_legalities
      toSafeJsonString(setMeta?.tcgdex_legal),                                 // [25] tcgdex_legal
      toPersistableMediaString(setMeta?.vera_images_logo ?? ''),               // [26] vera_images_logo
      toPersistableMediaString(setMeta?.tcgdex_logo ?? ''),                    // [27] tcgdex_logo
      toPersistableMediaString(setMeta?.vera_images_symbol ?? ''),             // [28] vera_images_symbol
      toPersistableMediaString(setMeta?.tcgdex_symbol ?? '')                   // [29] tcgdex_symbol
    ];

    const existingIndices = [];
    rows.forEach((row, rowIndex) => {
      if (toSafeCellString(row[0]).toLowerCase() === setId.toLowerCase()) {
        existingIndices.push(rowIndex);
      }
    });

    if (existingIndices.length > 0) {
      const keepIndex = existingIndices[existingIndices.length - 1];
      const rowNo = keepIndex + 2;
      const existingRow = rows[keepIndex];
      // imported-Status erhalten: altes Format hat imported bei [8], neues bei [1]
      const existingImported = isNewSetFormat(existingRow)
        ? toBoolean(existingRow[1])
        : toBoolean(existingRow[8]);
      target[1] = imported === false ? false : Boolean(imported || existingImported);
      await putValues(buildRange(DB_SHEETS.sets, `A${rowNo}:${colToA1(DB_HEADERS.sets.length)}${rowNo}`), [target]);
      rows[keepIndex] = target;

      if (existingIndices.length > 1) {
        const emptyRow = buildEmptyRow(DB_HEADERS.sets.length);
        const duplicateRanges = existingIndices
          .slice(0, -1)
          .map((index) => ({
            range: buildRange(DB_SHEETS.sets, `A${index + 2}:${colToA1(DB_HEADERS.sets.length)}${index + 2}`),
            values: [emptyRow]
          }));
        await batchPutValues(duplicateRanges);
        existingIndices.slice(0, -1).forEach((index) => {
          rows[index] = emptyRow.slice();
        });
      }
    } else {
      const rowNo = rows.length + 2;
      await putValues(buildRange(DB_SHEETS.sets, `A${rowNo}:${colToA1(DB_HEADERS.sets.length)}${rowNo}`), [target]);
      rows.push(target);
    }
    dbRowsCache.set(`${DB_SHEETS.sets}:${DB_HEADERS.sets.length}`, rows);
  });
}

async function resolveSetIdFromName(setSheetName) {
  await ensureNormalizedSchema();
  const rows = await readDbRows(DB_SHEETS.sets, DB_HEADERS.sets.length);
  const normalizedName = toSafeCellString(setSheetName).toLowerCase();
  const direct = rows.find((row) => {
    if (isNewSetFormat(row)) {
      // neues Format: vera_name=[7], tcgdex_name=[8]
      return toSafeCellString(row[7]).toLowerCase() === normalizedName
        || toSafeCellString(row[8]).toLowerCase() === normalizedName;
    }
    // altes Format: setName=[1]
    return toSafeCellString(row[1]).toLowerCase() === normalizedName;
  });
  if (direct?.[0]) return toSafeCellString(direct[0]);

  const sheets = await resolveSheetNames();
  const overviewRows = await getOverviewRows(sheets).catch(() => []);
  const legacy = overviewRows.find((row) => toSafeCellString(row[1]).toLowerCase() === normalizedName);
  return legacy?.[0] ? toSafeCellString(extractDisplayTextFromHyperlink(legacy[0])) : '';
}

async function writeDbCardsForSet(setId, cards) {
  if (!CONFIG.WRITE_DB_CARDS) return;
  await ensureNormalizedSchema();
  const setRows = cards.map((card) => [
    setId,                                                                     // [0]  setId
    toSafeCellString(card.cardId || card.vera_id || card.tcgdex_id || ''),     // [1]  cardId
    nowIso(),                                                                  // [2]  updatedAt
    toSafeCellString(card.matchStatus ?? ''),                                  // [3]  matchStatus
    Boolean(card.isPrimaryOnly),                                               // [4]  isPrimaryOnly
    Boolean(card.isTcgdexOnly),                                                // [5]  isTcgdexOnly
    toSafeCellString(card.vera_id ?? ''),                                      // [6]  vera_id
    toSafeCellString(card.tcgdex_id ?? ''),                                    // [7]  tcgdex_id
    toSafeCellString(card.vera_number ?? ''),                                  // [8]  vera_number
    toSafeCellString(card.tcgdex_localId ?? ''),                               // [9]  tcgdex_localId
    toSafeCellString(card.vera_name ?? ''),                                    // [10] vera_name
    toSafeCellString(card.tcgdex_name ?? ''),                                  // [11] tcgdex_name
    toPersistableMediaString(card.vera_images_small ?? ''),                    // [12] vera_images_small
    toPersistableMediaString(card.tcgdex_image_small ?? card.tcgdex_image ?? ''), // [13] tcgdex_image_small
    toPersistableMediaString(card.vera_images_large ?? ''),                    // [14] vera_images_large
    toPersistableMediaString(card.tcgdex_image_large ?? ''),                   // [15] tcgdex_image_large
    toSafeCellString(card.vera_cardmarket_url ?? ''),                          // [16] vera_cardmarket_url
    toSafeCellString(card.vera_rarity ?? ''),                                  // [17] vera_rarity
    toSafeCellString(card.vera_hp ?? ''),                                      // [18] vera_hp
    toSafeJsonString(card.vera_types),                                         // [19] vera_types
    toSafeCellString(card.vera_supertype ?? ''),                               // [20] vera_supertype
    toSafeJsonString(card.vera_subtypes),                                      // [21] vera_subtypes
    toSafeCellString(card.vera_evolvesFrom ?? ''),                             // [22] vera_evolvesFrom
    toSafeCellString(card.vera_artist ?? ''),                                  // [23] vera_artist
    toSafeCellString(card.vera_regulationMark ?? ''),                          // [24] vera_regulationMark
    toSafeCellString(card.vera_flavorText ?? ''),                              // [25] vera_flavorText
    toSafeJsonString(card.vera_nationalPokedexNumbers),                        // [26] vera_nationalPokedexNumbers
    Number(card.vera_convertedRetreatCost) || 0,                               // [27] vera_convertedRetreatCost
    toSafeJsonString(card.vera_retreatCost),                                   // [28] vera_retreatCost
    toSafeJsonString(card.vera_legalities),                                    // [29] vera_legalities
    toSafeJsonString(card.vera_abilities),                                     // [30] vera_abilities
    toSafeJsonString(card.vera_attacks),                                       // [31] vera_attacks
    toSafeJsonString(card.vera_weaknesses),                                    // [32] vera_weaknesses
    toSafeJsonString(card.vera_resistances),                                   // [33] vera_resistances
    toSafeJsonString(card.vera_rules)                                          // [34] vera_rules
  ]);
  const currentRows = await readDbRows(DB_SHEETS.cards, DB_HEADERS.cards.length, true, { strict: true });
  const upsertPlan = planSetScopedUpsert({
    rows: currentRows,
    setId,
    incomingRows: setRows,
    clearMissing: true
  });
  await applySetScopedPlan(DB_SHEETS.cards, DB_HEADERS.cards.length, upsertPlan);

  const refreshedRows = await readDbRows(DB_SHEETS.cards, DB_HEADERS.cards.length, true, { strict: true });
  const dedupPlan = planSetScopedDedup({ rows: refreshedRows, setId });
  if (dedupPlan.clearIndices.length > 0) {
    await applySetScopedPlan(DB_SHEETS.cards, DB_HEADERS.cards.length, dedupPlan);
  }
}

/**
 * Kanonische Set-ID + Resolver fuer einen (evtl. Alias-)Set-Schluessel. null, wenn die Registry nicht
 * erreichbar ist oder das Set dort fehlt -> Aufrufer nutzen den exakten Set-ID-Pfad (keine leere Sammlung).
 * Ein uebergebener Resolver ohne geladene Karten (CARDS_NOT_LOADED) wird durch ensureResolverForSet ersetzt.
 */
async function resolveCollectionContext(setKey, resolver = null) {
  const key = toSafeCellString(setKey);
  if (!key) return null;
  const probe = (candidate) => {
    const canonicalSetId = candidate?.resolveSetKey?.(key);
    if (!canonicalSetId) return null;
    // Wirft CARDS_NOT_LOADED, falls die Karten des Sets fehlen.
    candidate.resolve(canonicalSetId, '0');
    return { resolver: candidate, canonicalSetId };
  };
  if (resolver) {
    try {
      const ctx = probe(resolver);
      if (ctx) return ctx;
    } catch (err) {
      if (err?.code !== 'CARDS_NOT_LOADED') throw err;
    }
  }
  try {
    return probe(await ensureResolverForSet(key));
  } catch (err) {
    console.warn('[sheets-db] Registry nicht verfuegbar, Sammlung ohne Aliase:', err?.message || err);
    return null;
  }
}

function collectionKeyOfCard(card, ctx) {
  const explicit = toSafeCellString(card?.collectionKey);
  if (explicit) return explicit;
  const number = toSafeCellString(card?.number);
  if (!number) return '';
  const hit = ctx ? ctx.resolver.resolve(ctx.canonicalSetId, number) : null;
  return hit?.collectionKey || normalizeCardNumber(number);
}

/**
 * Schreibt db_collection-Zeilen fuer die Karten eines Sets (Schluessel: card.collectionKey).
 * - Zeilen unter Alias-Set-IDs bleiben unangetastet; nichts wird umbenannt.
 * - Bestehende Zeilen unter der kanonischen Set-ID werden mit dem ODER-Status der Karte synchronisiert
 *   (nur bei Abweichung, eigener Zeilenschluessel bleibt).
 * - Karten ohne jede Zeile bekommen eine neue Zeile [kanonischeSetId, collectionKey, ...].
 *   Karten, die nur unter Aliasen Zeilen haben, bekommen keine Doppelzeile.
 * - clearMissing nur fuer Zeilen unter der kanonischen Set-ID, deren cardId ein kanonischer
 *   collectionKey ist, der nicht importiert wird, und nur ohne Haken (kein Haken geht verloren).
 */
// Plan und Schreiben unter der Blatt-Sperre von db_collection mit frischem strict-Read: Zellen-Writes
// (updateCellBooleansBatch) laufen ueber dieselbe Sperre, ein paralleles Abwaehlen kann also nicht von
// einer Vollzeilen-Aktualisierung aus einem frueheren Lesestand ueberschrieben werden.
// Status: Hat die Karte frische Zeilen, gilt deren Stand (db_collection ist massgeblich, Legacy-Grids sind
// beim Lesen von existingMap bereits migriert). existingMap (frueher gelesen, evtl. veraltet) zaehlt nur fuer
// Karten ohne frische Zeile; so loescht ein Cache keinen Haken und setzt keinen veralteten.
async function writeDbCollectionForSet(setId, cards, existingMap = new Map(), { resolver = null } = {}) {
  await ensureNormalizedSchema();
  const ctx = await resolveCollectionContext(setId, resolver);
  const C = DB_SHEETS.collection;
  const N = DB_HEADERS.collection.length;

  await withSheetAppendLock(C, async () => {
    const currentRows = await readDbRows(C, N, true, { strict: true });

    if (!ctx) {
      // Ohne Registry: exakter Set-ID-Pfad, ohne Leeren/Deduplizieren (nichts loeschen).
      // Wie bisher die rohe Kartennummer schreiben (z. B. 'GG01'), damit bestehende Zeilen exakt getroffen
      // und keine Doppelzeilen angehaengt werden.
      const currentExact = buildExactSetCollectionMap(currentRows, setId);
      const setRows = cards.map((card) => {
        const rawText = toSafeCellString(card?.number) || toSafeCellString(card?.collectionKey);
        const lookup = normalizeCardNumber(rawText);
        const current = currentExact.get(lookup);
        const source = current || existingMap?.get?.(lookup) || existingMap?.get?.(toSafeCellString(card?.collectionKey));
        const g = Boolean(source?.g);
        const rh = Boolean(source?.rh && g);
        return [setId, rawText, g, rh, nowIso()];
      }).filter((row) => row[1]);
      const upsertPlan = planSetScopedUpsert({ rows: currentRows, setId, incomingRows: setRows, clearMissing: false });
      upsertPlan.clearIndices = [];
      await applySetScopedPlan(C, N, upsertPlan, { lockedRows: currentRows });
      return;
    }

    const canonicalSetId = ctx.canonicalSetId;
    const canonicalLower = canonicalSetId.toLowerCase();
    const { map: currentMap } = buildCollectionMap(currentRows, ctx);
    const isCanonicalCell = (cell) => cell.setKey.toLowerCase() === canonicalLower;

    const incomingKeys = new Set();
    const updates = [];
    const appendRows = [];
    for (const card of cards || []) {
      const key = collectionKeyOfCard(card, ctx);
      if (!key || incomingKeys.has(key)) continue;
      incomingKeys.add(key);
      const current = currentMap.get(key);
      const cells = current?.cells || [];
      if (cells.length === 0) {
        const existing = existingMap?.get?.(key);
        const g = Boolean(existing?.g);
        appendRows.push([canonicalSetId, key, g, Boolean(existing?.rh && g), nowIso()]);
        continue;
      }
      // Frischer Stand (ODER ueber alle Zeilen der Karte) wird in die kanonischen Zeilen uebernommen.
      const g = Boolean(current.g);
      const rh = Boolean(current.rh && g);
      cells.filter(isCanonicalCell).forEach((cell) => {
        if (cell.g === g && cell.rhRaw === rh) return;
        updates.push({ rowIndex: cell.rowNo - 2, rowValues: [cell.setKey, cell.cardKey, g, rh, nowIso()] });
      });
    }

    const clearIndices = [];
    for (const [key, entry] of currentMap) {
      if (incomingKeys.has(key) || entry.orphan) continue;
      entry.cells.forEach((cell) => {
        if (!isCanonicalCell(cell) || cell.cardKey !== key) return;
        if (cell.g || cell.rhRaw) return;
        clearIndices.push(cell.rowNo - 2);
      });
    }

    await applySetScopedPlan(C, N, {
      updates,
      appendRows,
      clearIndices: clearIndices.sort((a, b) => a - b)
    }, { lockedRows: currentRows });
  });
}

/**
 * Gibt alle importierten Sets aus dem "Sets Overview"-Sheet zurÃ¼ck.
 * Liest Spalten Aâ€“J (Formeln fÃ¼r HYPERLINK-IDs nÃ¶tig).
 * @returns {Promise<Array<{setId, setName, series, releaseDate, totalCards, ptcgoCode, imported}>>}
 */
export async function listImportedSets() {
  const all = await listSetsOverviewData();
  return all.filter((item) => item.setId && item.setName && item.imported);
}

/**
 * Liest Karten fÃ¼r ein Set direkt aus db_cards.
 * Wird fÃ¼r performante, API-arme SuchlÃ¤ufe verwendet.
 * @param {string} setId
 * @returns {Promise<Array<{number, name, image, cardmarketUrl, rarity}>>}
 */
export async function readDbCardsForSet(setId) {
  await ensureNormalizedSchema();
  const normalizedSetId = toSafeCellString(setId).toLowerCase();
  if (!normalizedSetId) return [];

  const rows = await readDbRows(DB_SHEETS.cards, DB_HEADERS.cards.length);
  const latestPerCard = new Map();
  rows.forEach((row) => {
    if (toSafeCellString(row[0]).toLowerCase() !== normalizedSetId) return;
    const cardId = toSafeCellString(row[1] || row[2]);
    if (!cardId) return;
    latestPerCard.set(cardId, row);
  });

  const cards = Array.from(latestPerCard.values())
    .map((row) => {
      if (isNewCardFormat(row)) {
        // CARD_DB_HEADERS format; unterstÃ¼tzt altes Bild-Schema (ohne tcgdex_image_large) rÃ¼ckwÃ¤rtskompatibel.
        const hasSplitImageSchema = isCardImageSplitFormat(row);
        const offset = hasSplitImageSchema ? 1 : 0;
        return resolveDisplayCard({
          cardId:                      toSafeCellString(row[1]),
          updatedAt:                   toSafeCellString(row[2]),
          matchStatus:                 toSafeCellString(row[3]),
          isPrimaryOnly:               toBoolean(row[4]),
          isTcgdexOnly:                toBoolean(row[5]),
          vera_id:                     toSafeCellString(row[6]),
          tcgdex_id:                   toSafeCellString(row[7]),
          vera_number:                 toSafeCellString(row[8]),
          tcgdex_localId:              toSafeCellString(row[9]),
          vera_name:                   toSafeCellString(row[10]),
          tcgdex_name:                 toSafeCellString(row[11]),
          vera_images_small:           toSafeCellString(row[12]),
          tcgdex_image_small:          toSafeCellString(row[13]),
          vera_images_large:           toSafeCellString(row[14]),
          tcgdex_image_large:          hasSplitImageSchema ? toSafeCellString(row[15]) : '',
          vera_cardmarket_url:         toSafeCellString(row[15 + offset]),
          vera_rarity:                 toSafeCellString(row[16 + offset]),
          vera_hp:                     toSafeCellString(row[17 + offset]),
          vera_types:                  tryParseJson(row[18 + offset], []),
          vera_supertype:              toSafeCellString(row[19 + offset]),
          vera_subtypes:               tryParseJson(row[20 + offset], []),
          vera_evolvesFrom:            toSafeCellString(row[21 + offset]),
          vera_artist:                 toSafeCellString(row[22 + offset]),
          vera_regulationMark:         toSafeCellString(row[23 + offset]),
          vera_flavorText:             toSafeCellString(row[24 + offset]),
          vera_nationalPokedexNumbers: tryParseJson(row[25 + offset], []),
          vera_convertedRetreatCost:   Number(row[26 + offset]) || 0,
          vera_retreatCost:            tryParseJson(row[27 + offset], []),
          vera_legalities:             tryParseJson(row[28 + offset], null),
          vera_abilities:              tryParseJson(row[29 + offset], []),
          vera_attacks:                tryParseJson(row[30 + offset], []),
          vera_weaknesses:             tryParseJson(row[31 + offset], []),
          vera_resistances:            tryParseJson(row[32 + offset], []),
          vera_rules:                  tryParseJson(row[33 + offset], [])
        });
      }
      // Legacy format (pre-CARD_DB_HEADERS): display fields at [2-15], vera_* at [20-44]
      return resolveDisplayCard({
        number:                      toSafeCellString(row[2] || row[1]),
        name:                        toSafeCellString(row[3]),
        image:                       toSafeCellString(row[4]),
        imageUrl:                    toSafeCellString(row[4]),
        cardmarketUrl:               toSafeCellString(row[5]),
        rarity:                      toSafeCellString(row[6]),
        hp:                          toSafeCellString(row[7]),
        types:                       tryParseJson(row[8], []),
        supertype:                   toSafeCellString(row[9]),
        subtypes:                    tryParseJson(row[10], []),
        evolvesFrom:                 toSafeCellString(row[11]),
        artist:                      toSafeCellString(row[12]),
        regulationMark:              toSafeCellString(row[13]),
        rules:                       tryParseJson(row[14], null),
        flavorText:                  toSafeCellString(row[15]),
        matchStatus:                 toSafeCellString(row[17]),
        isPrimaryOnly:               toBoolean(row[18]),
        isTcgdexOnly:                toBoolean(row[19]),
        vera_id:                     toSafeCellString(row[20]),
        vera_name:                   toSafeCellString(row[21]),
        vera_supertype:              toSafeCellString(row[22]),
        vera_subtypes:               tryParseJson(row[23], []),
        vera_level:                  toSafeCellString(row[24]),
        vera_hp:                     toSafeCellString(row[25]),
        vera_types:                  tryParseJson(row[26], []),
        vera_evolvesFrom:            toSafeCellString(row[27]),
        vera_abilities:              tryParseJson(row[28], []),
        vera_attacks:                tryParseJson(row[29], []),
        vera_weaknesses:             tryParseJson(row[30], []),
        vera_resistances:            tryParseJson(row[31], []),
        vera_retreatCost:            tryParseJson(row[32], []),
        vera_convertedRetreatCost:   Number(row[33]) || 0,
        vera_number:                 toSafeCellString(row[34]),
        vera_artist:                 toSafeCellString(row[35]),
        vera_rarity:                 toSafeCellString(row[36]),
        vera_flavorText:             toSafeCellString(row[37]),
        vera_nationalPokedexNumbers: tryParseJson(row[38], []),
        vera_legalities:             tryParseJson(row[39], null),
        vera_regulationMark:         toSafeCellString(row[40]),
        vera_rules:                  tryParseJson(row[41], []),
        vera_images_small:           toSafeCellString(row[42]),
        vera_images_large:           toSafeCellString(row[43]),
        vera_cardmarket_url:         toSafeCellString(row[44])
        // tcgdex_* not available in legacy format (were never written)
      });
    })
    .filter((card) => card.number)
    .map((card) => ({ ...card, collectionKey: dbCardCollectionKey(card, normalizedSetId) }));
  // Gespeicherte URLs stammen teils vom alten Namens-Matcher (z. B. me55-150 -> "Pikachu [Store Up]"):
  // die v3-ID aus search-index.json gewinnt fuer Link und Preis. Das Sheet wird dabei nicht geschrieben.
  return withV3CardmarketIds(cards, { setId: normalizedSetId, language: getCardLanguage() });
}

// db_cards ist nur noch Offline-Fallback. Ab v3 ist cardId = v3-id `<setId>-<collectionKey>`; aeltere Zeilen
// (pokemontcg-IDs, z. B. `swsh12pt5gg-GG01`) fallen auf die normalisierte Nummer zurueck – denselben
// Schluessel nutzt die Sammlungs-Map ohne Registry.
function dbCardCollectionKey(card, normalizedSetId) {
  const cardId = toSafeCellString(card?.cardId);
  const prefix = `${normalizedSetId}-`;
  if (cardId.toLowerCase().startsWith(prefix) && cardId.length > prefix.length) {
    // Alle Registry-collectionKeys sind Fixpunkte von normalizeCardNumber (geprueft ueber api/registry).
    return normalizeCardNumber(cardId.slice(prefix.length));
  }
  return normalizeCardNumber(card?.number);
}

/**
 * Gibt ALLE Sets (auch nicht importierte) mit vollstÃ¤ndigen Metadaten zurÃ¼ck.
 * NÃ¼tzlich zum Anzeigen einer vollstÃ¤ndigen Set-Liste.
 * Overview-/db_sets-Zeilen unter Alias-Set-IDs (z. B. `swsh12pt5gg`, `TCGDEX-me05`) werden dem kanonischen
 * Set zugeordnet (`imported` per ODER) und nicht als eigenes Set geliefert; jedes Set traegt `aliases`.
 * Im Sheet wird dabei nichts geaendert. Registry nicht erreichbar -> Zeilen unveraendert.
 * @returns {Promise<Array<{setId, setName, series, releaseDate, totalCards, ptcgoCode, imported, aliases}>>}
 */
export async function listSetsOverviewData() {
  const rawSets = await readRawSetsOverviewData();
  let resolver = null;
  try {
    resolver = await ensureSetResolver();
  } catch (err) {
    console.warn('[sheets-db] Registry nicht verfuegbar, Overview ohne Alias-Zuordnung:', err?.message || err);
  }
  return mergeAliasOverviewSets(rawSets, resolver);
}

/**
 * Liest db_sets in den Zeilen-Cache, ohne Serien zu gruppieren. loadSets ruft das parallel zum Laden der
 * DE-Serien-Map auf; die Gruppierung (resolveDisplaySet) folgt erst, wenn die Map registriert ist.
 */
export async function prefetchSetsOverviewRows() {
  await ensureNormalizedSchema();
  await readDbRows(DB_SHEETS.sets, DB_HEADERS.sets.length);
}

async function readRawSetsOverviewData() {
  await ensureNormalizedSchema();
  const dbRows = await readDbRows(DB_SHEETS.sets, DB_HEADERS.sets.length);
  const dbSets = dbRows
    .filter((row) => row[0])
    .map((row) => {
      if (isNewSetFormat(row)) {
        return resolveDisplaySet({
          setId:                        toSafeCellString(row[0]),
          imported:                     toBoolean(row[1]),
          updatedAt:                    toSafeCellString(row[2]),
          matchStatus:                  toSafeCellString(row[3]),
          isTcgdexOnly:                 toBoolean(row[4]),
          vera_id:                      toSafeCellString(row[5]),
          tcgdex_id:                    toSafeCellString(row[6]),
          vera_name:                    toSafeCellString(row[7]),
          tcgdex_name:                  toSafeCellString(row[8]),
          vera_series:                  toSafeCellString(row[9]),
          tcgdex_serie_name:            toSafeCellString(row[10]),
          tcgdex_serie_id:              toSafeCellString(row[11]),
          vera_printedTotal:            Number(row[12]) || 0,
          tcgdex_cardCount_official:    Number(row[13]) || 0,
          vera_total:                   Number(row[14]) || 0,
          tcgdex_cardCount_total:       Number(row[15]) || 0,
          tcgdex_cardCount_holo:        Number(row[16]) || 0,
          tcgdex_cardCount_reverse:     Number(row[17]) || 0,
          tcgdex_cardCount_firstEdition: Number(row[18]) || 0,
          tcgdex_cardCount_normal:      Number(row[19]) || 0,
          vera_ptcgoCode:               toSafeCellString(row[20]),
          tcgdex_abbreviation_official: toSafeCellString(row[21]),
          vera_releaseDate:             toSafeCellString(row[22]),
          tcgdex_releaseDate:           toSafeCellString(row[23]),
          vera_legalities:              tryParseJson(row[24], null),
          tcgdex_legal:                 tryParseJson(row[25], null),
          vera_images_logo:             toSafeCellString(row[26]),
          tcgdex_logo:                  toSafeCellString(row[27]),
          vera_images_symbol:           toSafeCellString(row[28]),
          tcgdex_symbol:                toSafeCellString(row[29])
        });
      }
      // Legacy format (pre-SET_DB_HEADERS)
      return resolveDisplaySet({
        setId:                 toSafeCellString(row[0]),
        setName:               toSafeCellString(row[1]),
        series:                toSafeCellString(row[2]),
        releaseDate:           toSafeCellString(row[3]),
        totalCards:            Number(row[4]) || 0,
        ptcgoCode:             toSafeCellString(row[5]),
        logoUrl:               toSafeCellString(row[6]),
        symbolUrl:             toSafeCellString(row[7]),
        imported:              toBoolean(row[8]),
        tcgdexId:              toSafeCellString(row[10]),
        tcgdexName:            toSafeCellString(row[11]),
        legalities:            tryParseJson(row[12], null),
        cardCountTotal:        Number(row[13]) || 0,
        cardCountHolo:         Number(row[14]) || 0,
        cardCountReverse:      Number(row[15]) || 0,
        cardCountFirstEdition: Number(row[16]) || 0,
        cardCountNormal:       Number(row[17]) || 0,
        matchStatus:           toSafeCellString(row[18]),
        isTcgdexOnly:          toBoolean(row[19]),
        vera_id:               toSafeCellString(row[20]),
        vera_name:             toSafeCellString(row[21]),
        vera_series:           toSafeCellString(row[22]),
        vera_printedTotal:     Number(row[23]) || 0,
        vera_total:            Number(row[24]) || 0,
        vera_ptcgoCode:        toSafeCellString(row[25]),
        vera_releaseDate:      toSafeCellString(row[26]),
        vera_updatedAt:        toSafeCellString(row[27]),
        vera_legalities:       tryParseJson(row[28], null),
        vera_images_symbol:    toSafeCellString(row[29]),
        vera_images_logo:      toSafeCellString(row[30]),
        tcgdex_id:             toSafeCellString(row[31]),
        tcgdex_name:           toSafeCellString(row[32])
      });
    })
    .filter((item) => item.setId && item.setName);
  if (dbSets.length > 0) {
    return dbSets;
  }

  const sheets = await resolveSheetNames();
  const rows = await getOverviewRows(sheets);
  return rows
    .filter((row) => row[0])  // Mindestens eine ID
    .map((row) => ({
      setId:       extractDisplayTextFromHyperlink(row[0]),
      setName:     row[1] || '',
      logoUrl:     extractImageUrl(row[2]),
      symbolUrl:   extractImageUrl(row[3]),
      series:      row[4] || '',
      releaseDate: row[5] || '',
      totalCards:  row[6] ? Number(row[6]) : 0,
      ptcgoCode:   row[7] || '',
      imported:    toBoolean(row[CONFIG.GRID.IMPORTED_COL_INDEX - 1])
    }));
}

/**
 * Liest den aktuellen Stand der Collection Summary.
 * @returns {Promise<Array<{setName, total, collected, rh, percent, ptcgoCode}>>}
 */
/**
 * Zaehler je kanonischem Set (kleingeschrieben) aus db_collection.
 * - Sets, deren Zeilen nur unter einem Set-Schluessel liegen: Dedupe per normalizeCardNumber(cardId) –
 *   ohne Registry-Karten (lazy).
 * - Sets mit Zeilen unter mehreren Aliasen: Registry-Karten nur dieses Sets laden und per collectionKey
 *   deduplizieren (buildCollectionMap; g = ODER ueber alle Zeilen). Mehrdeutige Altzeilen zaehlen als eine Karte.
 * Registry nicht erreichbar -> rohe Set-IDs wie bisher.
 */
async function aggregateCollectionCounts(collectionRows, setsResolver) {
  const groups = new Map(); // canonicalLower -> { canonical, setKeys:Set, rows: [] }
  const memo = new Map();
  (collectionRows || []).forEach((row) => {
    const setKey = toSafeCellString(row?.[0]);
    if (!setKey || !toSafeCellString(row?.[1])) return;
    const lowerKey = setKey.toLowerCase();
    let canonical = memo.get(lowerKey);
    if (canonical === undefined) {
      canonical = setsResolver?.resolveSetKey?.(setKey) || setKey;
      memo.set(lowerKey, canonical);
    }
    const key = canonical.toLowerCase();
    if (!groups.has(key)) groups.set(key, { canonical, setKeys: new Set(), rows: [] });
    const group = groups.get(key);
    group.setKeys.add(lowerKey);
    group.rows.push(row);
  });

  const agg = new Map();
  for (const [key, group] of groups) {
    const counts = { total: 0, collected: 0, rh: 0 };
    let counted = false;
    if (setsResolver && group.setKeys.size > 1) {
      try {
        const resolver = await ensureResolverForSet(group.canonical);
        // Zeilenindizes spielen fuer die Zaehlung keine Rolle.
        const { map } = buildCollectionMap(group.rows, { canonicalSetId: group.canonical, resolver });
        const seenAmbiguous = new Set();
        for (const entry of map.values()) {
          if (entry.cells?.length) {
            counts.total += 1;
            if (entry.g) counts.collected += 1;
            if (entry.rh) counts.rh += 1;
          } else if (entry.ambiguous && !seenAmbiguous.has(entry.ambiguous)) {
            seenAmbiguous.add(entry.ambiguous);
            counts.total += 1;
            if (entry.ambiguous.g) counts.collected += 1;
            if (entry.ambiguous.rh) counts.rh += 1;
          }
        }
        counted = true;
      } catch (err) {
        console.warn('[readSummarySheet] Registry-Karten nicht verfuegbar, Zaehlung ohne Alias-Dedupe:', group.canonical, err?.message || err);
      }
    }
    if (!counted) {
      const perCard = new Map();
      group.rows.forEach((row) => {
        const cardKey = `${toSafeCellString(row[0]).toLowerCase()}::${normalizeCardNumber(toSafeCellString(row[1]))}`;
        const g = toBoolean(row[2]);
        const rh = toBoolean(row[3]) && g;
        const previous = perCard.get(cardKey) || { g: false, rh: false };
        perCard.set(cardKey, { g: previous.g || g, rh: previous.rh || rh });
      });
      perCard.forEach(({ g, rh }) => {
        counts.total += 1;
        if (g) counts.collected += 1;
        if (rh) counts.rh += 1;
      });
    }
    agg.set(key, counts);
  }
  return agg;
}

export async function readSummarySheet() {
  await ensureNormalizedSchema();
  const setRows = await readDbRows(DB_SHEETS.sets, DB_HEADERS.sets.length);
  const collectionRows = await readDbRows(DB_SHEETS.collection, DB_HEADERS.collection.length);

  if (setRows.length > 0 || collectionRows.length > 0) {
    const setsById = new Map();
    setRows.forEach((row) => {
      const setId = toSafeCellString(row[0]);
      if (!setId) return;
      if (isNewSetFormat(row)) {
        const resolved = resolveDisplaySet({
          setId,
          vera_name:              toSafeCellString(row[7]),
          vera_total:             Number(row[14]) || 0,
          vera_ptcgoCode:         toSafeCellString(row[20]),
          tcgdex_name:            toSafeCellString(row[8]),
          tcgdex_cardCount_total: Number(row[15]) || 0
        });
        setsById.set(setId, {
          setName:   resolved.setName   || '',
          ptcgoCode: resolved.ptcgoCode || '',
          imported:  toBoolean(row[1]),
          totalMeta: resolved.totalCards || 0
        });
      } else {
        setsById.set(setId, {
          setName:   toSafeCellString(row[1]),
          ptcgoCode: toSafeCellString(row[5]),
          imported:  toBoolean(row[8]),
          totalMeta: Number(row[4]) || 0
        });
      }
    });

    // Alias-faehig: Zeilen und db_sets-Zeilen unter Alias-IDs (z. B. swsh12pt5gg) zaehlen zum kanonischen Set;
    // eine Karte mit Zeilen unter mehreren Aliasen zaehlt einmal (gesammelt, wenn irgendeine Zeile g hat).
    const setsResolver = await ensureSetResolver().catch(() => null);
    const canonicalKey = (setId) => (setsResolver?.resolveSetKey?.(setId) || setId).toLowerCase();
    const agg = await aggregateCollectionCounts(collectionRows, setsResolver);

    const canonicalMeta = new Map();
    for (const [setId, meta] of setsById.entries()) {
      const key = canonicalKey(setId);
      const isCanonicalRow = key === setId.toLowerCase();
      const canonicalSetId = setsResolver?.resolveSetKey?.(setId) || setId;
      const current = canonicalMeta.get(key);
      if (!current) {
        canonicalMeta.set(key, { ...meta, isCanonicalRow, canonicalSetId });
      } else {
        const imported = current.imported || meta.imported;
        canonicalMeta.set(key, isCanonicalRow && !current.isCanonicalRow
          ? { ...meta, imported, isCanonicalRow, canonicalSetId }
          : { ...current, imported });
      }
    }

    const result = [];
    for (const [key, meta] of canonicalMeta.entries()) {
      if (!meta.imported) continue;
      const counts = agg.get(key) || { total: 0, collected: 0, rh: 0 };
      const total = counts.total || meta.totalMeta || 0;
      const collected = counts.collected || 0;
      const rh = counts.rh || 0;
      result.push({
        setId: meta.canonicalSetId,
        setName: meta.setName,
        total,
        collected,
        rh,
        percent: total > 0 ? Math.round((collected / total) * 10000) / 100 : 0,
        ptcgoCode: meta.ptcgoCode
      });
    }

    if (result.length > 0) {
      return result.sort((a, b) => a.setName.localeCompare(b.setName));
    }
  }

  const sheets = await resolveSheetNames();
  if (!sheets.summary) {
    return [];
  }
  let rows = [];
  try {
    rows = await getValues(buildRange(sheets.summary, 'A4:G'));
  } catch (err) {
    console.warn('[readSummarySheet] Summary sheet not readable, returning empty summary', err);
    return [];
  }
  return rows
    .filter((row) => row[0])
    .map((row) => ({
      setName:   String(row[0]).trim(),
      total:     Number(row[1]) || 0,
      collected: Number(row[2]) || 0,
      rh:        Number(row[3]) || 0,
      percent:   parseFloat(row[4]) || 0,
      ptcgoCode: row[5] ? String(row[5]).trim() : ''
    }));
}

/** Hilfsfunktion: Extrahiert die URL aus einer =IMAGE("...") Formel. */
function extractImageUrl(value) {
  if (!value) return '';
  const text = String(value).trim();
  if (!text || /pokeball-fallback\.svg/i.test(text)) return '';
  const match = /=IMAGE\("([^"]+)"/.exec(text);
  if (match && !/pokeball-fallback\.svg/i.test(match[1])) return match[1];
  if (/^https?:\/\//i.test(text)) return text;
  return '';
}

function buildOverviewRowValues(setMeta, imported = false) {
  const meta = (setMeta?.setName || setMeta?.logoUrl)
    ? setMeta
    : resolveDisplaySet(setMeta);
  return [[
    toSafeCellString(meta.setId ?? setMeta.setId),
    toSafeCellString(meta.setName),
    toPersistableMediaString(meta.logoUrl),
    toPersistableMediaString(meta.symbolUrl),
    toSafeCellString(meta.series),
    toSafeCellString(meta.releaseDate),
    Number(meta.totalCards) || 0,
    toSafeCellString(meta.ptcgoCode),
    Boolean(imported),
    false
  ]];
}

async function clearValues(range) {
  if (!gapi?.client?.sheets?.spreadsheets?.values?.clear) return;
  await enqueueSheetsMutation(async () => {
    await gapi.client.sheets.spreadsheets.values.clear({
      spreadsheetId: CONFIG.SPREADSHEET_ID,
      range
    });
  });
}

async function upsertOverviewEntry(setMeta, imported = true) {
  await upsertDbSet(setMeta, imported);

  const sheets = await resolveSheetNames();
  if (!sheets.overview) return;
  // Pro Blatt serialisiert: Zielzeile aus dem aktuellen Stand nach vorherigen Writes.
  await withSheetAppendLock(sheets.overview, async () => {
    const overviewRange = buildRange(sheets.overview, 'A3:J');
    const rows = await getFormulas(overviewRange).catch(rowsOrThrowUnlessMissing);
    const normalizedTargetId = toSafeCellString(setMeta.setId).toLowerCase();

    let targetRow = -1;
    for (let index = 0; index < rows.length; index++) {
      const rowSetId = extractDisplayTextFromHyperlink(rows[index]?.[0]);
      if (toSafeCellString(rowSetId).toLowerCase() === normalizedTargetId) {
        targetRow = 3 + index;
        break;
      }
    }

    if (targetRow < 0) {
      targetRow = Math.max(4, 3 + rows.length);
    }

    await putValues(buildRange(sheets.overview, `A${targetRow}:J${targetRow}`), buildOverviewRowValues(setMeta, imported));
  });
}

export async function upsertOverviewSet(setMeta, imported = false) {
  await upsertOverviewEntry(setMeta, imported);
}

/**
 * Nach dem Loeschen eines Sets: bestehende Alias-Zeilen (db_sets und Overview, z. B. `swsh12pt5gg`,
 * `TCGDEX-me05`) mit imported=true auf false setzen, sonst ODERn mergeAliasOverviewSets/syncOverviewWithApiSets
 * den Status wieder aufs kanonische Set. Nur die imported-Zelle wird geschrieben; keine Zeile wird geloescht
 * oder angelegt. Aliase: setMeta.aliases + mergedAliasIds + Registry (falls erreichbar).
 * @returns {Promise<{ dbSets: number, overview: number }>} Anzahl geaenderter Zeilen
 */
export async function markAliasSetRowsNotImported(setMeta) {
  const own = toSafeCellString(setMeta?.setId).toLowerCase();
  const result = { dbSets: 0, overview: 0 };
  if (!own) return result;
  const aliasKeys = new Set([
    ...setAliasKeys(setMeta),
    ...(Array.isArray(setMeta?.mergedAliasIds) ? setMeta.mergedAliasIds : []).map((id) => toSafeCellString(id).toLowerCase())
  ]);
  try {
    const resolver = await ensureSetResolver();
    const canonical = resolver.resolveSetKey(setMeta.setId) || setMeta.setId;
    // Kanonisches Set samt Aliasen nur, wenn das geloeschte Set das kanonische (gemergte) ist; ein ungemergt
    // unter eigener Alias-ID gezeigtes Set darf den Status des kanonischen Sets nicht loeschen.
    if (toSafeCellString(canonical).toLowerCase() === own) {
      (resolver.aliasesOf(canonical) || []).forEach((alias) => aliasKeys.add(toSafeCellString(alias).toLowerCase()));
    }
  } catch (err) {
    console.warn('[sheets-db] Registry nicht verfuegbar, Alias-Zeilen nur aus Set-Metadaten:', err?.message || err);
  }
  aliasKeys.delete(own);
  aliasKeys.delete('');
  if (!aliasKeys.size) return result;

  await ensureNormalizedSchema();
  await withSheetAppendLock(DB_SHEETS.sets, async () => {
    const rows = await readDbRows(DB_SHEETS.sets, DB_HEADERS.sets.length, true, { strict: true });
    const updates = [];
    rows.forEach((row, index) => {
      if (!aliasKeys.has(toSafeCellString(row?.[0]).toLowerCase())) return;
      const col = isNewSetFormat(row) ? 1 : 8; // imported: neues Format [1], altes Format [8]
      if (!toBoolean(row[col])) return;
      updates.push({ range: buildRange(DB_SHEETS.sets, `${colToA1(col + 1)}${index + 2}`), values: [[false]] });
      row[col] = false;
    });
    if (updates.length) await batchPutValues(updates);
    dbRowsCache.set(`${DB_SHEETS.sets}:${DB_HEADERS.sets.length}`, rows);
    result.dbSets = updates.length;
  });

  const sheets = await resolveSheetNames();
  if (!sheets.overview) return result;
  await withSheetAppendLock(sheets.overview, async () => {
    const rows = await getOverviewRows(sheets).catch(rowsOrThrowUnlessMissing);
    const col = CONFIG.GRID.IMPORTED_COL_INDEX;
    const updates = [];
    rows.forEach((row, index) => {
      const setId = toSafeCellString(extractDisplayTextFromHyperlink(row?.[0])).toLowerCase();
      if (!aliasKeys.has(setId) || !toBoolean(row?.[col - 1])) return;
      updates.push({ range: buildRange(sheets.overview, `${colToA1(col)}${3 + index}`), values: [[false]] });
    });
    if (updates.length) await batchPutValues(updates);
    result.overview = updates.length;
  });
  return result;
}

// Kleingeschriebene Alias-IDs eines API-Sets (fetchAllAvailableSets liefert `aliases`), ohne die eigene ID.
function setAliasKeys(set) {
  const own = toSafeCellString(set?.setId).toLowerCase();
  return (Array.isArray(set?.aliases) ? set.aliases : [])
    .map((alias) => toSafeCellString(alias).toLowerCase())
    .filter((alias) => alias && alias !== own);
}

/**
 * Schreibt API-Sets nach db_sets und in die Overview. Bestehende Zeilen (auch unter Alias-IDs) bleiben
 * erhalten; ein `imported` einer Alias-Zeile wird per ODER auf das kanonische Set uebertragen.
 */
export async function syncOverviewWithApiSets(sets, importedSetIds = []) {
  await ensureNormalizedSchema();
  const normalizedImported = new Set(Array.from(importedSetIds).map((id) => toSafeCellString(id).toLowerCase()));

  await withSheetAppendLock(DB_SHEETS.sets, async () => {
    const dbRows = await readDbRows(DB_SHEETS.sets, DB_HEADERS.sets.length, false, { strict: true });
    const mergedById = new Map();
    dbRows.forEach((row) => {
      const key = toSafeCellString(row[0]).toLowerCase();
      if (!key) return;
      mergedById.set(key, row);
    });

    const rowImported = (row) => Boolean(row?.length) && (isNewSetFormat(row) ? toBoolean(row[1]) : toBoolean(row[8]));
    for (const set of (sets || [])) {
      const key = toSafeCellString(set?.setId).toLowerCase();
      if (!key) continue;
      const existing = mergedById.get(key) || [];
      // Alias-Zeilen (z. B. swsh12pt5gg) bleiben stehen; ihr imported geht per ODER auf das kanonische Set.
      const aliasImported = setAliasKeys(set).some((alias) => rowImported(mergedById.get(alias)));
      mergedById.set(key, [
        toSafeCellString(set.setId),                                                                                                                     // [0]  setId
        Boolean(normalizedImported.has(key) || rowImported(existing) || aliasImported),                                                                // [1]  imported
        nowIso(),                                                                                                                                         // [2]  updatedAt
        toSafeCellString(set.matchStatus ?? ''),                                                                                                          // [3]  matchStatus
        Boolean(set.isTcgdexOnly),                                                                                                                        // [4]  isTcgdexOnly
        toSafeCellString(set.vera_id ?? ''),                                                                                                              // [5]  vera_id
        toSafeCellString(set.tcgdex_id ?? set.tcgdexId ?? ''),                                                                                           // [6]  tcgdex_id
        toSafeCellString(set.vera_name ?? ''),                                                                                                            // [7]  vera_name
        toSafeCellString(set.tcgdex_name ?? set.tcgdexName ?? ''),                                                                                       // [8]  tcgdex_name
        toSafeCellString(set.vera_series ?? ''),                                                                                                          // [9]  vera_series
        toSafeCellString(set.tcgdex_serie_name ?? '') || toSafeCellString(existing[10] ?? ''),                                                           // [10] tcgdex_serie_name       (bewahre bestehenden Wert wenn neu leer)
        toSafeCellString(set.tcgdex_serie_id ?? '') || toSafeCellString(existing[11] ?? ''),                                                             // [11] tcgdex_serie_id         (bewahre bestehenden Wert wenn neu leer)
        Number(set.vera_printedTotal) || 0,                                                                                                              // [12] vera_printedTotal
        Number(set.tcgdex_cardCount_official) || 0,                                                                                                      // [13] tcgdex_cardCount_official
        Number(set.vera_total) || 0,                                                                                                                      // [14] vera_total
        Number(set.tcgdex_cardCount_total) || 0,                                                                                                         // [15] tcgdex_cardCount_total
        Number(set.tcgdex_cardCount_holo) || 0,                                                                                                          // [16] tcgdex_cardCount_holo
        Number(set.tcgdex_cardCount_reverse) || 0,                                                                                                       // [17] tcgdex_cardCount_reverse
        Number(set.tcgdex_cardCount_firstEdition) || 0,                                                                                                  // [18] tcgdex_cardCount_firstEdition
        Number(set.tcgdex_cardCount_normal) || 0,                                                                                                        // [19] tcgdex_cardCount_normal
        toSafeCellString(set.vera_ptcgoCode ?? ''),                                                                                                       // [20] vera_ptcgoCode
        toSafeCellString(set.tcgdex_abbreviation_official ?? '') || toSafeCellString(existing[21] ?? ''),                                                // [21] tcgdex_abbreviation_official (bewahre bestehenden Wert wenn neu leer)
        toSafeCellString(set.vera_releaseDate ?? ''),                                                                                                     // [22] vera_releaseDate
        toSafeCellString(set.tcgdex_releaseDate ?? '') || toSafeCellString(existing[23] ?? ''),                                                          // [23] tcgdex_releaseDate      (bewahre bestehenden Wert wenn neu leer)
        toSafeJsonString(set.vera_legalities),                                                                                                            // [24] vera_legalities
        toSafeJsonString(set.tcgdex_legal) || toSafeJsonString(existing[25]),                                                                            // [25] tcgdex_legal            (bewahre bestehenden Wert wenn neu leer/null)
        toSafeCellString(set.vera_images_logo ?? ''),                                                                                                     // [26] vera_images_logo
        toSafeCellString(set.tcgdex_logo ?? '') || toSafeCellString(existing[27] ?? ''),                                                                 // [27] tcgdex_logo             (bewahre bestehenden Wert wenn neu leer)
        toSafeCellString(set.vera_images_symbol ?? '')                                                                                                    // [28] vera_images_symbol
      ]);
    }

    await rewriteDbRows(DB_SHEETS.sets, DB_HEADERS.sets.length, Array.from(mergedById.values()));
  });

  const sheets = await resolveSheetNames();
  if (!sheets.overview) return;
  await withSheetAppendLock(sheets.overview, async () => {
    const rows = await getOverviewRows(sheets).catch(rowsOrThrowUnlessMissing);

    const rowBySetId = new Map();
    rows.forEach((row, index) => {
      const setId = toSafeCellString(extractDisplayTextFromHyperlink(row[0])).toLowerCase();
      if (!setId) return;
      rowBySetId.set(setId, {
        rowIndex: 3 + index,
        imported: toBoolean(row[CONFIG.GRID.IMPORTED_COL_INDEX - 1])
      });
    });

    const appendValues = [];
    const updates = [];
    const uniqueSets = new Map();
    (sets || []).forEach((set) => {
      const key = toSafeCellString(set?.setId).toLowerCase();
      if (key) uniqueSets.set(key, set);
    });

    uniqueSets.forEach((set, key) => {
      const existing = rowBySetId.get(key);
      const imported = normalizedImported.has(key) || Boolean(existing?.imported)
        || setAliasKeys(set).some((alias) => Boolean(rowBySetId.get(alias)?.imported));
      const rowValues = buildOverviewRowValues(set, imported)[0];

      if (existing) {
        updates.push({ rowIndex: existing.rowIndex, rowValues });
      } else {
        appendValues.push(rowValues);
      }
    });

    if (updates.length) {
      await batchPutValues(updates.map((update) => ({
        range: buildRange(sheets.overview, `A${update.rowIndex}:J${update.rowIndex}`),
        values: [update.rowValues]
      })));
    }

    if (appendValues.length) {
      const start = Math.max(4, 3 + rows.length);
      const end = start + appendValues.length - 1;
      await putValues(buildRange(sheets.overview, `A${start}:J${end}`), appendValues);
    }
  });
}

/**
 * Importiert ein Set in die Sammlung:
 * - trÃ¤gt/aktualisiert das Set in der Overview
 * - erstellt (falls nÃ¶tig) das Set-Blatt
 * - schreibt das Karten-Grid gemÃ¤ÃŸ pokecode-Schema
 */
export async function importSetIntoCollection(setMeta, cards) {
  if (!setMeta?.setId || !setMeta?.setName) {
    throw new Error('Set-Metadaten unvollstÃ¤ndig (setId/setName fehlen).');
  }
  if (!Array.isArray(cards) || cards.length === 0) {
    throw new Error(`Keine Karten fÃ¼r Set ${setMeta.setId} gefunden.`);
  }

  const setId = toSafeCellString(setMeta.setId);
  const setName = toSafeCellString(setMeta.setName);

  // setId explizit: Zeilen unter allen Aliasen zaehlen, auch wenn db_sets das Set (noch) nicht kennt.
  // Legacy-Grid-Blatt: zuerst unter dem bisherigen Overview-Namen suchen (v3 kann den Anzeigenamen aendern,
  // das alte Blatt heisst weiter wie bisher), dann unter dem neuen Namen.
  let existingMap = new Map();
  for (const name of await legacyGridSheetNames(setId, setName)) {
    existingMap = await readSetCollectionMap(name, { setId }).catch(() => new Map());
    if (existingMap.size > 0) break;
  }
  await upsertDbSet({ ...setMeta, setId, setName }, true);
  await writeDbCardsForSet(setId, cards);
  await writeDbCollectionForSet(setId, cards, existingMap);

  await upsertOverviewEntry({
    ...setMeta,
    setName,
    totalCards: Number(setMeta.totalCards) || cards.length
  });
}

/**
 * Blattnamen fuer den Legacy-Grid-Fallback eines Imports: bestehender Overview-Name des Sets (falls vorhanden)
 * vor dem neuen Anzeigenamen. Fehlende Overview -> nur der neue Name; andere Lesefehler brechen den Import
 * vor jedem Write ab (wie die uebrigen strikten Lesungen des Imports).
 */
async function legacyGridSheetNames(setId, newName) {
  const names = [];
  const sheets = await resolveSheetNames();
  const rows = sheets?.overview ? await getOverviewRows(sheets).catch(rowsOrThrowUnlessMissing) : [];
  const wanted = toSafeCellString(setId).toLowerCase();
  const row = rows.find((r) => toSafeCellString(extractDisplayTextFromHyperlink(r?.[0])).toLowerCase() === wanted);
  const existingName = toSafeCellString(row?.[1]);
  if (existingName) names.push(existingName);
  if (!names.includes(newName)) names.push(newName);
  return names;
}

async function readLegacySetCollectionMap(setSheetName) {
  const sheets = await resolveSheetNames().catch(() => null);
  if (Array.isArray(sheets?.titles) && !sheets.titles.includes(setSheetName)) {
    return new Map();
  }

  const totalCols = CONFIG.GRID.CARDS_PER_ROW * CONFIG.GRID.BLOCK_WIDTH;
  const endColumn = colToA1(totalCols);
  let values = [];
  try {
    values = await getValues(buildRange(setSheetName, `A3:${endColumn}2000`), 'UNFORMATTED_VALUE', true);
  } catch (err) {
    if (isInvalidRangeError(err)) return new Map();
    throw err;
  }

  const map = new Map();
  for (let rowBlock = 0; rowBlock < values.length; rowBlock += CONFIG.GRID.BLOCK_HEIGHT) {
    for (let colBlock = 0; colBlock < CONFIG.GRID.CARDS_PER_ROW; colBlock++) {
      const baseCol = colBlock * CONFIG.GRID.BLOCK_WIDTH;
      const idRaw = values[rowBlock]?.[baseCol];
      if (!idRaw) continue;

      const displayId = String(idRaw).trim();
      const normalizedId = normalizeCardNumber(displayId);
      const g = toBoolean(values[rowBlock + 2]?.[baseCol]);
      const rh = toBoolean(values[rowBlock + 2]?.[baseCol + 1]);

      const idRow = CONFIG.GRID.HEADER_ROWS + 1 + rowBlock;
      const checkRow = idRow + 2;
      map.set(normalizedId, {
        displayId,
        g,
        rh,
        gCell: { row: checkRow, col: baseCol + 1 },
        rhCell: { row: checkRow, col: baseCol + 2 }
      });
    }
  }
  return map;
}

// Alter Pfad ohne Registry: nur Zeilen mit exakt dieser Set-ID, Schluessel normalizeCardNumber(cardId).
function buildExactSetCollectionMap(rows, setId) {
  const map = new Map();
  const setLower = toSafeCellString(setId).toLowerCase();
  (rows || []).forEach((row, index) => {
    if (toSafeCellString(row?.[0]).toLowerCase() !== setLower) return;
    const displayId = toSafeCellString(row?.[1]);
    if (!displayId) return;
    const normalizedId = normalizeCardNumber(displayId);
    const g = toBoolean(row[2]);
    const rhRaw = toBoolean(row[3]);
    const rh = rhRaw && g;
    const rowNo = index + 2;
    const cell = {
      setKey: toSafeCellString(row[0]),
      cardKey: displayId,
      rowNo,
      g,
      rh,
      rhRaw,
      gCell: { row: rowNo, col: 3 },
      rhCell: { row: rowNo, col: 4 }
    };
    // Wie bisher gewinnt die letzte Zeile; alle Zeilen bleiben als Zellen erhalten.
    const cells = [...(map.get(normalizedId)?.cells || []), cell];
    map.set(normalizedId, {
      collectionKey: normalizedId,
      displayId,
      g,
      rh,
      cells,
      gCell: cell.gCell,
      rhCell: cell.rhCell
    });
  });
  return map;
}

async function resolveCollectionSetKey(setSheetName, options) {
  const explicit = toSafeCellString(options?.setId);
  if (explicit) return explicit;
  return resolveSetIdFromName(setSheetName);
}

// none=true nur, wenn sicher feststeht: keine db_collection-Zeile unter irgendeinem Alias des Sets und kein
// Legacy-Set-Blatt. Bei jedem Zweifel (Registry/Sheets-Metadaten nicht lesbar) false -> normaler Pfad.
// rows: die dabei gelesenen db_collection-Zeilen (null, wenn nicht gelesen), damit der Aufrufer nicht
// ein zweites Mal liest (bei fresh waere das ein zweiter voller Sheets-Read).
async function hasNoCollectionSource(setSheetName, setKey, { strict = false, fresh = false } = {}) {
  let setsOnly = null;
  try {
    setsOnly = await ensureSetResolver();
  } catch {
    return { none: false, rows: null };
  }
  const canonical = setsOnly?.resolveSetKey?.(setKey);
  if (!canonical) return { none: false, rows: null };
  const readRows = await readDbRows(DB_SHEETS.collection, DB_HEADERS.collection.length, fresh, { strict });
  // Nur eine erfolgreiche Lesung (landet im Cache) weiterreichen; ein nicht-strikter Fehler liefert [].
  const rows = dbRowsCache.get(`${DB_SHEETS.collection}:${DB_HEADERS.collection.length}`) === readRows ? readRows : null;
  if (collectCollectionSetIds(readRows, setsOnly).has(canonical.toLowerCase())) return { none: false, rows };
  const sheets = await resolveSheetNames().catch(() => null);
  if (!Array.isArray(sheets?.titles)) return { none: false, rows };
  return { none: !sheets.titles.includes(setSheetName), rows };
}

/**
 * Verwirft die gecachten db_collection-Zeilen; die naechste Lesung holt den aktuellen Stand.
 * Fuer Gesamt-Leser wie den Backup-Restore: einmal invalidieren, dann ohne `fresh` je Set lesen
 * (ein voller Sheets-Read statt einem je Set).
 */
export function invalidateCollectionRowCache() {
  invalidateSheetRowCache(DB_SHEETS.collection);
}

/**
 * Kanonische Set-IDs (kleingeschrieben), unter denen db_collection-Zeilen existieren – ueber alle Aliase,
 * ohne Registry-Karten zu laden. `checkedOnly`: nur Zeilen mit g=true. Fuer Gesamt-Leser (Backup,
 * Sammelkandidaten), damit sie readSetCollectionMap nur fuer Sets mit Zeilen aufrufen.
 * Registry nicht erreichbar -> rohe Set-IDs.
 */
export async function listCollectionSetIds({ checkedOnly = false, strict = false } = {}) {
  await ensureNormalizedSchema();
  // strict: Lesefehler werfen statt [] (z. B. Backup-Export: nie ein unvollstaendiges Backup schreiben).
  const rows = await readDbRows(DB_SHEETS.collection, DB_HEADERS.collection.length, false, { strict });
  // strict: ein Registry-Fehler wird durchgereicht (rohe IDs wuerden Alias-Zeilen dem falschen Set zuordnen).
  const resolver = strict ? await ensureSetResolver() : await ensureSetResolver().catch(() => null);
  return collectCollectionSetIds(rows, resolver, { checkedOnly });
}

/**
 * Sammlungs-Map eines Sets: Map<collectionKey, { collectionKey, displayId, g, rh, cells, gCell, rhCell, ambiguous? }>.
 * Beruecksichtigt db_collection-Zeilen unter allen Registry-Aliasen des kanonischen Sets (Spec §5.2/§7.1);
 * g/rh = ODER ueber alle Zeilen der Karte. Mehrdeutige Altzeilen (§5.3) stehen nur unter `ambiguous`.
 * Ohne Zeilen greift der Legacy-Grid-Fallback; migrierte Zeilen werden unter der kanonischen Set-ID
 * mit collectionKey angehaengt.
 * @param {string} setSheetName Set-Name (Set-Blatt / db_sets / Overview)
 * @param {{ setId?: string, resolver?: object, strict?: boolean }} [options] setId darf ein Alias sein;
 *   strict: Lesefehler von db_collection werfen statt einer leeren Map (Backup-Export);
 *   fresh: db_collection neu lesen statt aus dem Cache (Backup-Restore plant gegen den aktuellen Stand)
 */
export async function readSetCollectionMap(setSheetName, options = {}) {
  await ensureNormalizedSchema();
  const setKey = await resolveCollectionSetKey(setSheetName, options);
  if (!setKey) return new Map();

  // Lazy: Registry-Karten (~27 KB/Set) nur fuer Sets laden, die Zeilen (unter irgendeinem Alias) oder ein
  // Legacy-Set-Blatt haben. Gesamt-Leser (Backup, Datencheck, Sammelkandidaten) laden so nur, was noetig ist.
  const strict = Boolean(options?.strict);
  const fresh = Boolean(options?.fresh);
  let sourceRows = null;
  if (!options?.resolver) {
    const source = await hasNoCollectionSource(setSheetName, setKey, { strict, fresh });
    if (source.none) return new Map();
    sourceRows = source.rows;
  }

  const ctx = await resolveCollectionContext(setKey, options?.resolver || null);
  const values = sourceRows || await readDbRows(DB_SHEETS.collection, DB_HEADERS.collection.length, fresh, { strict });

  if (!ctx) {
    const map = buildExactSetCollectionMap(values, setKey);
    if (map.size > 0) return map;
    // Pro Set gesperrt: parallele Erst-Lesungen duerfen das Legacy-Grid nicht doppelt migrieren.
    return withLegacyMigrationLock(setKey.toLowerCase(), async () => {
      const again = buildExactSetCollectionMap(await readDbRows(DB_SHEETS.collection, DB_HEADERS.collection.length, true, { strict: true }), setKey);
      if (again.size > 0) return again;
      const legacy = await readLegacySetCollectionMap(setSheetName).catch(() => new Map());
      if (legacy.size === 0) return again;
      await appendDbRows(DB_SHEETS.collection, DB_HEADERS.collection.length, Array.from(legacy.values()).map((entry) => [
        setKey,
        toSafeCellString(entry.displayId),
        Boolean(entry.g),
        Boolean(entry.rh && entry.g),
        nowIso()
      ]));
      const refreshed = await readDbRows(DB_SHEETS.collection, DB_HEADERS.collection.length, true);
      return buildExactSetCollectionMap(refreshed, setKey);
    });
  }

  const { map, stats } = buildCollectionMap(values, ctx);
  if (stats.matchedRows > 0) return map;
  return withLegacyMigrationLock(ctx.canonicalSetId.toLowerCase(), () => migrateLegacyGrid(setSheetName, setKey, ctx));
}

async function migrateLegacyGrid(setSheetName, setKey, ctx) {
  // Unter der Sperre erneut pruefen: eine parallele Lesung kann schon migriert haben (Cache wird beim Anhaengen fortgeschrieben).
  const current = buildCollectionMap(await readDbRows(DB_SHEETS.collection, DB_HEADERS.collection.length, true, { strict: true }), ctx);
  if (current.stats.matchedRows > 0) return current.map;
  const map = current.map;

  const legacy = await readLegacySetCollectionMap(setSheetName).catch(() => new Map());
  if (legacy.size === 0) return map;

  // Alte Grid-Nummern: zuerst im Namensraum des kanonischen Sets, dann im Namensraum des Set-Schluessels.
  const legacyKey = (displayId) => {
    const hit = ctx.resolver.resolve(ctx.canonicalSetId, displayId)
      || (setKey.toLowerCase() !== ctx.canonicalSetId.toLowerCase() ? ctx.resolver.resolve(setKey, displayId) : null);
    return hit?.collectionKey || normalizeCardNumber(displayId);
  };
  const legacyRows = [];
  const seen = new Set();
  for (const entry of legacy.values()) {
    const key = legacyKey(toSafeCellString(entry.displayId));
    if (!key || seen.has(key)) continue;
    seen.add(key);
    legacyRows.push([ctx.canonicalSetId, key, Boolean(entry.g), Boolean(entry.rh && entry.g), nowIso()]);
  }

  await appendDbRows(DB_SHEETS.collection, DB_HEADERS.collection.length, legacyRows);
  const refreshed = await readDbRows(DB_SHEETS.collection, DB_HEADERS.collection.length, true);
  return buildCollectionMap(refreshed, ctx).map;
}

/**
 * Liefert den Sammlungs-Eintrag einer Karte (mit allen Zellen, ueber Aliase). Fehlt jede Zeile, wird
 * [kanonischeSetId, collectionKey, false, false, now] angehaengt. Mehrdeutige Altzeilen zaehlen nicht als
 * Zeile der Karte (sie bleiben unveraendert).
 * @param {string} setSheetName
 * @param {string} collectionKey kanonischer Schluessel (alte Kartennummern werden ueber die Registry aufgeloest)
 * @param {{ setId?: string, resolver?: object }} [options]
 */
export async function ensureCollectionEntry(setSheetName, collectionKey, options = {}) {
  await ensureNormalizedSchema();
  const setKey = await resolveCollectionSetKey(setSheetName, options);
  if (!setKey) {
    throw new Error(`Set-ID für „${setSheetName}“ konnte nicht aufgelöst werden.`);
  }

  const ctx = await resolveCollectionContext(setKey, options?.resolver || null);
  const rawKey = toSafeCellString(collectionKey);
  const C = DB_SHEETS.collection;
  const N = DB_HEADERS.collection.length;

  if (!ctx) {
    const normalizedCard = normalizeCardNumber(rawKey);
    // Pruefen und Anhaengen unter der Blatt-Sperre: frische Zeilen, keine parallelen Doppel-/Ueberschreib-Zeilen.
    return withSheetAppendLock(C, async () => {
      const currentRows = await readDbRows(C, N, true, { strict: true });
      const existing = buildExactSetCollectionMap(currentRows, setKey).get(normalizedCard);
      if (existing) return existing;
      const next = await appendRowsUnlocked(C, N, currentRows, [[setKey, rawKey, false, false, nowIso()]]);
      const created = buildExactSetCollectionMap(next, setKey).get(normalizedCard);
      if (!created) throw new Error(`Collection-Eintrag für Karte ${collectionKey} konnte nicht erstellt werden.`);
      return created;
    });
  }

  const hit = rawKey ? ctx.resolver.resolve(ctx.canonicalSetId, rawKey) : null;
  if (!hit && rawKey) {
    // Alter mehrdeutiger Schluessel (§5.3): nie eine weitere mehrdeutige Zeile anhaengen, sondern die
    // Migration (Task 7) ausloesen lassen.
    const amb = ctx.resolver.ambiguous(ctx.canonicalSetId, rawKey);
    if (amb) {
      const err = new Error(`Kartenschlüssel „${rawKey}“ ist mehrdeutig (${amb.collectionKeys.join(', ')}).`);
      err.code = 'AMBIGUOUS_LEGACY_KEY';
      err.setId = amb.setId;
      err.legacyKey = amb.legacyKey;
      err.collectionKeys = [...amb.collectionKeys];
      throw err;
    }
  }
  const writeKey = hit?.collectionKey || rawKey;
  const lookupKey = hit?.collectionKey || normalizeCardNumber(rawKey);
  if (!writeKey) throw new Error('Collection-Eintrag ohne Kartenschlüssel.');

  return withSheetAppendLock(C, async () => {
    const currentRows = await readDbRows(C, N, true, { strict: true });
    const existing = buildCollectionMap(currentRows, ctx).map.get(lookupKey);
    if (existing?.cells?.length) return existing;
    const next = await appendRowsUnlocked(C, N, currentRows, [[ctx.canonicalSetId, writeKey, false, false, nowIso()]]);
    const created = buildCollectionMap(next, ctx).map.get(lookupKey);
    if (!created?.cells?.length) {
      throw new Error(`Collection-Eintrag für Karte ${collectionKey} konnte nicht erstellt werden.`);
    }
    return created;
  });
}

function withLegacyMigrationLock(key, task) {
  const previous = legacyMigrationLocks.get(key) || Promise.resolve();
  const run = previous.catch(() => undefined).then(task);
  const tail = run.catch(() => undefined);
  legacyMigrationLocks.set(key, tail);
  tail.then(() => {
    if (legacyMigrationLocks.get(key) === tail) legacyMigrationLocks.delete(key);
  });
  return run;
}

// Gecachte db_collection-Zeilen nach Zell-Writes mitfuehren, damit ein erneutes Lesen nicht den alten
// Stand liefert (z. B. Abwaehlen ueber mehrere Zeilen einer Karte).
function patchCollectionRowCache(updates) {
  const rows = dbRowsCache.get(`${DB_SHEETS.collection}:${DB_HEADERS.collection.length}`);
  if (!Array.isArray(rows)) return;
  for (const { row, col, value } of updates) {
    const target = rows[row - 2];
    if (!Array.isArray(target)) continue;
    while (target.length < col) target.push('');
    target[col - 1] = Boolean(value);
  }
}

export async function updateCellBoolean(sheetName, row, col, value) {
  await ensureNormalizedSchema();
  const useNormalizedCollection = Number(row) >= 2 && (Number(col) === 3 || Number(col) === 4);
  const targetSheet = useNormalizedCollection ? DB_SHEETS.collection : sheetName;
  await ensureSheetCapacity(targetSheet, Number(row), Number(col));
  const a1 = buildRange(targetSheet, `${colToA1(col)}${row}`);
  await putValues(a1, [[Boolean(value)]]);
  if (useNormalizedCollection) patchCollectionRowCache([{ row: Number(row), col: Number(col), value }]);
}

export async function updateCellBooleansBatch(sheetName, updates = [], { chunkSize = 250 } = {}) {
  await ensureNormalizedSchema();
  const normalizedUpdates = (updates || [])
    .map((entry) => ({
      row: Number(entry?.row),
      col: Number(entry?.col),
      value: Boolean(entry?.value)
    }))
    .filter((entry) => Number.isFinite(entry.row) && entry.row >= 1 && Number.isFinite(entry.col) && entry.col >= 1);

  if (!normalizedUpdates.length) return 0;

  const groupedByTargetSheet = new Map();
  normalizedUpdates.forEach((entry) => {
    const useNormalizedCollection = entry.row >= 2 && (entry.col === 3 || entry.col === 4);
    const targetSheet = useNormalizedCollection ? DB_SHEETS.collection : sheetName;
    if (!groupedByTargetSheet.has(targetSheet)) groupedByTargetSheet.set(targetSheet, []);
    groupedByTargetSheet.get(targetSheet).push(entry);
  });

  for (const [targetSheet, targetUpdates] of groupedByTargetSheet.entries()) {
    const writeTarget = async () => {
      const maxRow = Math.max(...targetUpdates.map((entry) => entry.row));
      const maxCol = Math.max(...targetUpdates.map((entry) => entry.col));
      await ensureSheetCapacity(targetSheet, maxRow, maxCol);

      for (let start = 0; start < targetUpdates.length; start += chunkSize) {
        const chunk = targetUpdates.slice(start, start + chunkSize);
        await batchPutValues(chunk.map((entry) => ({
          range: buildRange(targetSheet, `${colToA1(entry.col)}${entry.row}`),
          values: [[Boolean(entry.value)]]
        })));
        if (targetSheet === DB_SHEETS.collection) patchCollectionRowCache(chunk);
      }
    };
    // db_collection-Zellen ueber dieselbe Sperre wie Anhaengen/Import (writeDbCollectionForSet): kein Import-Plan
    // aus einem aelteren Lesestand kann ein paralleles Abwaehlen ueberschreiben. Nie innerhalb dieser Sperre aufrufen.
    if (targetSheet === DB_SHEETS.collection) await withSheetAppendLock(targetSheet, writeTarget);
    else await writeTarget();
  }

  return normalizedUpdates.length;
}

export async function ensureSettingsSheet() {
  const sheets = await resolveSheetNames();
  const sheetMeta = await gapi.client.sheets.spreadsheets.get({
    spreadsheetId: CONFIG.SPREADSHEET_ID
  });
  const exists = (sheetMeta.result.sheets || []).some(
    (s) => s.properties?.title === sheets.settings
  );

  if (!exists) {
    await gapi.client.sheets.spreadsheets.batchUpdate({
      spreadsheetId: CONFIG.SPREADSHEET_ID,
      resource: {
        requests: [{ addSheet: { properties: { title: CONFIG.SHEETS.SETTINGS } } }]
      }
    });
    resolvedSheetsCache = null;
    const refreshed = await resolveSheetNames();
    await putValues(buildRange(refreshed.settings, 'A1:B1'), [['key', 'value']]);
  }
}

export async function readSettings() {
  await ensureSettingsSheet();
  const sheets = await resolveSheetNames();
  const rows = await getValues(buildRange(sheets.settings, 'A2:B'));
  const settings = {};
  rows.forEach((r) => {
    if (r[0]) settings[r[0]] = r[1] || '';
  });
  return settings;
}

export async function writeSetting(key, value) {
  await ensureSettingsSheet();
  const sheets = await resolveSheetNames();
  const keys = await getValues(buildRange(sheets.settings, 'A2:A'));
  const existingIndex = keys.findIndex((r) => r[0] === key);

  if (existingIndex >= 0) {
    await putValues(buildRange(sheets.settings, `B${existingIndex + 2}`), [[value]]);
  } else {
    const nextRow = keys.length + 2;
    await putValues(buildRange(sheets.settings, `A${nextRow}:B${nextRow}`), [[key, value]]);
  }
}

/**
 * Reads the legacy overview sheet and returns the set IDs of all rows previously
 * marked as imported (column I / index 8).
 * Used for one-time migration when db_sets was reset and imported flags were lost.
 * @returns {Promise<Set<string>>}
 */
export async function recoverImportedIdsFromOverview() {
  const sheets = await resolveSheetNames();
  const rows = await getOverviewRows(sheets);
  const importedCol = CONFIG.GRID.IMPORTED_COL_INDEX - 1; // 0-based (col I = index 8)
  const ids = new Set(
    rows
      .filter((row) => row[0] && toBoolean(row[importedCol]))
      .map((row) => extractDisplayTextFromHyperlink(row[0]))
      .filter(Boolean)
  );
  return ids;
}

