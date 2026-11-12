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
  GOOGLE_CLIENT_ID: '1076184415163-bq3vk7p22m709m9u9bs4rhs76sjiddsl.apps.googleusercontent.com',
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
  SCOPES: 'https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive.metadata.readonly https://www.googleapis.com/auth/drive.readonly',

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
  // Karten-/Setdaten kommen nur aus api/v3 (+ api/registry). VERA_BASE dient nur noch
  // als Basis der Cardmarket-Daten (<VERA_BASE>/cardmarket, Build-Stamp).
  APIS: {
    VERA_BASE: 'https://veraatversus.github.io/pokemon-tcg-data',
    V3_BASE: '',        // leer = relativ zur App: ../../api/v3/
    REGISTRY_BASE: ''   // leer = relativ zur App: ../../api/registry/
  },

  // db_cards-Schreiben (Legacy-Sheet), gekapselt
  WRITE_DB_CARDS: true,

  // ── Support & Kontakt ───────────────────────────────────────
  SUPPORT: {
    CONTACT_EMAIL: 'veraatversus+tcg@gmail.com',
    channels: {
      bug: 'https://docs.google.com/forms/d/e/1FAIpQLSeDSU0GRKB6pDZPSXMoOwlsqXFjk0kcnGYyVAuB7zSJDO_HCw/viewform',
      feature: 'https://docs.google.com/forms/d/e/1FAIpQLSeDSU0GRKB6pDZPSXMoOwlsqXFjk0kcnGYyVAuB7zSJDO_HCw/viewform',
      access: 'https://docs.google.com/forms/d/e/1FAIpQLSeDSU0GRKB6pDZPSXMoOwlsqXFjk0kcnGYyVAuB7zSJDO_HCw/viewform'
    },
    fallbackUrls: {
      bug: '../kontakt.html#projektkontakt',
      feature: '../kontakt.html#projektkontakt',
      access: '../kontakt.html#projektkontakt'
    }
  },

  // ── Cache-Dauer ──────────────────────────────────────────────
  CACHE_TTL_MS: 10 * 60 * 1000,  // 10 Minuten

  // ── Karten-Farben (passend zu Google Sheets) ────────────────
  COLORS: {
    COLLECTED: '#D9EAD3',
    REVERSE: '#D0E0F0'
  }
};

