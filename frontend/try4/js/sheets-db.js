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

const DB_SHEETS = {
  sets: 'db_sets',
  cards: 'db_cards',
  collection: 'db_collection'
};

const DB_HEADERS = {
  sets: ['setId', 'setName', 'series', 'releaseDate', 'totalCards', 'ptcgoCode', 'logoUrl', 'symbolUrl', 'imported', 'updatedAt'],
  cards: ['setId', 'cardId', 'number', 'name', 'imageUrl', 'cardmarketUrl', 'rarity', 'updatedAt'],
  collection: ['setId', 'cardId', 'g', 'rh', 'updatedAt']
};

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

async function listSheetTitles() {
  const meta = await gapi.client.sheets.spreadsheets.get({
    spreadsheetId: CONFIG.SPREADSHEET_ID,
    fields: 'sheets(properties(title))'
  });
  return (meta.result.sheets || [])
    .map((sheet) => sheet.properties?.title)
    .filter(Boolean);
}

async function addSheet(title) {
  await gapi.client.sheets.spreadsheets.batchUpdate({
    spreadsheetId: CONFIG.SPREADSHEET_ID,
    resource: {
      requests: [{ addSheet: { properties: { title } } }]
    }
  });
  resolvedSheetsCache = null;
}

function buildDataRange(sheetName, columnCount, startRow = 2, endRow = 200000) {
  const endColumn = colToA1(Math.max(1, columnCount));
  return buildRange(sheetName, `A${startRow}:${endColumn}${endRow}`);
}

async function ensureSheetWithHeader(sheetName, header) {
  const titles = await listSheetTitles();
  if (!titles.includes(sheetName)) {
    await addSheet(sheetName);
    await putValues(buildRange(sheetName, `A1:${colToA1(header.length)}1`), [header]);
    return;
  }

  const existingHeader = await getValues(buildRange(sheetName, `A1:${colToA1(header.length)}1`)).catch(() => []);
  const hasHeader = Array.isArray(existingHeader[0]) && existingHeader[0].some((value) => String(value ?? '').trim() !== '');
  if (!hasHeader) {
    await putValues(buildRange(sheetName, `A1:${colToA1(header.length)}1`), [header]);
  }
}

async function ensureNormalizedSchema() {
  await ensureSheetWithHeader(DB_SHEETS.sets, DB_HEADERS.sets);
  await ensureSheetWithHeader(DB_SHEETS.cards, DB_HEADERS.cards);
  await ensureSheetWithHeader(DB_SHEETS.collection, DB_HEADERS.collection);
}

async function readDbRows(sheetName, columnCount) {
  return getValues(buildDataRange(sheetName, columnCount, 2, 200000)).catch(() => []);
}

async function rewriteDbRows(sheetName, columnCount, rows) {
  await clearValues(buildDataRange(sheetName, columnCount, 2, 200000));
  if (rows.length === 0) return;
  const endRow = rows.length + 1;
  const endCol = colToA1(columnCount);
  await putValues(buildRange(sheetName, `A2:${endCol}${endRow}`), rows);
}

function toSafeCellString(value) {
  return String(value ?? '').trim();
}

function nowIso() {
  return new Date().toISOString();
}

async function upsertDbSet(setMeta, imported = false) {
  await ensureNormalizedSchema();
  const setId = toSafeCellString(setMeta?.setId);
  if (!setId) return;

  const rows = await readDbRows(DB_SHEETS.sets, DB_HEADERS.sets.length);
  const target = [
    setId,
    toSafeCellString(setMeta?.setName),
    toSafeCellString(setMeta?.series),
    toSafeCellString(setMeta?.releaseDate),
    Number(setMeta?.totalCards) || 0,
    toSafeCellString(setMeta?.ptcgoCode),
    toSafeCellString(setMeta?.logoUrl),
    toSafeCellString(setMeta?.symbolUrl),
    Boolean(imported),
    nowIso()
  ];

  const existingIndex = rows.findIndex((row) => toSafeCellString(row[0]).toLowerCase() === setId.toLowerCase());
  if (existingIndex >= 0) {
    const rowNo = existingIndex + 2;
    const existingImported = toBoolean(rows[existingIndex][8]);
    target[8] = Boolean(imported || existingImported);
    await putValues(buildRange(DB_SHEETS.sets, `A${rowNo}:${colToA1(DB_HEADERS.sets.length)}${rowNo}`), [target]);
  } else {
    const rowNo = rows.length + 2;
    await putValues(buildRange(DB_SHEETS.sets, `A${rowNo}:${colToA1(DB_HEADERS.sets.length)}${rowNo}`), [target]);
  }
}

async function resolveSetIdFromName(setSheetName) {
  await ensureNormalizedSchema();
  const rows = await readDbRows(DB_SHEETS.sets, DB_HEADERS.sets.length);
  const normalizedName = toSafeCellString(setSheetName).toLowerCase();
  const direct = rows.find((row) => toSafeCellString(row[1]).toLowerCase() === normalizedName);
  if (direct?.[0]) return toSafeCellString(direct[0]);

  const sheets = await resolveSheetNames();
  const overviewRows = await getOverviewRows(sheets).catch(() => []);
  const legacy = overviewRows.find((row) => toSafeCellString(row[1]).toLowerCase() === normalizedName);
  return legacy?.[0] ? toSafeCellString(extractDisplayTextFromHyperlink(legacy[0])) : '';
}

