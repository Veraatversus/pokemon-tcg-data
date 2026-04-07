function detectStorageScope() {
  const locationRef = globalThis?.location;
  const path = String(locationRef?.pathname || '/').toLowerCase();
  const search = String(locationRef?.search || '').toLowerCase();
  const segments = path.split('/').filter(Boolean);

  if (/([?&])env=dev([&#]|$)/.test(search) || /([?&])scope=dev([&#]|$)/.test(search)) {
    return 'dev';
  }

  if (/([?&])env=release([&#]|$)/.test(search) || /([?&])scope=release([&#]|$)/.test(search)) {
    return 'release';
  }

  if (segments.includes('dev')) {
    return 'dev';
  }

  return 'release';
}

export const STORAGE_SCOPE = detectStorageScope();

export function scopedStorageKey(baseKey) {
  return `poke:${STORAGE_SCOPE}:${baseKey}`;
}

export function scopedStoragePrefix(basePrefix = '') {
  return `poke:${STORAGE_SCOPE}:${basePrefix}`;
}

const SPREADSHEET_ID_KEY = scopedStorageKey('tcg_spreadsheet_id');

export const CONFIG = {
  // ── Google API ──────────────────────────────────────────────
  GOOGLE_CLIENT_ID: 'REDACTED_GOOGLE_CLIENT_ID',
  GOOGLE_API_KEY: 'REDACTED_GOOGLE_API_KEY',
  get SPREADSHEET_ID() {
    return localStorage.getItem(SPREADSHEET_ID_KEY) || '';
  },
  set SPREADSHEET_ID(id) {
    if (id) localStorage.setItem(SPREADSHEET_ID_KEY, id);
    else    localStorage.removeItem(SPREADSHEET_ID_KEY);
  },
  DISCOVERY_DOCS: [
    'https://sheets.googleapis.com/$discovery/rest?version=v4',
    'https://www.googleapis.com/discovery/v1/apis/drive/v3/rest'
  ],
  SCOPES: 'https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive.metadata.readonly',

  // ── Sheet-Namen ─────────────────────────────────────────────
  SHEETS: {
    OVERVIEW: 'Sets Overview',
    SETTINGS: 'WebApp Settings',
    SUMMARY: 'Collection Summary'
  },

  // ── Sheets-Grid-Konstanten (identisch zu pokecode.js) ───────
  GRID: {
    CARDS_PER_ROW: 5,
    BLOCK_WIDTH: 3,
    BLOCK_HEIGHT: 4,
    HEADER_ROWS: 2,
    IMPORTED_COL_INDEX: 9  // 1-basiert, Spalte I
  },

  // ── API-Endpunkte ────────────────────────────────────────────
  APIS: {
    POKEMONTCG: 'https://api.pokemontcg.io/v2',
    TCGDEX_DE: 'https://api.tcgdex.net/v2/de',  // kein trailing slash!
    TCGDEX_EN: 'https://api.tcgdex.net/v2/en',
    VERA_BASE: 'https://veraatversus.github.io/pokemon-tcg-data'
  },

  // ── Vera-API-Einstellungen ───────────────────────────────────
  USE_VERA_API: true,
  VERA_API_LANGUAGE: 'en',

  // ── Cache-Dauer ──────────────────────────────────────────────
  CACHE_TTL_MS: 10 * 60 * 1000,  // 10 Minuten

  // ── Karten-Farben (passend zu Google Sheets) ────────────────
  COLORS: {
    COLLECTED: '#D9EAD3',
    REVERSE: '#D0E0F0'
  },

  // ── TCGDex-ID-Übersetzungstabelle ───────────────────────────
  // Pokemontcg.io-ID → TCGDex-ID, wenn sie sich unterscheiden
  // Aktuelle Einträge sind bewusst deaktiviert und können gezielt wieder aktiviert werden.
  CUSTOM_SET_ID_MAPPINGS: {
    // 'swsh3.5': 'swsh35',
    // 'sm2.5': 'sm25',
    // 'sm3.5': 'sm35',
    // 'sm7.5': 'sm75',
    // 'swsh4.5': 'swsh45',
    // 'sm35': 'sm3.5',
    // 'sm75': 'sm7.5',
    // 'swsh35': 'swsh3.5',
    // 'swsh45': 'swsh4.5',
    // 'swsh45.sv': 'swsh45sv',
    // 'zsv10pt5': 'sv10.5b',
    // 'rsv10pt5': 'sv10.5w',
    // 'sv3.5': 'sv3pt5',
    // 'sv4.5': 'sv4pt5',
    // 'sv6.5': 'sv6pt5',
    // 'sv8.5': 'sv8pt5'
  }
};

