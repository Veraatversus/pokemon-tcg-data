import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalizeCardNumber, cardMatchKey } from '../lib/card-key.mjs';
import { setIdCandidates, normalizeTcgdexSetId } from '../lib/set-id.mjs';
import { namesSimilar } from '../lib/names.mjs';

// Golden-Datei: [Eingabe, Erwartung] fuer jede distinkte `number` aus cards/en/*.json,
// einmalig mit normalizeCardNumber aus dem Frontend (js/core/utils.js) erzeugt.
// Schluesselvertrag: die Build-Skripte muessen identisch zum Frontend normalisieren.
const golden = JSON.parse(readFileSync(new URL('./fixtures/card-key-parity.json', import.meta.url), 'utf8'));

test('normalizeCardNumber == Frontend (Golden) fuer alle pokemontcg-Nummern', () => {
  assert.ok(golden.length > 1000);
  for (const [input, expected] of golden) assert.equal(normalizeCardNumber(input), expected, input);
});
test('cardMatchKey', () => {
  assert.equal(cardMatchKey('006'), '6'); assert.equal(cardMatchKey('H01'), 'h1');
  assert.equal(cardMatchKey('TG01'), cardMatchKey('tg1')); assert.equal(cardMatchKey('SV001'), 'sv1');
  assert.equal(cardMatchKey('50a'), '50a');
});
test('setIdCandidates', () => {
  assert.ok(setIdCandidates('sv3pt5').includes(normalizeTcgdexSetId('sv03.5')));
  assert.ok(setIdCandidates('swsh45sv').includes(normalizeTcgdexSetId('swsh4.5sv')));
  assert.ok(setIdCandidates('sm35').includes(normalizeTcgdexSetId('sm3.5')));
  assert.ok(setIdCandidates('cel25').includes(normalizeTcgdexSetId('cel25')));
  assert.ok(setIdCandidates('sv1').includes(normalizeTcgdexSetId('sv01')));
});
test('namesSimilar', () => {
  assert.ok(namesSimilar('Charizard ex', 'Charizard-ex'));
  assert.ok(namesSimilar('Pokémon Center', 'Pokemon Center'));
  assert.ok(!namesSimilar('Venusaur', 'Claydol'));
});
