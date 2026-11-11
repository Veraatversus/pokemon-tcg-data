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
  const root = path.resolve(HERE, '..', '..', '..', 'sources', 'pokemontcg');
  const { sets, cardsBySet } = loadPokemontcg(root);
  assert.ok(sets.length > 100);
  const base1 = cardsBySet.get('base1');
  assert.ok(Array.isArray(base1) && base1.length > 0);
  assert.equal(base1[0].id.startsWith('base1-'), true);
});

function withTmpCopy(fn) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tcgdex-fixture-'));
  try {
    fs.cpSync(FIXTURE, tmp, { recursive: true });
    return fn(tmp, path.join(tmp, 'data', 'Mega Evolution', 'Pitch Black'));
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}
const cardSrc = (spec, extra = '') => `import { Card } from "../../../interfaces"
import Set from "${spec}"
const card: Card = { set: Set, ${extra}name: { en: "X" } }
export default card
`;

test('Karte wird dem importierten Set zugeordnet, nicht dem Ordner', () => withTmpCopy((tmp, dir) => {
  fs.writeFileSync(path.join(dir, 'AR1.ts'), cardSrc("../../McDonald's Collection/McDonald\'s Collection 2011"));
  const { sets, errors } = loadTcgdexDatabase(tmp);
  assert.equal(errors.length, 0);
  assert.deepEqual(sets.find((s) => s.id === 'me05').cards.map((c) => c.localId), ['001', '002']);
  assert.deepEqual(sets.find((s) => s.id === '2011bw').cards.map((c) => c.localId), ['1', '2', '10', 'AR1']);
}));

test('Import mit .ts-Endung wird aufgeloest; localId-Feld ueberschreibt Dateinamen nicht', () => withTmpCopy((tmp, dir) => {
  fs.writeFileSync(path.join(dir, '003.ts'), cardSrc('../Pitch Black.ts', 'localId: "zzz", '));
  const { sets, errors } = loadTcgdexDatabase(tmp);
  assert.equal(errors.length, 0);
  assert.deepEqual(sets.find((s) => s.id === 'me05').cards.map((c) => c.localId), ['001', '002', '003']);
}));

test('Nicht aufloesbarer Import ergibt Fehler und Karte wird uebersprungen', () => withTmpCopy((tmp, dir) => {
  fs.writeFileSync(path.join(dir, '004.ts'), cardSrc('../Gibt Es Nicht'));
  const { sets, errors } = loadTcgdexDatabase(tmp);
  assert.equal(errors.length, 1);
  assert.match(errors[0].file, /004.ts$/);
  assert.deepEqual(sets.find((s) => s.id === 'me05').cards.map((c) => c.localId), ['001', '002']);
}));

test('Set-Pfad endet auf "ts" ohne Punkt (Furious Fists) wird korrekt aufgeloest', () => withTmpCopy((tmp, dir) => {
  const serie = path.join(tmp, 'data', 'Mega Evolution');
  fs.writeFileSync(path.join(serie, 'Furious Fists.ts'), fs.readFileSync(path.join(serie, 'Pitch Black.ts'), 'utf8').replace('me05', 'xy3').replace('Pitch Black', 'Furious Fists'));
  fs.mkdirSync(path.join(serie, 'Furious Fists'));
  fs.writeFileSync(path.join(serie, 'Furious Fists', '1.ts'), cardSrc('../Furious Fists'));
  const { sets, errors } = loadTcgdexDatabase(tmp);
  assert.equal(errors.length, 0);
  assert.deepEqual(sets.find((s) => s.id === 'xy3').cards.map((c) => c.localId), ['1']);
}));

test('Doppelte (Set, localId): Kopie im eigenen Ordner gewinnt, Warnung statt Fehler', () => withTmpCopy((tmp, dir) => {
  const mc = path.join(tmp, 'data', "McDonald's Collection", "McDonald's Collection 2011");
  // Fremde Kopie von Set me05 liegt im Ordner eines anderen Sets, importiert aber me05 (001 existiert dort schon).
  fs.writeFileSync(path.join(mc, '001.ts'), cardSrc("../../Mega Evolution/Pitch Black", 'rarity: "Foreign", '));
  const { sets, errors, warnings } = loadTcgdexDatabase(tmp);
  assert.equal(errors.length, 0);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0].file, /McDonald's Collection 2011.001.ts$/);
  assert.match(warnings[0].message, /Pitch Black.001.ts/);
  const me05 = sets.find((s) => s.id === 'me05');
  assert.deepEqual(me05.cards.map((c) => c.localId), ['001', '002']);
  assert.equal(me05.cards[0].name.en, 'Alpha');
  assert.notEqual(me05.cards[0].rarity, 'Foreign');
}));
