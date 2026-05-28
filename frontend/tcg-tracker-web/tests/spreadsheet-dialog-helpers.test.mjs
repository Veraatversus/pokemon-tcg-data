import test from 'node:test';
import assert from 'node:assert/strict';

import {
  normalizeSpreadsheetDisplayText,
  formatSpreadsheetOptionLabel,
  resolveSpreadsheetSelectionErrorMessage,
} from '../js/features/settings/spreadsheet-dialog-helpers.js';

test('normalizeSpreadsheetDisplayText ersetzt Replacement-Zeichen robust', () => {
  const input = 'Farmtrain \uFFFD Freigegeben';
  assert.equal(normalizeSpreadsheetDisplayText(input), 'Farmtrain - Freigegeben');
});

test('formatSpreadsheetOptionLabel formatiert Name und Quelle konsistent', () => {
  const label = formatSpreadsheetOptionLabel('Pokemon Tabelle \uFFFD', 'Freigegeben');
  assert.equal(label, 'Pokemon Tabelle - Freigegeben');
});

test('resolveSpreadsheetSelectionErrorMessage liefert 403-Hinweis mit Spreadsheet-ID', () => {
  const err = {
    status: 403,
    result: {
      error: {
        status: 'PERMISSION_DENIED',
      },
    },
  };

  const message = resolveSpreadsheetSelectionErrorMessage(err, '1abc234def');
  assert.match(message, /Kein Zugriff auf diese Tabelle/i);
  assert.match(message, /1abc234def/);
  assert.match(message, /freigeben/i);
});

test('resolveSpreadsheetSelectionErrorMessage faellt bei unbekannten Fehlern auf Basistext zurueck', () => {
  const err = new Error('Boom');
  const message = resolveSpreadsheetSelectionErrorMessage(err, 'sheet-1');
  assert.match(message, /Tabelle konnte nicht verwendet werden/i);
  assert.match(message, /Boom/);
});
