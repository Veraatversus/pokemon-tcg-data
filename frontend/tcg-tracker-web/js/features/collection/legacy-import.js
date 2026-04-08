import { normalizeCardNumber, toBoolean, colToA1 } from '../../core/utils.js';
import { normalizeSetId, buildSetIdAliasCandidates } from '../../pokecode-compat.js';
import { CONFIG } from '../../core/config.js';

const LEGACY_IGNORED_SHEETS = new Set([
  CONFIG.SHEETS.OVERVIEW,
  CONFIG.SHEETS.SUMMARY,
  CONFIG.SHEETS.SETTINGS
]);

function uniqueStrings(values = []) {
  const seen = new Set();
  const result = [];
  values.forEach((value) => {
    const text = String(value ?? '').trim();
    if (!text || seen.has(text)) return;
    seen.add(text);
    result.push(text);
  });
  return result;
}

function normalizeSetName(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function cleanLegacySetHeaderValue(value) {
  return String(value || '')
    .replace(/\(\s*set[-\s]*id\s*:[^)]+\)/i, '')
    .replace(/\s*-\s*collected\s*:.*$/i, '')
    .trim();
}

export function extractLegacySpreadsheetId(input) {
  const text = String(input || '').trim();
  if (!text) return null;

  const urlMatch = text.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/i);
  if (urlMatch) return String(urlMatch[1]).trim();
  if (/^[a-zA-Z0-9_-]{20,}$/.test(text)) return text;
  return null;
}

function getSheetCell(sheet, address) {
  if (!sheet || typeof sheet !== 'object') return null;
  return sheet[address] ?? null;
}

function getSheetCellValue(sheet, address) {
  const cell = getSheetCell(sheet, address);
  if (cell == null) return '';
  if (typeof cell === 'object') {
    if (cell.v != null) return cell.v;
    if (cell.w != null) return cell.w;
  }
  return cell;
}

function getCellCommentText(cell) {
  if (!cell || typeof cell !== 'object') return '';
  const parts = [];

  const noteText = String(cell.note || cell.comment || '').trim();
  if (noteText) parts.push(noteText);

  if (Array.isArray(cell.c)) {
    parts.push(
      ...cell.c
        .map((entry) => String(entry?.t || entry?.text || '').trim())
        .filter(Boolean)
    );
  }

  return parts.join('\n');
}

function extractSetIdFromText(text) {
  const match = String(text || '').match(/set[-\s]*id\s*:\s*([a-z0-9._-]+)/i);
  return match ? String(match[1]).trim() : '';
}

function getSheetMaxRow(sheet) {
  const ref = String(sheet?.['!ref'] || '').trim();
  if (!ref) return 2000;
  const match = ref.match(/:([A-Z]+)(\d+)$/i);
  return match ? Number.parseInt(match[2], 10) : 2000;
}

function collectLegacyCheckedCards(sheet) {
  const cards = [];
  const seen = new Set();
  const headerRows = CONFIG.GRID.HEADER_ROWS;
  const cardsPerRow = CONFIG.GRID.CARDS_PER_ROW;
  const blockWidth = CONFIG.GRID.BLOCK_WIDTH;
  const blockHeight = CONFIG.GRID.BLOCK_HEIGHT;
  const maxRow = getSheetMaxRow(sheet);

  for (let baseRow = headerRows + 1; baseRow <= maxRow; baseRow += blockHeight) {
    for (let cardIndex = 0; cardIndex < cardsPerRow; cardIndex++) {
      const baseCol = 1 + (cardIndex * blockWidth);
      const cardAddress = `${colToA1(baseCol)}${baseRow}`;
      const rawId = String(getSheetCellValue(sheet, cardAddress) || '').trim();
      if (!rawId) continue;

      const checkRow = baseRow + 2;
      const gValue = getSheetCellValue(sheet, `${colToA1(baseCol)}${checkRow}`);
      const rhValue = getSheetCellValue(sheet, `${colToA1(baseCol + 1)}${checkRow}`);
      const g = toBoolean(gValue);
      const rh = Boolean(g && toBoolean(rhValue));
      if (!g && !rh) continue;

      const normalizedCardId = normalizeCardNumber(rawId);
      const dedupeKey = `${normalizedCardId}:${g ? 1 : 0}:${rh ? 1 : 0}`;
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);

      cards.push({
        sourceCardId: rawId,
        normalizedCardId,
        g,
        rh
      });
    }
  }

  return cards;
}

