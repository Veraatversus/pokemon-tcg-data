import assert from 'node:assert/strict';

globalThis.localStorage = {
  getItem() { return null; },
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

console.log('✅ settings auto-import removal ok');
