export const CONFIG = {
  // ── Google API ──────────────────────────────────────────────
  GOOGLE_CLIENT_ID: 'REDACTED_PLACEHOLDER.apps.googleusercontent.com',
  GOOGLE_API_KEY: 'REDACTED_PLACEHOLDER',
  SPREADSHEET_ID: 'REDACTED_PLACEHOLDER',
  DISCOVERY_DOCS: ['https://sheets.googleapis.com/$discovery/rest?version=v4'],
  SCOPES: 'https://www.googleapis.com/auth/spreadsheets',

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
  CUSTOM_SET_ID_MAPPINGS: {
    'swsh3.5': 'swsh35',
    'swsh4.5': 'swsh45',
    'swsh45.sv': 'swsh45sv',
    'sv3.5': 'sv3pt5',
    'sv4.5': 'sv4pt5',
    'sv6.5': 'sv6pt5',
    'sv8.5': 'sv8pt5'
  }
};

