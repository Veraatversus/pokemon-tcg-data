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
  const rows = await getFormulas(buildRange(CONFIG.SHEETS.OVERVIEW, 'A3:J'));
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
  const rows = await getFormulas(buildRange(CONFIG.SHEETS.OVERVIEW, 'A3:J'));
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
  const rows = await getValues(buildRange(CONFIG.SHEETS.SUMMARY, 'A4:G'));
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
  const match = /=IMAGE\("([^"]+)"/.exec(String(value));
  return match ? match[1] : '';
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
  const sheetMeta = await gapi.client.sheets.spreadsheets.get({
    spreadsheetId: CONFIG.SPREADSHEET_ID
  });
  const exists = (sheetMeta.result.sheets || []).some(
    (s) => s.properties?.title === CONFIG.SHEETS.SETTINGS
  );

  if (!exists) {
    await gapi.client.sheets.spreadsheets.batchUpdate({
      spreadsheetId: CONFIG.SPREADSHEET_ID,
      resource: {
        requests: [{ addSheet: { properties: { title: CONFIG.SHEETS.SETTINGS } } }]
      }
    });
    await putValues(buildRange(CONFIG.SHEETS.SETTINGS, 'A1:B1'), [['key', 'value']]);
  }
}

export async function readSettings() {
  await ensureSettingsSheet();
  const rows = await getValues(buildRange(CONFIG.SHEETS.SETTINGS, 'A2:B'));
  const settings = {};
  rows.forEach((r) => {
    if (r[0]) settings[r[0]] = r[1] || '';
  });
  return settings;
}

export async function writeSetting(key, value) {
  await ensureSettingsSheet();
  const keys = await getValues(buildRange(CONFIG.SHEETS.SETTINGS, 'A2:A'));
  const existingIndex = keys.findIndex((r) => r[0] === key);

  if (existingIndex >= 0) {
    await putValues(buildRange(CONFIG.SHEETS.SETTINGS, `B${existingIndex + 2}`), [[value]]);
  } else {
    const nextRow = keys.length + 2;
    await putValues(buildRange(CONFIG.SHEETS.SETTINGS, `A${nextRow}:B${nextRow}`), [[key, value]]);
  }
}
