import { CONFIG } from '../core/config.js';
import { signIn } from '../core/auth.js';
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
  resolveDisplayCard
} from './schema-contract.js?v=20260504d';

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
      // Blatt passt nicht für dieses Schema – ignorieren
    }
  }
  return best.score > 0 ? best.title : null;
}

async function resolveSheetNames() {
  if (resolvedSheetsCache) return resolvedSheetsCache;

  if (!gapi?.client?.sheets?.spreadsheets?.get) {
    throw new Error('Sheets API nicht initialisiert – bitte zuerst anmelden.');
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
    ['Set Overview', 'Pokémon TCG Sets Übersicht', 'Pokemon TCG Sets Übersicht', 'Sets Übersicht'],
    (name) => (name.includes('set') || name.includes('sets')) && (name.includes('overview') || name.includes('übersicht'))
  );
  if (!overview) {
    overview = await detectOverviewByContent(nonDbTitles);
  }

  const summary = pickSheetTitle(
    nonDbTitles,
    CONFIG.SHEETS.SUMMARY,
    ['Summary', 'Collection', 'Sammlungsübersicht'],
    (name) => name.includes('summary') || name.includes('zusammenfassung') || name.includes('sammlung')
  );

  resolvedSheetsCache = {
    overview: overview || null,
    summary: summary || null,
    settings,
    titles
  };
  console.log('[resolveSheetNames]', resolvedSheetsCache);
  return resolvedSheetsCache;
}

function isInvalidRangeError(err) {
  const message = String(err?.result?.error?.message || err?.message || '').toLowerCase();
  return err?.status === 400 || message.includes('invalid_argument') || message.includes('unable to parse range');
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
        console.log('[getOverviewRows] fallback overview selected:', title);
        return rows;
      } catch {
        // nächstes Blatt probieren
      }
    }

    throw err;
  }
}

