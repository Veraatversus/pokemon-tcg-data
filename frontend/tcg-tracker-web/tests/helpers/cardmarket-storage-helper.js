// Re-exportiert den Cardmarket-Build-Stamp-Speicherkey, damit Tests nicht
// den String 'poke:dev:cardmarket-build-stamp' duplizieren muessen.
export { scopedStorageKey as getCardmarketStampStorageKey } from '../../js/core/config.js';

import { scopedStorageKey } from '../../js/core/config.js';
export const STORAGE_KEY = scopedStorageKey('cardmarket-build-stamp');