export function parseLegacyWorkbook(workbook) {
  const parsed = {
    sheets: [],
    skippedSheets: []
  };

  const sheetNames = Array.isArray(workbook?.SheetNames) ? workbook.SheetNames : [];
  for (const sheetName of sheetNames) {
    if (LEGACY_IGNORED_SHEETS.has(sheetName)) {
      parsed.skippedSheets.push(sheetName);
      continue;
    }

    const sheet = workbook?.Sheets?.[sheetName];
    if (!sheet) continue;

    const a1Cell = getSheetCell(sheet, 'A1');
    const rawHeaderValue = String(getSheetCellValue(sheet, 'A1') || sheetName || '').trim();
    const sourceSetName = cleanLegacySetHeaderValue(rawHeaderValue) || String(sheetName || '').trim();
    const sourceSetIdRaw = extractSetIdFromText(`${getCellCommentText(a1Cell)}\n${rawHeaderValue}`);
    const cards = collectLegacyCheckedCards(sheet);

    if (!cards.length) {
      parsed.skippedSheets.push(sheetName);
      continue;
    }

    parsed.sheets.push({
      sheetName,
      sourceSetName,
      sourceSetIdRaw,
      cards
    });
  }

  return parsed;
}

function getSetMatchCandidates(sheetEntry, allSets) {
  const matches = new Map();
  const sourceSetIdRaw = String(sheetEntry?.sourceSetIdRaw || '').trim();
  const sourceSetName = String(sheetEntry?.sourceSetName || sheetEntry?.sheetName || '').trim();

  const addMatch = (setMeta, reason) => {
    if (!setMeta?.setId) return;
    const existing = matches.get(setMeta.setId);
    if (existing) return;
    matches.set(setMeta.setId, {
      ...setMeta,
      reason
    });
  };

  if (sourceSetIdRaw) {
    const aliasCandidates = buildSetIdAliasCandidates(sourceSetIdRaw, CONFIG.CUSTOM_SET_ID_MAPPINGS);
    const normalizedAliases = new Set(aliasCandidates.map((entry) => normalizeSetId(String(entry).replace(/^TCGDEX-/i, ''))).filter(Boolean));
    allSets.forEach((setMeta) => {
      const normalizedSetId = normalizeSetId(setMeta?.setId || '');
      if (normalizedSetId && normalizedAliases.has(normalizedSetId)) {
        addMatch(setMeta, 'set-id');
      }
    });
  }

  if (matches.size === 0 && sourceSetName) {
    const normalizedName = normalizeSetName(sourceSetName);
    const normalizedSheetId = normalizeSetId(sourceSetName);
    allSets.forEach((setMeta) => {
      if (normalizeSetName(setMeta?.setName || '') === normalizedName) {
        addMatch(setMeta, 'set-name');
        return;
      }
      if (normalizeSetId(setMeta?.setId || '') === normalizedSheetId) {
        addMatch(setMeta, 'sheet-id');
      }
    });
  }

  return Array.from(matches.values());
}

export function pickCanonicalCardId(card) {
  return uniqueStrings([
    card?.number,
    card?.vera_number,
    card?.tcgdex_localId,
    card?.localId,
    card?.cardId,
    card?.id
  ])[0] || '';
}

function collectCardIdentifierCandidates(card) {
  const candidates = uniqueStrings([
    card?.number,
    card?.vera_number,
    card?.tcgdex_localId,
    card?.localId,
    card?.cardId,
    card?.id ? String(card.id).split('-').slice(1).join('-') : ''
  ]);

  return uniqueStrings(candidates.map((value) => normalizeCardNumber(value)));
}

function buildCardLookup(cards = []) {
  const lookup = new Map();

  cards.forEach((card) => {
    const cardId = pickCanonicalCardId(card);
    if (!cardId) return;
    const identifiers = collectCardIdentifierCandidates(card);
    identifiers.forEach((identifier) => {
      if (!lookup.has(identifier)) lookup.set(identifier, []);
      lookup.get(identifier).push({ cardId, raw: card });
    });
  });

  return lookup;
}

