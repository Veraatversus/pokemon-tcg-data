import { normalizeCardNumber, toBoolean, colToA1 } from '../../core/utils.js';
import { normalizeSetId, buildSetIdAliasCandidates } from '../../pokecode-compat.js';
import { CONFIG } from '../../core/config.js?v=20260409-treeview1';

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

function normalizeDriveFileBaseName(value) {
  return String(value || '')
    .trim()
    .replace(/\.xlsx$/i, '')
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

function isDriveXlsxFile(file = {}) {
  const mimeType = String(file?.mimeType || '').trim().toLowerCase();
  const extension = String(file?.fileExtension || '').trim().toLowerCase();
  const name = String(file?.name || '').trim().toLowerCase();
  return mimeType === LEGACY_XLSX_MIME || extension === 'xlsx' || name.endsWith('.xlsx');
}

export function pickPreferredLegacyDriveXlsxFile(sourceFile = {}, files = []) {
  const targetBaseName = normalizeDriveFileBaseName(sourceFile?.name || '');
  if (!targetBaseName) return null;

  const sourceParents = new Set(Array.isArray(sourceFile?.parents) ? sourceFile.parents.filter(Boolean) : []);
  const candidates = (Array.isArray(files) ? files : [])
    .filter((file) => file?.id && isDriveXlsxFile(file))
    .map((file) => {
      const fileName = String(file?.name || '').trim();
      const fileBaseName = normalizeDriveFileBaseName(fileName);
      const candidateParents = Array.isArray(file?.parents) ? file.parents.filter(Boolean) : [];
      let score = 0;

      if (fileBaseName === targetBaseName) score += 300;
      if (fileName.toLowerCase() === `${targetBaseName}.xlsx`) score += 40;
      if (candidateParents.some((parentId) => sourceParents.has(parentId))) score += 80;
      if (fileBaseName.includes(targetBaseName) || targetBaseName.includes(fileBaseName)) score += 10;

      return {
        file,
        score,
        modifiedAt: Date.parse(file?.modifiedTime || '') || 0
      };
    })
    .filter((entry) => entry.score > 0)
    .sort((left, right) => (right.score - left.score) || (right.modifiedAt - left.modifiedAt));

  return candidates[0]?.file || null;
}

function escapeDriveQueryValue(value) {
  return String(value || '')
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'");
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

function resolveLegacyCardDisplayName(card, fallback = '') {
  return uniqueStrings([
    card?.name,
    card?.vera_name,
    card?.tcgdex_name,
    card?.localName,
    fallback
  ])[0] || String(fallback || '').trim();
}

export function buildLegacyImportSelectionTree(plan, cardsBySetId = {}) {
  const matchedSets = Array.isArray(plan?.matchedSets) ? plan.matchedSets : [];

  return {
    sets: matchedSets.map((matchedSet) => {
      const catalog = Array.isArray(cardsBySetId?.[matchedSet.setId]) ? cardsBySetId[matchedSet.setId] : [];
      const cardNameByIdentifier = new Map();

      catalog.forEach((card) => {
        const fallbackId = pickCanonicalCardId(card);
        const displayName = resolveLegacyCardDisplayName(card, fallbackId);
        collectCardIdentifierCandidates(card).forEach((identifier) => {
          if (identifier && !cardNameByIdentifier.has(identifier)) {
            cardNameByIdentifier.set(identifier, displayName);
          }
        });
      });

      const cards = Array.isArray(matchedSet?.cards)
        ? matchedSet.cards.map((card, index) => {
            const normalizedCardId = normalizeCardNumber(card?.cardId || card?.sourceCardId || `${index + 1}`);
            const fallbackName = String(card?.cardId || card?.sourceCardId || `Karte ${index + 1}`).trim();
            return {
              key: `${matchedSet.setId}:${normalizedCardId}:${index}`,
              cardId: String(card?.cardId || '').trim(),
              sourceCardId: String(card?.sourceCardId || '').trim(),
              normalizedCardId,
              name: cardNameByIdentifier.get(normalizedCardId) || resolveLegacyCardDisplayName(card, fallbackName),
              g: Boolean(card?.g),
              rh: Boolean(card?.g && card?.rh),
              selected: true
            };
          })
        : [];

      return {
        setId: String(matchedSet?.setId || '').trim(),
        setName: String(matchedSet?.setName || '').trim(),
        sheetName: String(matchedSet?.sheetName || '').trim(),
        imported: Boolean(matchedSet?.imported),
        selected: true,
        expanded: false,
        cards
      };
    })
  };
}

export function filterLegacyImportPlanBySelection(plan, selectionTree) {
  const matchedSets = Array.isArray(plan?.matchedSets) ? plan.matchedSets : [];
  const selectedSets = Array.isArray(selectionTree?.sets) ? selectionTree.sets : [];
  if (!selectedSets.length) {
    return {
      ...plan,
      matchedSets: [],
      missingSetIds: [],
      stats: {
        ...(plan?.stats || {}),
        sheetCount: 0,
        checkedCardCount: 0,
        matchedCardCount: 0,
        missingSetCount: 0
      }
    };
  }

  const selectedSetByKey = new Map(
    selectedSets.map((set) => [`${String(set?.setId || '').trim()}::${String(set?.sheetName || '').trim()}`, set])
  );

  const filteredMatchedSets = matchedSets
    .map((matchedSet) => {
      const selection = selectedSetByKey.get(`${String(matchedSet?.setId || '').trim()}::${String(matchedSet?.sheetName || '').trim()}`);
      if (selection?.selected === false) return null;

      const selectedCards = Array.isArray(selection?.cards) ? selection.cards : [];
      const selectedCardKeys = new Set(
        selectedCards
          .filter((card) => card?.selected !== false)
          .map((card) => `${String(card?.key || '').trim()}::${String(card?.cardId || '').trim()}::${String(card?.sourceCardId || '').trim()}::${String(card?.normalizedCardId || '').trim()}`)
      );

      const cards = Array.isArray(matchedSet?.cards)
        ? matchedSet.cards.filter((card, index) => {
            if (!selectedCards.length) return true;
            const normalizedCardId = normalizeCardNumber(card?.cardId || card?.sourceCardId || `${index + 1}`);
            const key = `${String(matchedSet?.setId || '').trim()}:${normalizedCardId}:${index}`;
            const compositeKey = `${key}::${String(card?.cardId || '').trim()}::${String(card?.sourceCardId || '').trim()}::${normalizedCardId}`;
            return selectedCardKeys.has(compositeKey);
          })
        : [];

      if (!cards.length) return null;
      return {
        ...matchedSet,
        cards
      };
    })
    .filter(Boolean);

  const selectedSetIds = new Set(filteredMatchedSets.map((set) => set.setId));
  const checkedCardCount = filteredMatchedSets.reduce((sum, set) => sum + (Array.isArray(set?.cards) ? set.cards.length : 0), 0);
  const missingSetIds = (Array.isArray(plan?.missingSetIds) ? plan.missingSetIds : []).filter((setId) => selectedSetIds.has(setId));

  return {
    ...plan,
    matchedSets: filteredMatchedSets,
    missingSetIds,
    stats: {
      ...(plan?.stats || {}),
      sheetCount: filteredMatchedSets.length,
      checkedCardCount,
      matchedCardCount: checkedCardCount,
      missingSetCount: missingSetIds.length
    }
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

const LEGACY_XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

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

async function downloadDriveFileBlob(fileId, accessToken) {
  const url = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`;
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  });

  if (!response.ok) {
    let detail = '';
    try {
      const payload = await response.json();
      detail = String(payload?.error?.message || '').trim();
    } catch {
      detail = '';
    }

    const error = new Error(detail || response.statusText || `Drive-Download fehlgeschlagen (${response.status})`);
    error.status = response.status;
    throw error;
  }

  return response.blob();
}

async function tryLoadLegacyWorkbookFromSiblingDriveXlsx(spreadsheetId) {
  const token = globalThis.gapi?.client?.getToken?.() || null;
  const accessToken = String(token?.access_token || '').trim();
  const oauthRef = globalThis.google?.accounts?.oauth2;

  if (!accessToken) {
    if (!oauthRef) return null;
    const err = new Error('Für den direkten Google-Sheets-Import wird einmalig zusätzliche Google-Drive-Leseberechtigung benötigt.');
    err.code = 'legacy-drive-export-scope-required';
    throw err;
  }

  let metaResponse;
  try {
    metaResponse = await fetch(
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(spreadsheetId)}?fields=id,name,mimeType,parents`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`
        }
      }
    );
  } catch (err) {
    console.warn('[tryLoadLegacyWorkbookFromSiblingDriveXlsx] metadata fetch failed', err);
    return null;
  }

  if (!metaResponse.ok) {
    let detail = '';
    try {
      const payload = await metaResponse.json();
      detail = String(payload?.error?.message || '').trim();
    } catch {
      detail = '';
    }

    if (metaResponse.status === 401 || /insufficient authentication scopes/i.test(detail)) {
      const err = new Error('Für den direkten Google-Sheets-Import wird einmalig zusätzliche Google-Drive-Leseberechtigung benötigt.');
      err.code = 'legacy-drive-export-scope-required';
      throw err;
    }

    console.warn('[tryLoadLegacyWorkbookFromSiblingDriveXlsx] metadata lookup failed', metaResponse.status, detail || metaResponse.statusText);
    return null;
  }

  const sourceFile = await metaResponse.json();
  const sourceName = String(sourceFile?.name || '').trim();
  if (!sourceName) return null;

  const exactXlsxName = sourceName.toLowerCase().endsWith('.xlsx') ? sourceName : `${sourceName}.xlsx`;
  const query = [
    'trashed = false',
    `mimeType = '${LEGACY_XLSX_MIME}'`,
    `name = '${escapeDriveQueryValue(exactXlsxName)}'`
  ].join(' and ');

  let listResponse;
  try {
    listResponse = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name,mimeType,fileExtension,parents,modifiedTime)&pageSize=25&orderBy=modifiedTime desc`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`
        }
      }
    );
  } catch (err) {
    console.warn('[tryLoadLegacyWorkbookFromSiblingDriveXlsx] sibling list failed', err);
    return null;
  }

  if (!listResponse.ok) {
    let detail = '';
    try {
      const payload = await listResponse.json();
      detail = String(payload?.error?.message || '').trim();
    } catch {
      detail = '';
    }

    if (listResponse.status === 401 || /insufficient authentication scopes/i.test(detail)) {
      const err = new Error('Für den direkten Google-Sheets-Import wird einmalig zusätzliche Google-Drive-Leseberechtigung benötigt.');
      err.code = 'legacy-drive-export-scope-required';
      throw err;
    }

    console.warn('[tryLoadLegacyWorkbookFromSiblingDriveXlsx] sibling search failed', listResponse.status, detail || listResponse.statusText);
    return null;
  }

  const listPayload = await listResponse.json();
  const preferredFile = pickPreferredLegacyDriveXlsxFile(sourceFile, listPayload?.files || []);
  if (!preferredFile?.id || preferredFile.id === spreadsheetId) return null;

  try {
    const blob = await downloadDriveFileBlob(preferredFile.id, accessToken);
    if (blob && blob.size > 0) {
      return loadLegacyWorkbookFromFile(blob);
    }
  } catch (err) {
    if (err?.status === 401 || /insufficient authentication scopes/i.test(String(err?.message || ''))) {
      const scopeErr = new Error('Für den direkten Google-Sheets-Import wird einmalig zusätzliche Google-Drive-Leseberechtigung benötigt.');
      scopeErr.code = 'legacy-drive-export-scope-required';
      throw scopeErr;
    }
    console.warn('[tryLoadLegacyWorkbookFromSiblingDriveXlsx] sibling download failed', err);
  }

  return null;
}

async function tryLoadLegacyWorkbookFromDriveExport(spreadsheetId) {
  const token = globalThis.gapi?.client?.getToken?.() || null;
  const accessToken = String(token?.access_token || '').trim();
  const oauthRef = globalThis.google?.accounts?.oauth2;

  if (!accessToken) {
    if (!oauthRef) return null;
    const err = new Error('Für den direkten Google-Sheets-Import wird einmalig zusätzliche Google-Drive-Leseberechtigung benötigt.');
    err.code = 'legacy-drive-export-scope-required';
    throw err;
  }

  const exportUrl = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(spreadsheetId)}/export?mimeType=${encodeURIComponent(LEGACY_XLSX_MIME)}`;

  let response;
  try {
    response = await fetch(exportUrl, {
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    });
  } catch (err) {
    console.warn('[tryLoadLegacyWorkbookFromDriveExport] export fetch failed', err);
    return null;
  }

  if (response.ok) {
    const blob = await response.blob();
    if (blob && blob.size > 0) {
      return loadLegacyWorkbookFromFile(blob);
    }
    return null;
  }

  let detail = '';
  try {
    const payload = await response.json();
    detail = String(payload?.error?.message || '').trim();
  } catch {
    detail = '';
  }

  if (response.status === 401 || /insufficient authentication scopes/i.test(detail)) {
    const err = new Error('Für den direkten Google-Sheets-Import wird einmalig zusätzliche Google-Drive-Leseberechtigung benötigt.');
    err.code = 'legacy-drive-export-scope-required';
    throw err;
  }

  console.warn('[tryLoadLegacyWorkbookFromDriveExport] falling back to grid data', response.status, detail || response.statusText);
  return null;
}

export async function loadLegacyWorkbookFromSpreadsheetInput(input) {
  const spreadsheetId = extractLegacySpreadsheetId(input);
  if (!spreadsheetId) {
    throw new Error('Ungültiger Google-Sheets-Link oder Spreadsheet-ID.');
  }

  const siblingXlsxWorkbook = await tryLoadLegacyWorkbookFromSiblingDriveXlsx(spreadsheetId);
  if (siblingXlsxWorkbook) {
    return siblingXlsxWorkbook;
  }

  const exportedWorkbook = await tryLoadLegacyWorkbookFromDriveExport(spreadsheetId);
  if (exportedWorkbook) {
    return exportedWorkbook;
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
      fields: 'sheets.properties(title),sheets.data.rowData.values(userEnteredValue,effectiveValue,formattedValue,note)'
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
