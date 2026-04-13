/**
 * utils.js – Gemeinsame Hilfsfunktionen für tcg-tracker-web
 */

/**
 * Normalisiert eine Kartennummer:
 * führende Nullen entfernen, alphabetische Präfixe/Suffixe bewahren.
 * Beispiele: "001" → "1", "SWSH001" → "SWSH1", "1a" → "1a"
 * @param {string|number} cardNumber
 * @returns {string}
 */
export function normalizeCardNumber(cardNumber) {
  if (cardNumber === null || cardNumber === undefined) return '';
  let normalized = String(cardNumber).trim();
  if (!normalized) return '';

  const slashIndex = normalized.indexOf('/');
  if (slashIndex > 0) {
    normalized = normalized.slice(0, slashIndex).trim();
  }

  const match = normalized.match(/^([a-zA-Z._-]*?)(\d+)([a-zA-Z._-]*)$/);
  if (!match) return normalized;
  const prefix = match[1];
  const numericPart = parseInt(match[2], 10).toString();
  const suffix = match[3];
  return `${prefix}${numericPart}${suffix}`;
}

/**
 * Natürlich sortiert ein Array von Objekten nach einem Schlüssel.
 * Numerische Segmente werden korrekt als Zahlen verglichen.
 * @param {object[]} arr
 * @param {string|((item: object) => string)} key  Schlüssel oder Accessor-Funktion
 * @returns {object[]} Neues sortiertes Array (original wird nicht mutiert)
 */
export function naturalSort(arr, key) {
  const getValue = typeof key === 'function' ? key : (item) => item[key] ?? '';
  return [...arr].sort((a, b) =>
    String(getValue(a)).localeCompare(String(getValue(b)), undefined, {
      numeric: true,
      sensitivity: 'base'
    })
  );
}

/**
 * Robuste Boolean-Konvertierung:
 * Behandelt true, "true", "TRUE", "1", 1 → true; alles andere → false.
 * @param {*} value
 * @returns {boolean}
 */
export function toBoolean(value) {
  if (value === true) return true;
  if (value === false) return false;
  const str = String(value).trim().toLowerCase();
  return str === 'true' || str === '1';
}

/**
 * Liefert die State-Felder, die beim Wechsel auf ein anderes Spreadsheet
 * bewusst geleert werden müssen, damit keine alten Tabellen-/Suchdaten
 * in der Oberfläche hängen bleiben.
 * @param {object} [currentState]
 * @returns {object}
 */
export function createSpreadsheetSwitchStatePatch(currentState = {}) {
  return {
    summaryData: null,
    summaryOverrides: new Map(),
    currentSet: null,
    dbMap: new Map(),
    cards: [],
    filter: 'all',
    sortOrder: 'number',
    bulkMode: false,
    bulkSelected: new Set(),
    batchSelection: new Set(),
    manageSetsSelection: new Set(),
    undoStack: [],
    auditEntries: [],
    searchCache: new Map(),
    searchRunId: Number(currentState?.searchRunId || 0) + 1,
    searchAbortController: null,
    pendingSearchSetImport: false,
    pendingSearchCardFocusKey: null,
  };
}

const COMBINED_SEARCH_SCOPE_PREFIX = 'scope:';
const COMBINED_SEARCH_SET_PREFIX = 'set:';
const COMBINED_SEARCH_SCOPE_VALUES = new Set(['imported', 'all', 'online']);

/**
 * Löst die kombinierte Suchauswahl in Modus + optionalem Set auf.
 * Globale Suchmodi verwenden Werte wie `scope:imported`, konkrete Sets entweder
 * direkt ihre `setId` (importiert) oder `set:all:<setId>` für noch nicht
 * importierte/API-Sets.
 * @param {string} value
 * @param {string} [fallbackMode='all']
 * @returns {{ mode: string, setId: string }}
 */
export function resolveCombinedSearchSelection(value, fallbackMode = 'all') {
  const raw = String(value || '').trim();
  if (!raw) {
    return { mode: fallbackMode, setId: '' };
  }

  if (raw.startsWith(COMBINED_SEARCH_SCOPE_PREFIX)) {
    const mode = raw.slice(COMBINED_SEARCH_SCOPE_PREFIX.length).trim().toLowerCase();
    if (COMBINED_SEARCH_SCOPE_VALUES.has(mode)) {
      return { mode, setId: '' };
    }
  }

  if (raw.startsWith(COMBINED_SEARCH_SET_PREFIX)) {
    const [, modePart = '', ...setIdParts] = raw.split(':');
    const mode = modePart.trim().toLowerCase();
    const setId = setIdParts.join(':').trim();
    if (setId && COMBINED_SEARCH_SCOPE_VALUES.has(mode)) {
      return { mode, setId };
    }
  }

  return { mode: 'imported', setId: raw };
}

