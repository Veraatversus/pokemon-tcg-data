import { scopedStorageKey } from './core/config.js';

const STORAGE_KEYS = {
  favorites: scopedStorageKey('favorites-sets'),
  searchHistory: scopedStorageKey('search-history'),
  settings: scopedStorageKey('user-settings')
};

const MAX_SEARCH_HISTORY = 20;
const CARDMARKET_BASE_PRICE_DEFAULT = 'trend';
const CARDMARKET_BASE_PRICE_ALLOWED = new Set([
  'trend',
  'average',
  'average1',
  'average7',
  'average30',
  'low'
]);

function normalizeCardmarketBasePriceType(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return CARDMARKET_BASE_PRICE_ALLOWED.has(normalized)
    ? normalized
    : CARDMARKET_BASE_PRICE_DEFAULT;
}

const DEFAULT_SETTINGS = {
  compactMode: false,
  autoBackup: false,
  notificationsEnabled: false,
  cardLanguage: 'de',
  cardmarketBasePriceType: CARDMARKET_BASE_PRICE_DEFAULT,
  // Unter den Karten Spanne low bis groesster juengerer Durchschnitt statt eines Werts (Berechnungen nutzen den Grundpreis).
  cardmarketPriceRange: false,
  // In der Spanne zusaetzlich den Grundpreis in der Mitte zeigen.
  cardmarketPriceRangeShowBase: false
};

function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

// Favorites
function loadFavorites() {
  return new Set(readJson(STORAGE_KEYS.favorites, []));
}

function saveFavorites(favorites) {
  const list = Array.isArray(favorites) ? favorites : Array.from(favorites || []);
  return writeJson(STORAGE_KEYS.favorites, list);
}

export function toggleFavorite(setId) {
  const favorites = loadFavorites();
  if (favorites.has(setId)) favorites.delete(setId);
  else favorites.add(setId);
  saveFavorites(favorites);
  return favorites.has(setId);
}

export function isFavorite(setId) {
  return loadFavorites().has(setId);
}

// Search history
export function loadSearchHistory() {
  return readJson(STORAGE_KEYS.searchHistory, []);
}

export function addSearchHistory(query) {
  const normalized = String(query || '').trim();
  if (!normalized || normalized.length < 2) return loadSearchHistory();
  let history = loadSearchHistory().filter((item) => item !== normalized);
  history.unshift(normalized);
  if (history.length > MAX_SEARCH_HISTORY) history = history.slice(0, MAX_SEARCH_HISTORY);
  writeJson(STORAGE_KEYS.searchHistory, history);
  return history;
}

export function clearSearchHistory() {
  localStorage.removeItem(STORAGE_KEYS.searchHistory);
  return true;
}

export function generateCollectionReport(collection = {}, sets = []) {
  const totalSets = Array.isArray(sets) ? sets.length : 0;
  const importedSets = Array.isArray(sets) ? sets.filter((s) => s && s.imported).length : 0;
  return {
    generatedAt: new Date().toISOString(),
    totalSets,
    importedSets,
    collection
  };
}

// Settings
function sanitizeSettings(settings = {}) {
  const normalized = settings && typeof settings === 'object' ? { ...settings } : {};
  delete normalized.autoImportMode;
  // Frueher Resolver-Matrix/Expert-Modus; die Anzeige folgt jetzt nur der Kartensprache.
  delete normalized.resolverMatrix;
  delete normalized.expertResolverMode;
  normalized.cardLanguage = String(normalized.cardLanguage || '').toLowerCase() === 'en' ? 'en' : 'de';
  normalized.cardmarketBasePriceType = normalizeCardmarketBasePriceType(normalized.cardmarketBasePriceType);
  normalized.cardmarketPriceRange = normalized.cardmarketPriceRange === true;
  normalized.cardmarketPriceRangeShowBase = normalized.cardmarketPriceRangeShowBase === true;
  return normalized;
}

export function loadSettings() {
  const stored = sanitizeSettings(readJson(STORAGE_KEYS.settings, {}));
  return {
    ...DEFAULT_SETTINGS,
    ...stored
  };
}

export function saveSettings(settings) {
  return writeJson(STORAGE_KEYS.settings, sanitizeSettings(settings));
}