export function buildLegacyImportPlan({ parsedWorkbook, allSets = [], cardsBySetId = {} } = {}) {
  const plan = {
    ok: true,
    matchedSets: [],
    missingSetIds: [],
    unresolvedSheets: [],
    unresolvedCards: [],
    stats: {
      sheetCount: Array.isArray(parsedWorkbook?.sheets) ? parsedWorkbook.sheets.length : 0,
      checkedCardCount: 0,
      matchedCardCount: 0,
      missingSetCount: 0
    }
  };

  const uniqueMissing = new Set();
  const sheets = Array.isArray(parsedWorkbook?.sheets) ? parsedWorkbook.sheets : [];

  sheets.forEach((sheetEntry) => {
    plan.stats.checkedCardCount += Array.isArray(sheetEntry?.cards) ? sheetEntry.cards.length : 0;
    const setMatches = getSetMatchCandidates(sheetEntry, allSets);

    if (setMatches.length !== 1) {
      plan.unresolvedSheets.push({
        sheetName: sheetEntry?.sheetName || '',
        sourceSetIdRaw: sheetEntry?.sourceSetIdRaw || '',
        sourceSetName: sheetEntry?.sourceSetName || '',
        reason: setMatches.length === 0 ? 'set-not-found' : 'set-ambiguous',
        candidates: setMatches.map((entry) => ({ setId: entry.setId, setName: entry.setName }))
      });
      return;
    }

    const resolvedSet = setMatches[0];
    const cards = Array.isArray(cardsBySetId?.[resolvedSet.setId]) ? cardsBySetId[resolvedSet.setId] : [];
    const cardLookup = buildCardLookup(cards);
    const matchedCards = [];

    (sheetEntry.cards || []).forEach((cardEntry) => {
      const candidates = cardLookup.get(cardEntry.normalizedCardId) || [];
      const uniqueCardIds = uniqueStrings(candidates.map((entry) => entry.cardId));

      if (uniqueCardIds.length !== 1) {
        plan.unresolvedCards.push({
          sheetName: sheetEntry.sheetName,
          setId: resolvedSet.setId,
          setName: resolvedSet.setName,
          sourceCardId: cardEntry.sourceCardId,
          normalizedCardId: cardEntry.normalizedCardId,
          reason: uniqueCardIds.length === 0 ? 'card-not-found' : 'card-ambiguous',
          candidates: uniqueCardIds
        });
        return;
      }

      matchedCards.push({
        sourceCardId: cardEntry.sourceCardId,
        normalizedCardId: cardEntry.normalizedCardId,
        cardId: uniqueCardIds[0],
        g: Boolean(cardEntry.g),
        rh: Boolean(cardEntry.g && cardEntry.rh)
      });
      plan.stats.matchedCardCount += 1;
    });

    if (!resolvedSet.imported) {
      uniqueMissing.add(resolvedSet.setId);
    }

    plan.matchedSets.push({
      sheetName: sheetEntry.sheetName,
      sourceSetIdRaw: sheetEntry.sourceSetIdRaw,
      sourceSetName: sheetEntry.sourceSetName,
      setId: resolvedSet.setId,
      setName: resolvedSet.setName,
      imported: Boolean(resolvedSet.imported),
      cards: matchedCards
    });
  });

  plan.missingSetIds = Array.from(uniqueMissing);
  plan.stats.missingSetCount = plan.missingSetIds.length;
  plan.ok = plan.unresolvedSheets.length === 0 && plan.unresolvedCards.length === 0;
  return plan;
}

export function summarizeLegacyImportPlan(plan) {
  const stats = plan?.stats || {};
  return {
    ok: Boolean(plan?.ok),
    sheetCount: Number(stats.sheetCount || 0),
    checkedCardCount: Number(stats.checkedCardCount || 0),
    matchedCardCount: Number(stats.matchedCardCount || 0),
    missingSetCount: Number(stats.missingSetCount || 0),
    unresolvedSheetCount: Array.isArray(plan?.unresolvedSheets) ? plan.unresolvedSheets.length : 0,
    unresolvedCardCount: Array.isArray(plan?.unresolvedCards) ? plan.unresolvedCards.length : 0
  };
}

