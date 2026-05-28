import test from 'node:test';
import assert from 'node:assert/strict';

import { sanitizeDisplayText } from '../js/core/display-text.js';

test('sanitizeDisplayText ersetzt Replacement-Zeichen und Separator-Muell', () => {
  const input = 'Reisegefaehrten \uFFFD Alias: Glurak \uFFFD Promo';
  assert.equal(sanitizeDisplayText(input), 'Reisegefaehrten - Alias: Glurak - Promo');
});

test('sanitizeDisplayText normalisiert typische UTF8-Mojibake', () => {
  const input = 'StÃ¤rkste Serie â€“ noch lÃ¤uftâ€¦';
  assert.equal(sanitizeDisplayText(input), 'Staerkste Serie - noch laeuft...');
});

test('sanitizeDisplayText liefert Fallback bei leerem Input', () => {
  assert.equal(sanitizeDisplayText('', 'Unbekannt'), 'Unbekannt');
});
