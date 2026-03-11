import { CONFIG } from './config.js';
import {
  normalizeCardNumber,
  toBoolean,
  extractDisplayTextFromHyperlink,
  colToA1
} from './utils.js';

function quoteSheetName(sheetName) {
  const name = String(sheetName ?? '').replace(/'/g, "''");
  return `'${name}'`;
}

function buildRange(sheetName, a1Range) {
  return `${quoteSheetName(sheetName)}!${a1Range}`;
}

let resolvedSheetsCache = null;

function normalizeName(value) {
  return String(value ?? '').trim().toLowerCase();
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
    fields: 'sheets(properties(title))'
  });

  const titles = (meta.result.sheets || [])
    .map((sheet) => sheet.properties?.title)
    .filter(Boolean);

  let overview = pickSheetTitle(
    titles,
    CONFIG.SHEETS.OVERVIEW,
    ['Set Overview', 'Pokémon TCG Sets Übersicht', 'Pokemon TCG Sets Übersicht', 'Sets Übersicht'],
    (name) => (name.includes('set') || name.includes('sets')) && (name.includes('overview') || name.includes('übersicht'))
  );
  if (!overview) {
    overview = await detectOverviewByContent(titles);
  }

  const summary = pickSheetTitle(
    titles,
    CONFIG.SHEETS.SUMMARY,
    ['Summary', 'Collection', 'Sammlungsübersicht'],
    (name) => name.includes('summary') || name.includes('zusammenfassung') || name.includes('sammlung')
  );

  const settings = pickSheetTitle(
    titles,
    CONFIG.SHEETS.SETTINGS,
    ['Settings', 'WebApp Setting', 'Einstellungen'],
    (name) => name.includes('setting') || name.includes('einstellung')
  ) || CONFIG.SHEETS.SETTINGS;

  resolvedSheetsCache = {
    overview: overview || titles[0] || CONFIG.SHEETS.OVERVIEW,
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

async function getValues(range, renderOption = 'UNFORMATTED_VALUE') {
  try {
    if (!gapi?.client?.sheets?.spreadsheets?.values?.get) {
      throw new Error('Sheets API nicht initialisiert – bitte melden Sie sich an');
    }
    const response = await gapi.client.sheets.spreadsheets.values.get({
      spreadsheetId: CONFIG.SPREADSHEET_ID,
      range,
      valueRenderOption: renderOption
    });
    return response.result.values || [];
  } catch (err) {
    console.error('[getValues]', err);
    throw err;
  }
}

// Formeln müssen mit FORMULA gelesen werden (z.B. HYPERLINK in Overview)
async function getFormulas(range) {
  return getValues(range, 'FORMULA');
}

async function putValues(range, values) {
  try {
    if (!gapi?.client?.sheets?.spreadsheets?.values?.update) {
      throw new Error('Sheets API nicht initialisiert – bitte melden Sie sich an');
    }
    await gapi.client.sheets.spreadsheets.values.update({
      spreadsheetId: CONFIG.SPREADSHEET_ID,
      range,
      valueInputOption: 'USER_ENTERED',
      resource: { values }
    });
  } catch (err) {
    console.error('[putValues]', err);
    throw err;
  }
}

/**
 * Gibt alle importierten Sets aus dem "Sets Overview"-Sheet zurück.
 * Liest Spalten A–J (Formeln für HYPERLINK-IDs nötig).
 * @returns {Promise<Array<{setId, setName, series, releaseDate, totalCards, ptcgoCode, imported}>>}
 */
export async function listImportedSets() {
  const sheets = await resolveSheetNames();
  const rows = await getOverviewRows(sheets);
  return rows
    .map((row) => ({
      setId:       extractDisplayTextFromHyperlink(row[0]),
      setName:     row[1] || '',
      series:      row[4] || '',
      releaseDate: row[5] || '',
      totalCards:  row[6] ? Number(row[6]) : 0,
      ptcgoCode:   row[7] || '',
      imported:    toBoolean(row[CONFIG.GRID.IMPORTED_COL_INDEX - 1])
    }))
    .filter((item) => item.setId && item.setName && item.imported);
}

/**
 * Gibt ALLE Sets (auch nicht importierte) mit vollständigen Metadaten zurück.
 * Nützlich zum Anzeigen einer vollständigen Set-Liste.
 * @returns {Promise<Array<{setId, setName, series, releaseDate, totalCards, ptcgoCode, imported}>>}
 */
export async function listSetsOverviewData() {
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
  const text = String(value);
  const match = /=IMAGE\("([^"]+)"/.exec(text);
  if (match) return match[1];
  if (/^https?:\/\//i.test(text)) return text;
  return '';
}

function toSafeCellString(value) {
  return String(value ?? '').trim();
}

function buildOverviewRowValues(setMeta, imported = false) {
  return [[
    toSafeCellString(setMeta.setId),
    toSafeCellString(setMeta.setName),
    toSafeCellString(setMeta.logoUrl),
    toSafeCellString(setMeta.symbolUrl),
    toSafeCellString(setMeta.series),
    toSafeCellString(setMeta.releaseDate),
    Number(setMeta.totalCards) || 0,
    toSafeCellString(setMeta.ptcgoCode),
    Boolean(imported),
    false
  ]];
}

async function clearValues(range) {
  if (!gapi?.client?.sheets?.spreadsheets?.values?.clear) return;
  await gapi.client.sheets.spreadsheets.values.clear({
    spreadsheetId: CONFIG.SPREADSHEET_ID,
    range
  });
}

async function ensureSetSheet(sheetName) {
  const meta = await gapi.client.sheets.spreadsheets.get({
    spreadsheetId: CONFIG.SPREADSHEET_ID,
    fields: 'sheets(properties(sheetId,title))'
  });

  const existing = (meta.result.sheets || []).find(
    (sheet) => sheet.properties?.title === sheetName
  );
  if (existing) return existing.properties;

  const createRes = await gapi.client.sheets.spreadsheets.batchUpdate({
    spreadsheetId: CONFIG.SPREADSHEET_ID,
    resource: {
      requests: [{ addSheet: { properties: { title: sheetName } } }]
    }
  });

  return createRes.result?.replies?.[0]?.addSheet?.properties || null;
}

function buildCardGridValues(cards, existingMap = new Map()) {
  const cols = CONFIG.GRID.CARDS_PER_ROW * CONFIG.GRID.BLOCK_WIDTH;
  const blocks = Math.max(1, Math.ceil(cards.length / CONFIG.GRID.CARDS_PER_ROW));
  const rows = blocks * CONFIG.GRID.BLOCK_HEIGHT;
  const values = Array.from({ length: rows }, () => Array(cols).fill(''));

  cards.forEach((card, index) => {
    const blockRow = Math.floor(index / CONFIG.GRID.CARDS_PER_ROW);
    const blockCol = index % CONFIG.GRID.CARDS_PER_ROW;
    const baseRow = blockRow * CONFIG.GRID.BLOCK_HEIGHT;
    const baseCol = blockCol * CONFIG.GRID.BLOCK_WIDTH;

    values[baseRow][baseCol] = toSafeCellString(card.number);
    values[baseRow][baseCol + 1] = toSafeCellString(card.name);
    values[baseRow + 1][baseCol + 2] = toSafeCellString(card.image);
    const existing = existingMap.get(normalizeCardNumber(card.number));
    values[baseRow + 2][baseCol] = Boolean(existing?.g);
    values[baseRow + 2][baseCol + 1] = Boolean(existing?.rh && existing?.g);
    values[baseRow + 2][baseCol + 2] = toSafeCellString(card.cardmarketUrl);
  });

  return values;
}

async function upsertOverviewEntry(setMeta, imported = true) {
  const sheets = await resolveSheetNames();
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
  const normalizedImported = new Set(Array.from(importedSetIds).map((id) => toSafeCellString(id).toLowerCase()));
  const sheets = await resolveSheetNames();
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

  for (const update of updates) {
    await putValues(buildRange(sheets.overview, `A${update.rowIndex}:J${update.rowIndex}`), [update.rowValues]);
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

  const sheetName = toSafeCellString(setMeta.setName);
  await ensureSetSheet(sheetName);

  const existingMap = await readSetCollectionMap(sheetName).catch(() => new Map());
  const gridValues = buildCardGridValues(cards, existingMap);
  const endColumnIndex = CONFIG.GRID.CARDS_PER_ROW * CONFIG.GRID.BLOCK_WIDTH;
  const endColumn = colToA1(endColumnIndex);
  const endRow = 2 + gridValues.length;

  await putValues(buildRange(sheetName, 'A1:B1'), [[setMeta.setId, setMeta.setName]]);
  await clearValues(buildRange(sheetName, `A3:${endColumn}5000`));
  await putValues(buildRange(sheetName, `A3:${endColumn}${endRow}`), gridValues);

  await upsertOverviewEntry({
    ...setMeta,
    setName: sheetName,
    totalCards: Number(setMeta.totalCards) || cards.length
  });
}

export async function readSetCollectionMap(setSheetName) {
  const totalCols = CONFIG.GRID.CARDS_PER_ROW * CONFIG.GRID.BLOCK_WIDTH;
  const endColumn = String.fromCharCode(64 + totalCols);
  // UNFORMATTED_VALUE liefert Boolean-Checkboxen als true/false statt "TRUE"/"FALSE"
  const values = await getValues(buildRange(setSheetName, `A3:${endColumn}2000`));

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

export async function updateCellBoolean(sheetName, row, col, value) {
  const a1 = buildRange(sheetName, `${colToA1(col)}${row}`);
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
