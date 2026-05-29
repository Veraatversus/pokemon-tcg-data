import assert from 'node:assert/strict';

const storedSettings = {
  autoImportMode: true,
  cardmarketBasePriceType: 'invalid-value'
};

globalThis.localStorage = {
  getItem(key) {
    if (key && String(key).includes('user-settings')) {
      return JSON.stringify(storedSettings);
    }
    return null;
  },
  setItem() {},
  removeItem() {}
};

const { loadSettings } = await import('../js/enhanced-features.js');
const settings = loadSettings();

assert.equal(
  Object.prototype.hasOwnProperty.call(settings, 'autoImportMode'),
  false,
  'Die veraltete Einstellung autoImportMode soll nicht mehr im Settings-Objekt auftauchen.'
);

assert.equal(
  settings.cardmarketBasePriceType,
  'trend',
  'Ungueltige cardmarketBasePriceType-Werte sollen auf den Trend-Default zurueckfallen.'
);

console.log('✅ settings auto-import removal ok');
