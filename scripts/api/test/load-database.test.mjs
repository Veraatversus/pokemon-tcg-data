import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadTcgdexDatabase } from '../tcgdex/load-database.mjs';
import { loadPokemontcg } from '../sources/load-pokemontcg.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = path.join(HERE, 'fixtures', 'tcgdex');

test('loadTcgdexDatabase: Sets, Ausschluss tcgp, cardmarketId, sortierte localIds', () => {
  const { sets, errors } = loadTcgdexDatabase(FIXTURE);
  assert.equal(errors.length, 0);
  assert.deepEqual(sets.map((s) => s.id).sort(), ['2011bw', 'me05']);
  const me05 = sets.find((s) => s.id === 'me05');
  assert.equal(me05.serieId, 'me');
  assert.equal(me05.serieName.en, 'Mega Evolution');
  assert.equal(me05.name.de, 'Pitch Black');
  assert.equal(me05.cardmarketId, 1);
  assert.equal(me05.tcgplayerId, null);
  assert.equal(me05.cardCountOfficial, 2);
  assert.equal(me05.abbreviationOfficial, 'PBK');
  assert.equal(me05.releaseDate, '2026-07-17');
  assert.deepEqual(me05.cards.map((c) => c.localId), ['001', '002']);
  assert.equal(me05.cards[0].name.en, 'Alpha');
  assert.equal('set' in me05.cards[0], false);
  const mc = sets.find((s) => s.id === '2011bw');
  assert.equal(mc.releaseDate, '2011-06-17');
  assert.equal(mc.tcgplayerId, 99);
  assert.deepEqual(mc.cards.map((c) => c.localId), ['1', '2', '10']);
});

test('loadTcgdexDatabase: excludeSerieIds leer laedt tcgp mit', () => {
  const { sets } = loadTcgdexDatabase(FIXTURE, { excludeSerieIds: [] });
  assert.ok(sets.some((s) => s.id === 'A1'));
});

test('loadTcgdexDatabase: kaputte Karte wird als Fehler gesammelt', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tcgdex-fixture-'));
  try {
    fs.cpSync(FIXTURE, tmp, { recursive: true });
    fs.writeFileSync(path.join(tmp, 'data', 'Mega Evolution', 'Pitch Black', '999.ts'), 'const card = foo()\nexport default card\n');
    const { sets, errors } = loadTcgdexDatabase(tmp);
    assert.equal(errors.length, 1);
    assert.match(errors[0].file, /999\.ts$/);
    assert.ok(errors[0].message.length > 0);
    assert.deepEqual(sets.find((s) => s.id === 'me05').cards.map((c) => c.localId), ['001', '002']);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('loadPokemontcg: liest sets/en.json und cards/en/<id>.json', () => {
  const root = path.resolve(HERE, '..', '..', '..');
  const { sets, cardsBySet } = loadPokemontcg(root);
  assert.ok(sets.length > 100);
  const base1 = cardsBySet.get('base1');
  assert.ok(Array.isArray(base1) && base1.length > 0);
  assert.equal(base1[0].id.startsWith('base1-'), true);
});
