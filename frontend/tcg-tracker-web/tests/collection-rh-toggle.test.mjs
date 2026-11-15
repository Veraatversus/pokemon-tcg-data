// RH direkt anklicken, auch wenn die Karte noch keine Sammlungszeile hat (Set nicht importiert oder Karte neu):
// der Klick legt die Zeile an (automatischer Set-Import bzw. ensureWritableCollectionEntry) und setzt G mit.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getCollectionUiState, resolveCollectionToggleState } from '../js/core/collection-state.js';
import { emptyCollectionEntry } from '../js/data/collection-writes.js';

test('RH ist ohne Sammlungszeile klickbar (nicht importiertes Set)', () => {
  const entry = emptyCollectionEntry({ number: '11' }, '11');
  const ui = getCollectionUiState(entry, { isEditable: true });
  assert.equal(ui.gDisabled, false);
  assert.equal(ui.rhDisabled, false);
});

test('RH bleibt gesperrt, wenn das Set nicht bearbeitbar ist', () => {
  const ui = getCollectionUiState(emptyCollectionEntry({ number: '11' }, '11'), { isEditable: false });
  assert.equal(ui.rhDisabled, true);
});

test('RH anhaken setzt gesammelt mit', () => {
  assert.deepEqual(resolveCollectionToggleState(emptyCollectionEntry({ number: '11' }, '11'), { isG: false, checked: true }), { g: true, rh: true });
});
