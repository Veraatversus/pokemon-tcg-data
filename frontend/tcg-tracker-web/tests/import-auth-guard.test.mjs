import test from 'node:test';
import assert from 'node:assert/strict';

import {
  isAuthReloginRequiredError,
  getAuthReloginImportMessage,
} from '../js/features/collection/import-auth-guard.js';

test('isAuthReloginRequiredError erkennt AUTH_RELOGIN_REQUIRED und 401/403 auth Fehler', () => {
  assert.equal(isAuthReloginRequiredError({ code: 'AUTH_RELOGIN_REQUIRED' }), true);
  assert.equal(isAuthReloginRequiredError({ status: 401 }), true);
  assert.equal(isAuthReloginRequiredError({ result: { error: { code: 403 } } }), true);
  assert.equal(isAuthReloginRequiredError(new Error('Google-Anmeldung abgelaufen')), true);
  assert.equal(isAuthReloginRequiredError(new Error('permission denied')), true);
  assert.equal(isAuthReloginRequiredError({ status: 429 }), false);
});

test('getAuthReloginImportMessage liefert konsistente Nutzerhinweise', () => {
  const msg = getAuthReloginImportMessage();
  assert.equal(typeof msg, 'string');
  assert.equal(msg.length > 20, true);
  assert.equal(msg.includes('Google'), true);
  assert.equal(msg.includes('neu anmelden'), true);
});
