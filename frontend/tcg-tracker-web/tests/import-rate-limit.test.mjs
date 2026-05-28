import test from 'node:test';
import assert from 'node:assert/strict';

import {
  isSheetsQuotaError,
  getImportCooldownMs,
} from '../js/features/collection/import-rate-limit.js';

test('isSheetsQuotaError erkennt 429 und quota/rate-limit Nachrichten', () => {
  assert.equal(isSheetsQuotaError({ status: 429 }), true);
  assert.equal(isSheetsQuotaError({ result: { error: { code: 429 } } }), true);
  assert.equal(isSheetsQuotaError(new Error('Quota exceeded for quota metric')) , true);
  assert.equal(isSheetsQuotaError(new Error('Rate limit reached')) , true);
  assert.equal(isSheetsQuotaError({ status: 503, message: 'temporarily unavailable' }), false);
});

test('getImportCooldownMs skaliert bei Quota-Fehlern exponentiell und gecappt', () => {
  assert.equal(getImportCooldownMs({ consecutiveQuotaErrors: 0, baseDelayMs: 1200, quotaBaseDelayMs: 12000, maxDelayMs: 45000 }), 1200);
  assert.equal(getImportCooldownMs({ consecutiveQuotaErrors: 1, baseDelayMs: 1200, quotaBaseDelayMs: 12000, maxDelayMs: 45000 }), 12000);
  assert.equal(getImportCooldownMs({ consecutiveQuotaErrors: 2, baseDelayMs: 1200, quotaBaseDelayMs: 12000, maxDelayMs: 45000 }), 24000);
  assert.equal(getImportCooldownMs({ consecutiveQuotaErrors: 3, baseDelayMs: 1200, quotaBaseDelayMs: 12000, maxDelayMs: 45000 }), 45000);
});