async function getValues(range, renderOption = 'UNFORMATTED_VALUE', suppressErrorLog = false) {
  const maxRetries = 6;
  try {
    if (!gapi?.client?.sheets?.spreadsheets?.values?.get) {
      throw new Error('Sheets API nicht initialisiert – bitte melden Sie sich an');
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

// Formeln müssen mit FORMULA gelesen werden (z.B. HYPERLINK in Overview)
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

function emitWriteEvent(type, detail) {
  if (typeof window === 'undefined' || !window.dispatchEvent || typeof CustomEvent === 'undefined') return;
  window.dispatchEvent(new CustomEvent(type, { detail }));
}

async function putValues(range, values) {
  const maxRetries = 6;
  let reauthedOnce = false;
  try {
    if (!gapi?.client?.sheets?.spreadsheets?.values?.update) {
      throw new Error('Sheets API nicht initialisiert – bitte melden Sie sich an');
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
          emitWriteEvent('sheets-write-success', {
            range,
            attemptsUsed: attempt + 1,
            maxRetries
          });
          return;
        } catch (err) {
          if (isAuthWriteError(err) && !reauthedOnce) {
            reauthedOnce = true;
            const reauthed = await signIn({ forceConsent: true }).catch(() => false);
            if (reauthed) {
              emitWriteEvent('sheets-write-retry', {
                range,
                attempt: attempt + 1,
                maxRetries,
                delayMs: 0,
                status: Number(err?.status || err?.result?.error?.code || 0) || null
              });
              continue;
            }
          }
          if (!isRetryableWriteError(err) || attempt >= maxRetries) throw err;
          const delay = Math.min(10000, 500 * Math.pow(2, attempt)) + Math.floor(Math.random() * 150);
          emitWriteEvent('sheets-write-retry', {
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
    emitWriteEvent('sheets-write-failed', {
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
          emitWriteEvent('sheets-write-success', {
            range: rangeLabel,
            attemptsUsed: attempt + 1,
            maxRetries
          });
          return;
        } catch (err) {
          if (isAuthWriteError(err) && !reauthedOnce) {
            reauthedOnce = true;
            const reauthed = await signIn({ forceConsent: true }).catch(() => false);
            if (reauthed) {
              emitWriteEvent('sheets-write-retry', {
                range: rangeLabel,
                attempt: attempt + 1,
                maxRetries,
                delayMs: 0,
                status: Number(err?.status || err?.result?.error?.code || 0) || null
              });
              continue;
            }
          }
          if (!isRetryableWriteError(err) || attempt >= maxRetries) throw err;
          const delay = Math.min(10000, 500 * Math.pow(2, attempt)) + Math.floor(Math.random() * 150);
          emitWriteEvent('sheets-write-retry', {
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
    emitWriteEvent('sheets-write-failed', {
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
    throw new Error('Sheets API nicht initialisiert – bitte melden Sie sich an');
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

async function readDbRows(sheetName, columnCount, force = false) {
  const key = `${sheetName}:${columnCount}`;
  if (!force && dbRowsCache.has(key)) {
    return dbRowsCache.get(key);
  }
  const rows = await getValues(buildDataRange(sheetName, columnCount, 2, 200000)).catch(() => []);
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

async function appendDbRows(sheetName, columnCount, rows) {
  if (!Array.isArray(rows) || rows.length === 0) return;
  const existing = await readDbRows(sheetName, columnCount);
  const start = existing.length + 2;
  const end = start + rows.length - 1;
  const endCol = colToA1(columnCount);
  await ensureSheetCapacity(sheetName, end, columnCount);
  await putValues(buildRange(sheetName, `A${start}:${endCol}${end}`), rows);
  dbRowsCache.set(`${sheetName}:${columnCount}`, [...existing, ...rows]);
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

// Format-Erkennung für Rückwärtskompatibilität mit Pre-Schema-Zeilen
function isNewSetFormat(row) {
  // Altes Format: row[1] = setName (kein Boolean)
  // Neues Format: row[1] = imported (Boolean → 'true'/'false')
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
  await ensureNormalizedSchema();
  const setId = toSafeCellString(setMeta?.setId);
  if (!setId) return;

  const rows = await readDbRows(DB_SHEETS.sets, DB_HEADERS.sets.length);
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

  const existingIndex = rows.findIndex((row) => toSafeCellString(row[0]).toLowerCase() === setId.toLowerCase());
  if (existingIndex >= 0) {
    const rowNo = existingIndex + 2;
    const existingRow = rows[existingIndex];
    // imported-Status erhalten: altes Format hat imported bei [8], neues bei [1]
    const existingImported = isNewSetFormat(existingRow)
      ? toBoolean(existingRow[1])
      : toBoolean(existingRow[8]);
    target[1] = imported === false ? false : Boolean(imported || existingImported);
    await putValues(buildRange(DB_SHEETS.sets, `A${rowNo}:${colToA1(DB_HEADERS.sets.length)}${rowNo}`), [target]);
    rows[existingIndex] = target;
  } else {
    const rowNo = rows.length + 2;
    await putValues(buildRange(DB_SHEETS.sets, `A${rowNo}:${colToA1(DB_HEADERS.sets.length)}${rowNo}`), [target]);
    rows.push(target);
  }
  dbRowsCache.set(`${DB_SHEETS.sets}:${DB_HEADERS.sets.length}`, rows);
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
  await appendDbRows(DB_SHEETS.cards, DB_HEADERS.cards.length, setRows);
}

async function writeDbCollectionForSet(setId, cards, existingMap = new Map()) {
  await ensureNormalizedSchema();
  const setRows = cards.map((card) => {
    const key = normalizeCardNumber(card.number);
    const existing = existingMap.get(key);
    const g = Boolean(existing?.g);
    const rh = Boolean(existing?.rh && g);
    return [setId, toSafeCellString(card.number), g, rh, nowIso()];
  });
  await appendDbRows(DB_SHEETS.collection, DB_HEADERS.collection.length, setRows);
}

/**
 * Gibt alle importierten Sets aus dem "Sets Overview"-Sheet zurück.
 * Liest Spalten A–J (Formeln für HYPERLINK-IDs nötig).
 * @returns {Promise<Array<{setId, setName, series, releaseDate, totalCards, ptcgoCode, imported}>>}
 */
export async function listImportedSets() {
  const all = await listSetsOverviewData();
  return all.filter((item) => item.setId && item.setName && item.imported);
}

/**
 * Liest Karten für ein Set direkt aus db_cards.
 * Wird für performante, API-arme Suchläufe verwendet.
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

  return Array.from(latestPerCard.values())
    .map((row) => {
      if (isNewCardFormat(row)) {
        // CARD_DB_HEADERS format; unterstützt altes Bild-Schema (ohne tcgdex_image_large) rückwärtskompatibel.
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
    .filter((card) => card.number);
}

/**
 * Gibt ALLE Sets (auch nicht importierte) mit vollständigen Metadaten zurück.
 * Nützlich zum Anzeigen einer vollständigen Set-Liste.
 * @returns {Promise<Array<{setId, setName, series, releaseDate, totalCards, ptcgoCode, imported}>>}
 */
export async function listSetsOverviewData() {
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

    const latestPerCard = new Map();
    collectionRows.forEach((row) => {
      const setId = toSafeCellString(row[0]);
      const cardId = toSafeCellString(row[1]);
      if (!setId || !cardId) return;
      latestPerCard.set(`${setId}::${cardId}`, row);
    });

    const agg = new Map();
    latestPerCard.forEach((row) => {
      const setId = toSafeCellString(row[0]);
      if (!agg.has(setId)) agg.set(setId, { total: 0, collected: 0, rh: 0 });
      const bucket = agg.get(setId);
      const g = toBoolean(row[2]);
      const rh = toBoolean(row[3]) && g;
      bucket.total += 1;
      if (g) bucket.collected += 1;
      if (rh) bucket.rh += 1;
    });

    const result = [];
    for (const [setId, meta] of setsById.entries()) {
      if (!meta.imported) continue;
      const counts = agg.get(setId) || { total: 0, collected: 0, rh: 0 };
      const total = counts.total || meta.totalMeta || 0;
      const collected = counts.collected || 0;
      const rh = counts.rh || 0;
      result.push({
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
  const overviewRange = buildRange(sheets.overview, 'A3:J');
  const rows = await getFormulas(overviewRange).catch(() => []);
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
}

export async function upsertOverviewSet(setMeta, imported = false) {
  await upsertOverviewEntry(setMeta, imported);
}

export async function syncOverviewWithApiSets(sets, importedSetIds = []) {
  await ensureNormalizedSchema();
  const normalizedImported = new Set(Array.from(importedSetIds).map((id) => toSafeCellString(id).toLowerCase()));

  const dbRows = await readDbRows(DB_SHEETS.sets, DB_HEADERS.sets.length);
  const mergedById = new Map();
  dbRows.forEach((row) => {
    const key = toSafeCellString(row[0]).toLowerCase();
    if (!key) return;
    mergedById.set(key, row);
  });

  for (const set of (sets || [])) {
    const key = toSafeCellString(set?.setId).toLowerCase();
    if (!key) continue;
    const existing = mergedById.get(key) || [];
    mergedById.set(key, [
      toSafeCellString(set.setId),                                                                                                                     // [0]  setId
      Boolean(normalizedImported.has(key) || (isNewSetFormat(existing) ? toBoolean(existing[1]) : toBoolean(existing[8]))),                            // [1]  imported
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

  const sheets = await resolveSheetNames();
  if (!sheets.overview) return;
  const rows = await getOverviewRows(sheets).catch(() => []);

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
    const imported = normalizedImported.has(key) || Boolean(existing?.imported);
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
}

/**
 * Importiert ein Set in die Sammlung:
 * - trägt/aktualisiert das Set in der Overview
 * - erstellt (falls nötig) das Set-Blatt
 * - schreibt das Karten-Grid gemäß pokecode-Schema
 */
export async function importSetIntoCollection(setMeta, cards) {
  if (!setMeta?.setId || !setMeta?.setName) {
    throw new Error('Set-Metadaten unvollständig (setId/setName fehlen).');
  }
  if (!Array.isArray(cards) || cards.length === 0) {
    throw new Error(`Keine Karten für Set ${setMeta.setId} gefunden.`);
  }

  const setId = toSafeCellString(setMeta.setId);
  const setName = toSafeCellString(setMeta.setName);

  const existingMap = await readSetCollectionMap(setName).catch(() => new Map());
  await upsertDbSet({ ...setMeta, setId, setName }, true);
  await writeDbCardsForSet(setId, cards);
  await writeDbCollectionForSet(setId, cards, existingMap);

  await upsertOverviewEntry({
    ...setMeta,
    setName,
    totalCards: Number(setMeta.totalCards) || cards.length
  });
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

export async function readSetCollectionMap(setSheetName) {
  await ensureNormalizedSchema();
  const setId = await resolveSetIdFromName(setSheetName);
  if (!setId) return new Map();

  const values = await readDbRows(DB_SHEETS.collection, DB_HEADERS.collection.length);

  const map = new Map();
  values.forEach((row, index) => {
    if (toSafeCellString(row[0]).toLowerCase() !== setId.toLowerCase()) return;
    const displayId = toSafeCellString(row[1]);
    if (!displayId) return;
    const normalizedId = normalizeCardNumber(displayId);
    const g = toBoolean(row[2]);
    const rh = toBoolean(row[3]) && g;
    const rowNo = index + 2;
    map.set(normalizedId, {
      displayId,
      g,
      rh,
      gCell: { row: rowNo, col: 3 },
      rhCell: { row: rowNo, col: 4 }
    });
  });

  if (map.size > 0) return map;

  const legacy = await readLegacySetCollectionMap(setSheetName).catch(() => new Map());
  if (legacy.size === 0) return map;

  const legacyRows = Array.from(legacy.values()).map((entry) => [
    setId,
    toSafeCellString(entry.displayId),
    Boolean(entry.g),
    Boolean(entry.rh && entry.g),
    nowIso()
  ]);

  await appendDbRows(DB_SHEETS.collection, DB_HEADERS.collection.length, legacyRows);

  const migrated = new Map();
  const refreshed = await readDbRows(DB_SHEETS.collection, DB_HEADERS.collection.length, true);
  refreshed.forEach((row, index) => {
    if (toSafeCellString(row[0]).toLowerCase() !== setId.toLowerCase()) return;
    const displayId = toSafeCellString(row[1]);
    if (!displayId) return;
    const normalizedId = normalizeCardNumber(displayId);
    const g = toBoolean(row[2]);
    const rh = toBoolean(row[3]) && g;
    const rowNo = index + 2;
    migrated.set(normalizedId, {
      displayId,
      g,
      rh,
      gCell: { row: rowNo, col: 3 },
      rhCell: { row: rowNo, col: 4 }
    });
  });

  return migrated;
}

export async function ensureCollectionEntry(setSheetName, cardNumber) {
  await ensureNormalizedSchema();
  const setId = await resolveSetIdFromName(setSheetName);
  if (!setId) {
    throw new Error(`Set-ID für „${setSheetName}“ konnte nicht aufgelöst werden.`);
  }

  const normalizedCard = normalizeCardNumber(cardNumber);
  const currentRows = await readDbRows(DB_SHEETS.collection, DB_HEADERS.collection.length, true);

  const existingIndex = currentRows.findIndex((row) => {
    const rowSetId = toSafeCellString(row[0]).toLowerCase();
    const rowCard = normalizeCardNumber(toSafeCellString(row[1]));
    return rowSetId === setId.toLowerCase() && rowCard === normalizedCard;
  });

  if (existingIndex >= 0) {
    const rowNo = existingIndex + 2;
    return {
      displayId: toSafeCellString(currentRows[existingIndex][1]) || toSafeCellString(cardNumber),
      g: toBoolean(currentRows[existingIndex][2]),
      rh: toBoolean(currentRows[existingIndex][3]),
      gCell: { row: rowNo, col: 3 },
      rhCell: { row: rowNo, col: 4 }
    };
  }

  await appendDbRows(DB_SHEETS.collection, DB_HEADERS.collection.length, [
    [setId, toSafeCellString(cardNumber), false, false, nowIso()]
  ]);

  const refreshedRows = await readDbRows(DB_SHEETS.collection, DB_HEADERS.collection.length, true);
  const newIndex = refreshedRows.findIndex((row) => {
    const rowSetId = toSafeCellString(row[0]).toLowerCase();
    const rowCard = normalizeCardNumber(toSafeCellString(row[1]));
    return rowSetId === setId.toLowerCase() && rowCard === normalizedCard;
  });

  if (newIndex < 0) {
    throw new Error(`Collection-Eintrag für Karte ${cardNumber} konnte nicht erstellt werden.`);
  }

  const rowNo = newIndex + 2;
  return {
    displayId: toSafeCellString(refreshedRows[newIndex][1]) || toSafeCellString(cardNumber),
    g: toBoolean(refreshedRows[newIndex][2]),
    rh: toBoolean(refreshedRows[newIndex][3]),
    gCell: { row: rowNo, col: 3 },
    rhCell: { row: rowNo, col: 4 }
  };
}

export async function updateCellBoolean(sheetName, row, col, value) {
  await ensureNormalizedSchema();
  const useNormalizedCollection = Number(row) >= 2 && (Number(col) === 3 || Number(col) === 4);
  const targetSheet = useNormalizedCollection ? DB_SHEETS.collection : sheetName;
  await ensureSheetCapacity(targetSheet, Number(row), Number(col));
  const a1 = buildRange(targetSheet, `${colToA1(col)}${row}`);
  await putValues(a1, [[Boolean(value)]]);
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