/**
 * Baut die Optionsgruppen für das kombinierte Such-Dropdown auf.
 * @param {Array<{setId:string, setName?:string, imported?:boolean}>} sets
 * @returns {Array<{label:string, options:Array<{value:string,label:string,mode?:string,imported?:boolean}>}>}
 */
export function buildCombinedSearchDropdownOptions(sets = []) {
  const groups = [
    {
      label: 'Suchbereich',
      options: [
        { value: 'scope:all', label: 'Alle Sets' },
        { value: 'scope:imported', label: 'Importierte Sets' },
        { value: 'scope:online', label: 'Online-Suche' }
      ]
    }
  ];

  const safeSets = (Array.isArray(sets) ? sets : []).filter((set) => set?.setId);
  const importedOptions = safeSets
    .filter((set) => toBoolean(set.imported))
    .map((set) => ({
      value: String(set.setId),
      label: String(set.setName || set.setId),
      mode: 'imported',
      imported: true
    }));

  const notImportedOptions = naturalSort(
    safeSets.filter((set) => !toBoolean(set.imported)),
    (set) => String(set.setName || set.setId)
  ).map((set) => ({
    value: `${COMBINED_SEARCH_SET_PREFIX}all:${String(set.setId)}`,
    label: String(set.setName || set.setId),
    mode: 'all',
    imported: false
  }));

  if (importedOptions.length) {
    groups.push({
      label: 'Importierte Sets',
      options: importedOptions
    });
  }

  if (notImportedOptions.length) {
    groups.push({
      label: 'Weitere Sets (noch nicht importiert)',
      options: notImportedOptions
    });
  }

  return groups;
}

/**
 * Entscheidet, ob die Kartensuche für ein Set zusätzlich API-Karten laden soll.
 * Das ist wichtig, wenn ein Set zwar schon als importiert markiert ist, aber im
 * lokalen `db_cards` Cache (noch) keine Karten liegen – sonst liefert
 * `Importierte Sets` fälschlich 0 Treffer, obwohl `Alle Sets` etwas findet.
 * @param {string} mode
 * @param {{ imported?: boolean }} [set]
 * @param {boolean} [hasDbCards=false]
 * @returns {boolean}
 */
export function shouldFetchApiCardsForSearchSet(mode, set = {}, hasDbCards = false) {
  if (mode === 'online') {
    return true;
  }

  const imported = toBoolean(set?.imported);
  if (mode === 'all') {
    return !imported || !hasDbCards;
  }

  if (mode === 'imported') {
    return imported && !hasDbCards;
  }

  return false;
}

/**
 * Baut einen kompakten Fortschrittstext für die Suche auf.
 * Gezählt werden nur Sets, deren Suche bereits vollständig abgeschlossen ist –
 * also lokale DB-Treffer plus bereits fertig nachgeladene API-Sets.
 * @param {{setsProcessed?: number, totalSets?: number, apiProcessed?: number, totalApiSets?: number}} [progress]
 * @returns {string}
 */
export function buildSearchProgressLabel(progress = {}) {
  const {
    setsProcessed = 0,
    totalSets = 0,
    apiProcessed = 0,
    totalApiSets = 0,
  } = progress;

  const safeTotalSets = Number.isFinite(totalSets) ? Math.max(0, totalSets) : 0;
  const safeSetsProcessed = safeTotalSets > 0
    ? Math.min(Math.max(0, setsProcessed), safeTotalSets)
    : 0;
  const safeApiTotal = Number.isFinite(totalApiSets) ? Math.max(0, totalApiSets) : 0;
  const safeApiProcessed = safeApiTotal > 0
    ? Math.min(Math.max(0, apiProcessed), safeApiTotal)
    : 0;

  if (safeTotalSets <= 0) {
    return '';
  }

  const completedSets = Math.min(
    safeTotalSets,
    Math.max(0, safeSetsProcessed - safeApiTotal + safeApiProcessed)
  );

  return ` · ${completedSets}/${safeTotalSets} Sets`;
}

/**
 * Extrahiert den Anzeigetext aus einer Google-Sheets-HYPERLINK-Formel.
 * Falls kein HYPERLINK vorhanden, den ursprünglichen Wert zurückgeben.
 * @param {string} value
 * @returns {string}
 */
export function extractDisplayTextFromHyperlink(value) {
  if (!value) return '';
  const text = String(value);
  const match = /=HYPERLINK\((?:"[^"]+"|[^,;]+)[,;]\s*"([^"]+)"\)/i.exec(text);
  return match ? match[1] : text;
}

/**
 * Wandelt einen 1-basierten Spaltenindex in A1-Notation um.
 * Beispiele: 1 → "A", 26 → "Z", 27 → "AA"
 * @param {number} col  1-basierter Spaltenindex
 * @returns {string}
 */
export function colToA1(col) {
  let n = col;
  let result = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    result = String.fromCharCode(65 + rem) + result;
    n = Math.floor((n - 1) / 26);
  }
  return result;
}