function getGoogleSheetsCellValue(cellData = {}) {
  const effective = cellData?.effectiveValue || cellData?.userEnteredValue || {};

  if (typeof effective.boolValue === 'boolean') return effective.boolValue;
  if (typeof cellData?.formattedValue === 'string' && cellData.formattedValue.trim()) return cellData.formattedValue;
  if (typeof effective.stringValue === 'string') return effective.stringValue;
  if (typeof effective.numberValue === 'number') return cellData?.formattedValue ?? effective.numberValue;
  if (typeof effective.formulaValue === 'string') return effective.formulaValue;
  return '';
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function ensureLegacySheetsApiReady(timeoutMs = 15000) {
  const started = Date.now();
  let discoveryAttempted = false;

  while (Date.now() - started < timeoutMs) {
    const gapiRef = globalThis.gapi;
    const client = gapiRef?.client;
    const sheetsGet = client?.sheets?.spreadsheets?.get;
    if (typeof sheetsGet === 'function') {
      return sheetsGet.bind(client.sheets.spreadsheets);
    }

    if (!discoveryAttempted && typeof client?.load === 'function') {
      discoveryAttempted = true;
      try {
        await client.load('https://sheets.googleapis.com/$discovery/rest?version=v4');
        const discoveredGet = client?.sheets?.spreadsheets?.get;
        if (typeof discoveredGet === 'function') {
          return discoveredGet.bind(client.sheets.spreadsheets);
        }
      } catch (err) {
        console.warn('[ensureLegacySheetsApiReady] discovery load failed', err);
      }
    }

    await sleep(150);
  }

  return null;
}

export function buildWorkbookFromGoogleSheetsSpreadsheet(spreadsheet) {
  const workbook = { SheetNames: [], Sheets: {} };
  const sheets = Array.isArray(spreadsheet?.sheets) ? spreadsheet.sheets : [];

  sheets.forEach((sheetEntry, index) => {
    const title = String(sheetEntry?.properties?.title || `Sheet ${index + 1}`).trim();
    if (!title) return;

    const rowData = Array.isArray(sheetEntry?.data?.[0]?.rowData) ? sheetEntry.data[0].rowData : [];
    const sheet = {};
    let maxCol = 1;
    let maxRow = 1;

    rowData.forEach((row, rowIndex) => {
      const values = Array.isArray(row?.values) ? row.values : [];
      if (values.length) {
        maxCol = Math.max(maxCol, values.length);
        maxRow = Math.max(maxRow, rowIndex + 1);
      }

      values.forEach((cellData, colIndex) => {
        const value = getGoogleSheetsCellValue(cellData);
        const note = String(cellData?.note || '').trim();
        const hasValue = !(value === '' || value == null);
        if (!hasValue && !note) return;

        const address = `${colToA1(colIndex + 1)}${rowIndex + 1}`;
        const cell = {};
        if (hasValue) {
          cell.v = value;
          if (typeof cellData?.formattedValue === 'string' && cellData.formattedValue !== String(value)) {
            cell.w = cellData.formattedValue;
          }
        }
        if (note) {
          cell.note = note;
          cell.c = [{ t: note }];
        }
        sheet[address] = cell;
      });
    });

    sheet['!ref'] = `A1:${colToA1(Math.max(maxCol, 1))}${Math.max(maxRow, 1)}`;
    workbook.SheetNames.push(title);
    workbook.Sheets[title] = sheet;
  });

  return workbook;
}

export async function loadLegacyWorkbookFromSpreadsheetInput(input) {
  const spreadsheetId = extractLegacySpreadsheetId(input);
  if (!spreadsheetId) {
    throw new Error('Ungültiger Google-Sheets-Link oder Spreadsheet-ID.');
  }

  const sheetsGet = await ensureLegacySheetsApiReady();
  if (typeof sheetsGet !== 'function') {
    throw new Error('Google Sheets API ist nicht bereit. Bitte kurz warten oder erneut anmelden.');
  }

  let response;
  try {
    response = await sheetsGet({
      spreadsheetId,
      includeGridData: true,
      fields: 'sheets.properties(title),sheets.data.rowData.values(effectiveValue,formattedValue,note)'
    });
  } catch (err) {
    const detail = err?.result?.error?.message || err?.message || err;
    throw new Error(`Google-Sheet konnte nicht gelesen werden: ${detail}`);
  }

  const workbook = buildWorkbookFromGoogleSheetsSpreadsheet(response?.result || response);
  if (!Array.isArray(workbook?.SheetNames) || !workbook.SheetNames.length) {
    throw new Error('Im verknüpften Google-Sheet wurden keine Tabellenblätter gefunden.');
  }
  return workbook;
}

export async function loadLegacyWorkbookFromFile(file) {
  if (!(file instanceof Blob)) {
    throw new Error('Bitte eine gültige XLSX-Datei auswählen.');
  }

  let XLSX;
  try {
    XLSX = await import('https://cdn.jsdelivr.net/npm/xlsx@0.18.5/+esm');
  } catch (err) {
    throw new Error(`XLSX-Parser konnte nicht geladen werden: ${err?.message || err}`);
  }

  const buffer = await file.arrayBuffer();
  return XLSX.read(buffer, {
    type: 'array',
    cellFormula: false,
    cellHTML: false,
    cellNF: false,
    cellStyles: false,
    cellComments: true,
    sheetStubs: true
  });
}
