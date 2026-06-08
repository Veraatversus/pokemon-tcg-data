/**
 * Centralized storage key definitions for localStorage.
 * This module ensures consistent key naming and prevents typos/collisions.
 *
 * All keys use scopedStorageKey() for environment isolation (dev vs release).
 * Scope can be: user, app, cache, preferences, sync.
 */

import { scopedStorageKey } from './config.js?v=20260608-stats-live-progress-rh-fix';

// ============================================================================
// User & Identity Keys
// ============================================================================

/**
 * Unique client identifier for realtime sync.
 * Generated once per browser, persists across sessions.
 * Format: `client_<timestamp>` or `client_<uuid>`
 */
export const REALTIME_CLIENT_STORAGE_KEY = scopedStorageKey('realtime_client_id');

/**
 * User ID from Google authentication or local fallback.
 * Synced from profile.userId or generated as `user_<timestamp>`.
 */
export const USER_ID_STORAGE_KEY = scopedStorageKey('user_id');

// ============================================================================
// UI Preferences Keys
// ============================================================================

/**
 * Dashboard view preferences (compactness, sort, filter settings).
 * Value: JSON object with { compact: bool, sort: string, filter: string, ... }
 */
export const DASHBOARD_PREFS_STORAGE_KEY = scopedStorageKey('dashboard_prefs_v1');

/**
 * Grid zoom level for card displays (set view, search results).
 * Value: number (0–1 or pixel size depending on implementation).
 * Note: Uses non-scoped key for backward compatibility.
 */
export const GRID_ZOOM_STORAGE_KEY = 'gridZoom';

/**
 * Recently viewed sets (for quick navigation).
 * Value: JSON array of { setId, setName, timestamp }
 */
export const RECENT_SETS_STORAGE_KEY = scopedStorageKey('recent_sets_v1');

/**
 * Queue presets for bulk actions.
 * Value: JSON array of preset configurations.
 */
export const QUEUE_PRESETS_STORAGE_KEY = scopedStorageKey('queue_presets_v1');

// ============================================================================
// Feature Flags & Dev Keys
// ============================================================================

/**
 * Developer completion mode flag.
 * Value: '1' = enabled, absent = disabled.
 * Toggled via ?devCompletion=1&0 query parameter.
 */
export const DEV_COMPLETION_STORAGE_KEY = scopedStorageKey('dev_completion_mode');

// ============================================================================
// Cache & Sync Keys
// ============================================================================

/**
 * Generic cache invalidation key for triggering full reload.
 * Value: '1' to mark cache as invalid; removed after acknowledgment.
 * Used by Service Worker / PWA to signal app to clear all caches.
 */
export const CACHE_INVALIDATION_KEY_PREFIX = 'tcg_tracker:cache:invalidate_';

/**
 * Timestamp of last successful Sheets sync.
 * Value: ISO string or milliseconds since epoch.
 */
export const LAST_SHEETS_SYNC_KEY = 'tcg_tracker:sync:last_sheets_sync';

/**
 * Timestamp of last successful API overiew sync.
 * Value: ISO string or milliseconds since epoch.
 */
export const LAST_API_SYNC_KEY = 'tcg_tracker:sync:last_api_sync';

// ============================================================================
// Event Names (Custom & Standard)
// ============================================================================

/**
 * Custom event fired when dashboard quick-filters change.
 * Dispatched with: new CustomEvent('quick-filters-changed', { detail: { filter, sort } })
 */
export const EVENT_QUICK_FILTERS_CHANGED = 'quick-filters-changed';

/**
 * Event fired when a spreadsheet is successfully switched.
 * Dispatched with: new CustomEvent('spreadsheet-switched', { detail: { spreadsheetId, timestamp } })
 */
export const EVENT_SPREADSHEET_SWITCHED = 'spreadsheet-switched';

/**
 * Event fired when collection state is updated (card imported, toggled, etc.).
 * Dispatched with: new CustomEvent('collection-updated', { detail: { setId, cardId, status } })
 */
export const EVENT_COLLECTION_UPDATED = 'collection-updated';

/**
 * Event fired when search history should be cleared from UI actions.
 */
export const EVENT_CLEAR_SEARCH_HISTORY = 'clear-search-history';

/**
 * Events emitted by sheets-db write pipeline for retry reporting.
 */
export const EVENT_SHEETS_WRITE_RETRY = 'sheets-write-retry';
export const EVENT_SHEETS_WRITE_SUCCESS = 'sheets-write-success';
export const EVENT_SHEETS_WRITE_FAILED = 'sheets-write-failed';

/**
 * Standard browser events (for reference).
 * - 'hashchange': Route/view changed
 * - 'scroll': User scrolled
 * - 'resize': Viewport resized
 * - 'orientationchange': Device orientation changed
 * - 'change': Form control value changed
 * - 'updatefound': Service Worker has update
 * - 'statechange': Service Worker changed state
 * - 'controllerchange': Service Worker took control
 */

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Get or create a cache invalidation key for a specific feature.
 * @param {string} feature - Feature name (e.g., 'dashboard', 'search', 'sets')
 * @returns {string} - Full storage key
 */
export function getCacheInvalidationKey(feature) {
  return CACHE_INVALIDATION_KEY_PREFIX + feature;
}

/**
 * Check if a feature cache is marked as invalid.
 * @param {string} feature - Feature name
 * @returns {boolean} - true if marked invalid
 */
export function isCacheInvalidated(feature) {
  return localStorage.getItem(getCacheInvalidationKey(feature)) === '1';
}

/**
 * Mark a feature cache as invalid, triggering refresh on next load.
 * @param {string} feature - Feature name
 */
export function invalidateCache(feature) {
  localStorage.setItem(getCacheInvalidationKey(feature), '1');
}

/**
 * Clear a feature cache invalidation flag after refresh.
 * @param {string} feature - Feature name
 */
export function acknowledgeInvalidation(feature) {
  localStorage.removeItem(getCacheInvalidationKey(feature));
}

// ============================================================================
// Deprecation Notice
// ============================================================================

/**
 * @deprecated Use named constants above instead of hardcoded strings.
 * Legacy usage example:
 *   BAD:  localStorage.getItem('recent_sets')
 *   GOOD: localStorage.getItem(RECENT_SETS_STORAGE_KEY)
 */
