import { scopedStorageKey } from './core/config.js';

const STORAGE_KEYS = {
  favorites: scopedStorageKey('favorites-sets'),
  searchHistory: scopedStorageKey('search-history'),
  settings: scopedStorageKey('user-settings'),
  syncStatus: scopedStorageKey('sync-status')
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
  expertResolverMode: false,
  cardmarketBasePriceType: CARDMARKET_BASE_PRICE_DEFAULT
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
export function loadFavorites() {
  return new Set(readJson(STORAGE_KEYS.favorites, []));
}

export function saveFavorites(favorites) {
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

// Collection reporting helpers
export function createCollectionSnapshot(collection = {}, sets = []) {
  return {
    createdAt: new Date().toISOString(),
    collection,
    sets,
    setCount: Array.isArray(sets) ? sets.length : 0
  };
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
  normalized.cardmarketBasePriceType = normalizeCardmarketBasePriceType(normalized.cardmarketBasePriceType);
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

export function updateSetting(key, value) {
  const settings = loadSettings();
  settings[key] = value;
  saveSettings(settings);
  return settings;
}

// Filters and stats
export function applyQuickFilters(sets = [], filterState = {}) {
  const list = Array.isArray(sets) ? sets : [];
  if (!filterState || Object.keys(filterState).length === 0) return list;

  return list.filter((set) => {
    if (filterState.importedOnly && !set.imported) return false;
    if (filterState.favoritesOnly && !isFavorite(set.setId)) return false;
    if (filterState.series && String(set.series || '') !== String(filterState.series)) return false;
    return true;
  });
}

export function calculateCollectionStats(summaryData = []) {
  const rows = Array.isArray(summaryData) ? summaryData : [];
  const totals = rows.reduce((acc, row) => {
    acc.total += Number(row?.total) || 0;
    acc.collected += Number(row?.collected) || 0;
    acc.rh += Number(row?.rh) || 0;
    return acc;
  }, { total: 0, collected: 0, rh: 0 });

  const percent = totals.total > 0 ? Math.round((totals.collected / totals.total) * 10000) / 100 : 0;
  return { ...totals, percent, sets: rows.length };
}

// Sync status
export function getSyncStatus() {
  return readJson(STORAGE_KEYS.syncStatus, { state: 'idle', updatedAt: null });
}

export function setSyncStatus(status) {
  const payload = {
    ...(status || {}),
    updatedAt: new Date().toISOString()
  };
  writeJson(STORAGE_KEYS.syncStatus, payload);
  return payload;
}