async function writeDbCardsForSet(setId, cards) {
  await ensureNormalizedSchema();
  const rows = await readDbRows(DB_SHEETS.cards, DB_HEADERS.cards.length);
  const otherRows = rows.filter((row) => toSafeCellString(row[0]).toLowerCase() !== setId.toLowerCase());
  const setRows = cards.map((card) => [
    setId,
    toSafeCellString(card.number),
    toSafeCellString(card.number),
    toSafeCellString(card.name),
    toSafeCellString(card.image),
    toSafeCellString(card.cardmarketUrl),
    toSafeCellString(card.rarity),
    nowIso()
  ]);
  await rewriteDbRows(DB_SHEETS.cards, DB_HEADERS.cards.length, [...otherRows, ...setRows]);
}

async function writeDbCollectionForSet(setId, cards, existingMap = new Map()) {
  await ensureNormalizedSchema();
  const rows = await readDbRows(DB_SHEETS.collection, DB_HEADERS.collection.length);
  const otherRows = rows.filter((row) => toSafeCellString(row[0]).toLowerCase() !== setId.toLowerCase());
  const setRows = cards.map((card) => {
    const key = normalizeCardNumber(card.number);
    const existing = existingMap.get(key);
    const g = Boolean(existing?.g);
    const rh = Boolean(existing?.rh && g);
    return [setId, toSafeCellString(card.number), g, rh, nowIso()];
  });
  await rewriteDbRows(DB_SHEETS.collection, DB_HEADERS.collection.length, [...otherRows, ...setRows]);
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
 * Gibt ALLE Sets (auch nicht importierte) mit vollständigen Metadaten zurück.
 * Nützlich zum Anzeigen einer vollständigen Set-Liste.
 * @returns {Promise<Array<{setId, setName, series, releaseDate, totalCards, ptcgoCode, imported}>>}
 */
export async function listSetsOverviewData() {
  await ensureNormalizedSchema();
  const dbRows = await readDbRows(DB_SHEETS.sets, DB_HEADERS.sets.length);
  const dbSets = dbRows
    .filter((row) => row[0])
    .map((row) => ({
      setId: toSafeCellString(row[0]),
      setName: toSafeCellString(row[1]),
      series: toSafeCellString(row[2]),
      releaseDate: toSafeCellString(row[3]),
      totalCards: Number(row[4]) || 0,
      ptcgoCode: toSafeCellString(row[5]),
      logoUrl: toSafeCellString(row[6]),
      symbolUrl: toSafeCellString(row[7]),
      imported: toBoolean(row[8])
    }))
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
      setsById.set(setId, {
        setName: toSafeCellString(row[1]),
        ptcgoCode: toSafeCellString(row[5]),
        imported: toBoolean(row[8]),
        totalMeta: Number(row[4]) || 0
      });
    });

    const agg = new Map();
    collectionRows.forEach((row) => {
      const setId = toSafeCellString(row[0]);
      const cardId = toSafeCellString(row[1]);
      if (!setId || !cardId) return;
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
  const text = String(value);
  const match = /=IMAGE\("([^"]+)"/.exec(text);
  if (match) return match[1];
  if (/^https?:\/\//i.test(text)) return text;
  return '';
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

async function upsertOverviewEntry(setMeta, imported = true) {
  await upsertDbSet(setMeta, imported);

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
  await ensureNormalizedSchema();
  const normalizedImported = new Set(Array.from(importedSetIds).map((id) => toSafeCellString(id).toLowerCase()));

  const dbRows = await readDbRows(DB_SHEETS.sets, DB_HEADERS.sets.length);
  const dbById = new Map();
  dbRows.forEach((row) => {
    const key = toSafeCellString(row[0]).toLowerCase();
    if (!key) return;
    dbById.set(key, row);
  });

  const mergedDb = new Map();
  (sets || []).forEach((set) => {
    const key = toSafeCellString(set?.setId).toLowerCase();
    if (!key) return;
    const existing = dbById.get(key) || [];
    mergedDb.set(key, [
      toSafeCellString(set.setId),
      toSafeCellString(set.setName),
      toSafeCellString(set.series),
      toSafeCellString(set.releaseDate),
      Number(set.totalCards) || 0,
      toSafeCellString(set.ptcgoCode),
      toSafeCellString(set.logoUrl),
      toSafeCellString(set.symbolUrl),
      Boolean(normalizedImported.has(key) || toBoolean(existing[8])),
      nowIso()
    ]);
  });

  dbById.forEach((existing, key) => {
    if (!mergedDb.has(key)) mergedDb.set(key, existing);
  });

  await rewriteDbRows(DB_SHEETS.sets, DB_HEADERS.sets.length, Array.from(mergedDb.values()));

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
  const totalCols = CONFIG.GRID.CARDS_PER_ROW * CONFIG.GRID.BLOCK_WIDTH;
  const endColumn = colToA1(totalCols);
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

  const existingRows = await readDbRows(DB_SHEETS.collection, DB_HEADERS.collection.length);
  const otherRows = existingRows.filter((row) => toSafeCellString(row[0]).toLowerCase() !== setId.toLowerCase());
  await rewriteDbRows(DB_SHEETS.collection, DB_HEADERS.collection.length, [...otherRows, ...legacyRows]);

  const migrated = new Map();
  const refreshed = await readDbRows(DB_SHEETS.collection, DB_HEADERS.collection.length);
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

export async function updateCellBoolean(sheetName, row, col, value) {
  await ensureNormalizedSchema();
  const useNormalizedCollection = Number(row) >= 2 && (Number(col) === 3 || Number(col) === 4);
  const targetSheet = useNormalizedCollection ? DB_SHEETS.collection : sheetName;
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
