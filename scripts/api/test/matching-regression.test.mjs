// Regressionstest gegen die echten Quellen (sources/) und Mappings (api/mappings/).
// Sichert die Abnahmekriterien aus Spec §2.1: erwartete Set-Paare, Sonderfaelle
// auf Kartenebene und die Gesamtquote.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadPokemontcg } from '../sources/load-pokemontcg.mjs';
import { loadTcgdexDatabase } from '../tcgdex/load-database.mjs';
import { matchSets } from '../match/match-sets.mjs';
import { matchCards } from '../match/match-cards.mjs';
import { buildMatchingReport } from '../report/matching-report.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));

let setResult;
let cardResults;
let report;
let pairOf;

before(() => {
  const { sets: ptSets, cardsBySet: ptCardsBySet } = loadPokemontcg(path.join(root, 'sources', 'pokemontcg'));
  const db = loadTcgdexDatabase(path.join(root, 'sources', 'tcgdex'));
  const setMap = readJson(path.join(root, 'api', 'mappings', 'set-map.json'));
  const cardMap = readJson(path.join(root, 'api', 'mappings', 'card-map.json'));
  setResult = matchSets({ ptSets, tcgdexSets: db.sets, ptCardsBySet, setMap });
  const tcgdexSetsById = new Map(db.sets.map((s) => [s.id, s]));
  cardResults = new Map();
  for (const pair of setResult.pairs) {
    cardResults.set(pair.pokemontcgId, matchCards({
      ptCards: ptCardsBySet.get(pair.pokemontcgId) ?? [],
      tcgdexSet: tcgdexSetsById.get(pair.tcgdexId),
      tcgdexSetsById,
      cardMap: cardMap[pair.pokemontcgId],
    }));
  }
  report = buildMatchingReport({
    setResult, cardResults, sources: {}, ptSets, tcgdexSets: db.sets, ptCardsBySet, generatedAt: 'x',
  });
  pairOf = new Map(setResult.pairs.map((p) => [p.pokemontcgId, p.tcgdexId]));
});

const expectPair = {
  swsh45sv: 'swsh4.5sv', swsh45: 'swsh4.5', sv3pt5: 'sv03.5', swsh35: 'swsh3.5', mcd11: '2011bw',
  mcd22: '2022swsh', fut20: 'fut2020', me55c: '30th-c', cel25c: 'cel25cc', swsh9tg: 'swsh9tg',
  swsh12tg: 'swsh12tg', me2pt5: 'me02.5', me5: 'me05',
  // Restfaelle, die nur per Mapping gepaart werden
  ex10: 'ex10', mcd17: '2017sm',
};

const matchOf = (ptSetId, ptNumber) => cardResults.get(ptSetId).matched.filter((m) => m.ptNumber === ptNumber);

test('erwartete Set-Paare', () => {
  for (const [pt, td] of Object.entries(expectPair)) {
    assert.equal(pairOf.get(pt), td, `${pt} -> ${td}`);
  }
});

test('alle pokemontcg-Sets gepaart', () => {
  assert.deepEqual(setResult.unmatchedPokemontcg, []);
});

test('ex10 Unown A liegt im TCGdex-Set exu', () => {
  const [m] = matchOf('ex10', 'A');
  assert.deepEqual(m.tcgdex, [{ setId: 'exu', localId: 'A' }]);
  // alle 28 Unown (A-Z, !, ?) zugeordnet
  assert.equal(cardResults.get('ex10').primaryOnly.length, 0);
});

test('ecard2 H1 -> H01', () => {
  const [m] = matchOf('ecard2', 'H1');
  assert.deepEqual(m.tcgdex, [{ setId: 'ecard2', localId: 'H01' }]);
});

test('cel25c: alle 25 Karten eindeutig und namensgleich', () => {
  const r = cardResults.get('cel25c');
  assert.equal(r.matched.length, 25);
  assert.equal(r.primaryOnly.length, 0);
  assert.equal(new Set(r.matched.map((m) => m.tcgdex[0].localId)).size, 25);
  assert.ok(r.matched.every((m) => !m.suspicious));
});

test('me55c: alle 30 Karten eindeutig und namensgleich', () => {
  const r = cardResults.get('me55c');
  assert.equal(r.matched.length, 30);
  assert.equal(r.primaryOnly.length, 0);
  assert.equal(new Set(r.matched.map((m) => m.tcgdex[0].localId)).size, 30);
  assert.ok(r.matched.every((m) => !m.suspicious));
  assert.equal(matchOf('me55c', '58')[0].tcgdex[0].localId, '014'); // Pikachu
  assert.equal(matchOf('me55c', '33')[0].tcgdex[0].localId, '008'); // Pikachu & Zekrom-GX
});

test('Gesamtquote, keine Doppelzuordnung, keine lowOverlap-Paare', () => {
  assert.ok(report.summary.cardMatchRatio >= 0.995, `cardMatchRatio ${report.summary.cardMatchRatio}`);
  assert.deepEqual(report.doubleAssigned, []);
  assert.deepEqual(report.sets.filter((s) => s.lowOverlap).map((s) => s.pokemontcgId), []);
});

// rejected kann nicht leer sein: automatische Kandidaten (z. B. sma<->sm115 per
// codeAndDate) und 1:1-Konflikte mit Mapping-Paaren werden dort protokolliert.
// Abnahmekriterium: kein Mapping abgelehnt, kein abgelehnter Kandidat laesst sein
// pokemontcg-Set ungepaart, und ist ein abgelehnter Kandidat doch das finale Paar,
// dann nur, weil ein Mapping es explizit festlegt (Selbstkonflikt bzw. ersetzt).
test('rejected enthaelt nur erklaerbares Rauschen', () => {
  const methodOf = new Map(setResult.pairs.map((p) => [p.pokemontcgId, p.method]));
  for (const r of setResult.rejected) {
    const label = `${r.pokemontcgId} -> ${r.tcgdexId} (${r.method}): ${r.reason}`;
    assert.notEqual(r.method, 'mapping', `Mapping abgelehnt: ${label}`);
    assert.ok(pairOf.has(r.pokemontcgId), `ungepaart: ${label}`);
    if (pairOf.get(r.pokemontcgId) === r.tcgdexId) {
      assert.equal(methodOf.get(r.pokemontcgId), 'mapping', `Paar abgelehnt, aber nicht gemappt: ${label}`);
    }
  }
});
