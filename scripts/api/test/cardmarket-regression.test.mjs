// Regressionstest gegen die echten Daten (Task A2, Spec §7): Matching auf sources/cardmarket (Katalog +
// custom-sets) mit Stabilitaetsregel gegen die veroeffentlichten api/v3/cards.
// - Umwandlung: die vier custom-sets (JSON) liefern exakt die Nummern der alten Skripte. Vergleich gegen den
//   Schnappschuss test/fixtures/cardmarket-custom-sets-legacy.json ({ expansionId: [[productId, collectorNumber]] }),
//   einmalig erzeugt durch Aufruf von transformSet() der alten scripts/cardmarket/custom-sets/<id>.mjs mit allen
//   Produkt-IDs des Skripts als Payload (Ausgabe ohne collectorNumber null, Skriptreihenfolge). So haengt der Test
//   nicht an den alten Skripten, die nach der release-Umstellung entfallen.
// - Der Regressionsteil baut die echte API (~30 s) und laeuft nur mit CM_REGRESSION=1.
// - Jede Karte mit Cardmarket-ID behaelt ihren Stand (ids.cardmarket + Varianten-IDs) ausser den unten
//   ausdruecklich gelisteten Abweichungen; alle Abweichungen kommen aus custom-sets (Stufe 2).
import { test, before, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runBuild } from '../build-api.mjs';
import { primaryCardmarketId } from '../merge/cardmarket-ids.mjs';
import { loadCardmarketCatalog } from '../sources/cardmarket-catalog.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const CUSTOM_SETS = [1536, 1537, 1538, 5241];

test('conversion: custom-set JSON yields exactly the collector numbers of the old scripts', () => {
  const legacy = readJson(path.join(root, 'scripts', 'api', 'test', 'fixtures', 'cardmarket-custom-sets-legacy.json'));
  assert.deepEqual(Object.keys(legacy).map(Number), CUSTOM_SETS);
  for (const id of CUSTOM_SETS) {
    const json = readJson(path.join(root, 'sources', 'cardmarket', 'custom-sets', `${id}.json`));
    assert.equal(json.expansionId, id);
    assert.deepEqual(json.cards.map(({ lot, ...c }) => c), legacy[id].map(([productId, collectorNumber]) => ({ productId, collectorNumber })), `custom-set ${id}`);
  }
  // Loader: Nummern genau aus den JSON-Dateien; die fuenf 5241-Lot-Produkte (224a-d, f; nicht im Katalog) sind als lot markiert
  const catalog = loadCardmarketCatalog(path.join(root, 'sources', 'cardmarket'));
  assert.deepEqual(catalog.missingCustomSetProducts, []);
  assert.deepEqual(catalog.lotCustomSetProducts.map((m) => `${m.expansionId}/${m.collectorNumber}`), ['5241/224a', '5241/224b', '5241/224c', '5241/224d', '5241/224f']);
  for (const id of CUSTOM_SETS) {
    const json = readJson(path.join(root, 'sources', 'cardmarket', 'custom-sets', `${id}.json`));
    const payload = catalog.loadExpansion(id);
    for (const { productId, collectorNumber } of json.cards) {
      const p = payload.cards.find((c) => c.cardmarketProductId === productId);
      if (p) assert.equal(p.collectorNumber, collectorNumber);
    }
    assert.ok(payload.cards.every((c) => c.collectorNumber === null || c.customSet));
  }
});

// Abweichungen gegenueber dem Stand vor Task A2: "<setId>/<cardId>": [primaer vorher, primaer jetzt | null, Quelle jetzt].
// Gruende:
// - custom-set (Stufe 2): TCGdex vertauscht in Aquapolis (1537) und Skyridge (1538) normale und Holo-Karten
//   (#n <-> Hn) sowie gleichnamige Karten (z. B. Ledyba 72/73, Angriffsnamen bestaetigen custom-set); SVP 190 ist
//   laut custom-set 780209 (784938 = 190V2, der worlds-2024-Stempel verliert das Basisprodukt); ecard3-149 ebenso
//   (362907 = 149V2). ecard1-12 behaelt die primaere ID, die Jumbo-Variante verliert 362884 (laut custom-set #47).
// - custom-set-Widerspruch ohne eigenen Treffer (1536 fuehrt #47/#66/#68 doppelt): ecard1-47 trug 274887 (= #12),
//   ecard1-68 274905 (= #30) -> ohne ID; ecard1-66 verliert 274904 (= #29), bleibt bei 362890 (#66).
// - heutige Korrektur geteilter TCGdex-IDs per Angriffsnamen (Quelle 'corrected'): dp7/58, dp7/59, dp7/80, pl1/6,
//   pl1/81, pl1/97, pl1/102, pl4/46, pl4/52, pl4/74 trugen die ID der SH-/Lv.X-/Arceus-Variante; xyp/XY93 (zwei
//   gleichnamige Celebi-Produkte, unklar) folgt konservativ der heutigen Korrektur, keine Stabilitaets-Rueckkehr.
const CHANGES = {
  'dp7/58': [278297, 278356, 'corrected'],
  'dp7/59': [278298, 278357, 'corrected'],
  'dp7/80': [278296, 278378, 'corrected'],
  'ecard1/12': [274887, 274887, 'custom-set'],
  'ecard1/47': [274887, null, 'tcgdex'],
  'ecard1/66': [274904, 362890, 'tcgdex'],
  'ecard1/68': [274905, null, 'tcgdex'],
  'ecard2/1': [275052, 275073, 'custom-set'],
  'ecard2/2': [275041, 275074, 'custom-set'],
  'ecard2/3': [275072, 275075, 'custom-set'],
  'ecard2/4': [275060, 275076, 'custom-set'],
  'ecard2/5': [275059, 275077, 'custom-set'],
  'ecard2/6': [275062, 275078, 'custom-set'],
  'ecard2/8': [275063, 275080, 'custom-set'],
  'ecard2/10': [275065, 275082, 'custom-set'],
  'ecard2/11': [275064, 275083, 'custom-set'],
  'ecard2/12': [275051, 275084, 'custom-set'],
  'ecard2/14': [275050, 275086, 'custom-set'],
  'ecard2/16': [275053, 275088, 'custom-set'],
  'ecard2/17': [275054, 275089, 'custom-set'],
  'ecard2/19': [275056, 275091, 'custom-set'],
  'ecard2/20': [275055, 275092, 'custom-set'],
  'ecard2/22': [275049, 275094, 'custom-set'],
  'ecard2/23': [275048, 275095, 'custom-set'],
  'ecard2/24': [275043, 275096, 'custom-set'],
  'ecard2/25': [275042, 275097, 'custom-set'],
  'ecard2/26': [275044, 275098, 'custom-set'],
  'ecard2/32': [275045, 275104, 'custom-set'],
  'ecard2/34': [275047, 275106, 'custom-set'],
  'ecard2/35': [275058, 275107, 'custom-set'],
  'ecard2/36': [275046, 275108, 'custom-set'],
  'ecard2/37': [275057, 275109, 'custom-set'],
  'ecard2/38': [275061, 275110, 'custom-set'],
  'ecard2/39': [275069, 275111, 'custom-set'],
  'ecard2/40': [275071, 275112, 'custom-set'],
  'ecard2/41': [275070, 275113, 'custom-set'],
  'ecard2/42': [275068, 275114, 'custom-set'],
  'ecard2/43': [275066, 275115, 'custom-set'],
  'ecard2/44': [275067, 275116, 'custom-set'],
  'ecard2/H1': [275073, 275052, 'custom-set'],
  'ecard2/H2': [275074, 275041, 'custom-set'],
  'ecard2/H3': [275075, 275072, 'custom-set'],
  'ecard2/H4': [275076, 275060, 'custom-set'],
  'ecard2/H5': [275077, 275059, 'custom-set'],
  'ecard2/H6': [275078, 275062, 'custom-set'],
  'ecard2/H7': [275080, 275063, 'custom-set'],
  'ecard2/H8': [275082, 275065, 'custom-set'],
  'ecard2/H9': [275083, 275064, 'custom-set'],
  'ecard2/H10': [275084, 275051, 'custom-set'],
  'ecard2/H11': [275086, 275050, 'custom-set'],
  'ecard2/H12': [275088, 275053, 'custom-set'],
  'ecard2/H13': [275089, 275054, 'custom-set'],
  'ecard2/H14': [275091, 275056, 'custom-set'],
  'ecard2/H15': [275092, 275055, 'custom-set'],
  'ecard2/H16': [275094, 275049, 'custom-set'],
  'ecard2/H17': [275095, 275048, 'custom-set'],
  'ecard2/H18': [275096, 275043, 'custom-set'],
  'ecard2/H19': [275097, 275042, 'custom-set'],
  'ecard2/H20': [275098, 275044, 'custom-set'],
  'ecard2/H21': [275104, 275045, 'custom-set'],
  'ecard2/H22': [275106, 275047, 'custom-set'],
  'ecard2/H23': [275107, 275058, 'custom-set'],
  'ecard2/H24': [275108, 275046, 'custom-set'],
  'ecard2/H25': [275109, 275057, 'custom-set'],
  'ecard2/H26': [275110, 275061, 'custom-set'],
  'ecard2/H27': [275111, 275069, 'custom-set'],
  'ecard2/H28': [275112, 275071, 'custom-set'],
  'ecard2/H29': [275113, 275070, 'custom-set'],
  'ecard2/H30': [275114, 275068, 'custom-set'],
  'ecard2/H31': [275115, 275066, 'custom-set'],
  'ecard2/H32': [275116, 275067, 'custom-set'],
  'ecard3/2': [275238, 275260, 'custom-set'],
  'ecard3/3': [275227, 275261, 'custom-set'],
  'ecard3/4': [275258, 275262, 'custom-set'],
  'ecard3/5': [275246, 275263, 'custom-set'],
  'ecard3/6': [275245, 275264, 'custom-set'],
  'ecard3/7': [275248, 275265, 'custom-set'],
  'ecard3/8': [275249, 275266, 'custom-set'],
  'ecard3/9': [275251, 275267, 'custom-set'],
  'ecard3/10': [275250, 275268, 'custom-set'],
  'ecard3/11': [275237, 275269, 'custom-set'],
  'ecard3/12': [275236, 275270, 'custom-set'],
  'ecard3/13': [275239, 275271, 'custom-set'],
  'ecard3/14': [275240, 275272, 'custom-set'],
  'ecard3/15': [275242, 275273, 'custom-set'],
  'ecard3/16': [275241, 275274, 'custom-set'],
  'ecard3/17': [275234, 275276, 'custom-set'],
  'ecard3/19': [275228, 275277, 'custom-set'],
  'ecard3/21': [275230, 275279, 'custom-set'],
  'ecard3/22': [275231, 275280, 'custom-set'],
  'ecard3/24': [275233, 275301, 'custom-set'],
  'ecard3/25': [275244, 275283, 'custom-set'],
  'ecard3/26': [275232, 275284, 'custom-set'],
  'ecard3/27': [275243, 275285, 'custom-set'],
  'ecard3/28': [275247, 275286, 'custom-set'],
  'ecard3/29': [275257, 275287, 'custom-set'],
  'ecard3/30': [275254, 275288, 'custom-set'],
  'ecard3/31': [275256, 275289, 'custom-set'],
  'ecard3/32': [275255, 275290, 'custom-set'],
  'ecard3/35': [275253, 275293, 'custom-set'],
  'ecard3/72': [275330, 275331, 'custom-set'],
  'ecard3/73': [275331, 275330, 'custom-set'],
  'ecard3/85': [275343, 275344, 'custom-set'],
  'ecard3/86': [275344, 275343, 'custom-set'],
  'ecard3/94': [275352, 275353, 'custom-set'],
  'ecard3/95': [275353, 275352, 'custom-set'],
  'ecard3/98': [275356, 275357, 'custom-set'],
  'ecard3/99': [275357, 275356, 'custom-set'],
  'ecard3/103': [275361, 275362, 'custom-set'],
  'ecard3/104': [275362, 275361, 'custom-set'],
  'ecard3/107': [275365, 275366, 'custom-set'],
  'ecard3/108': [275366, 275365, 'custom-set'],
  'ecard3/114': [275372, 275373, 'custom-set'],
  'ecard3/115': [275373, 275372, 'custom-set'],
  'ecard3/117': [275375, 275376, 'custom-set'],
  'ecard3/118': [275376, 275375, 'custom-set'],
  'ecard3/149': [362907, 275407, 'custom-set'],
  'ecard3/H1': [275260, 275238, 'custom-set'],
  'ecard3/H2': [275261, 275227, 'custom-set'],
  'ecard3/H3': [275262, 275258, 'custom-set'],
  'ecard3/H4': [275263, 275246, 'custom-set'],
  'ecard3/H5': [275264, 275245, 'custom-set'],
  'ecard3/H6': [275265, 275248, 'custom-set'],
  'ecard3/H7': [275266, 275249, 'custom-set'],
  'ecard3/H8': [275267, 275251, 'custom-set'],
  'ecard3/H9': [275268, 275250, 'custom-set'],
  'ecard3/H10': [275269, 275237, 'custom-set'],
  'ecard3/H11': [275270, 275236, 'custom-set'],
  'ecard3/H12': [275271, 275239, 'custom-set'],
  'ecard3/H13': [275272, 275240, 'custom-set'],
  'ecard3/H14': [275273, 275242, 'custom-set'],
  'ecard3/H15': [275274, 275241, 'custom-set'],
  'ecard3/H17': [275276, 275234, 'custom-set'],
  'ecard3/H19': [275277, 275228, 'custom-set'],
  'ecard3/H20': [275279, 275230, 'custom-set'],
  'ecard3/H21': [275280, 275231, 'custom-set'],
  'ecard3/H22': [275301, 275233, 'custom-set'],
  'ecard3/H23': [275283, 275244, 'custom-set'],
  'ecard3/H24': [275284, 275232, 'custom-set'],
  'ecard3/H25': [275285, 275243, 'custom-set'],
  'ecard3/H26': [275286, 275247, 'custom-set'],
  'ecard3/H27': [275287, 275257, 'custom-set'],
  'ecard3/H28': [275288, 275254, 'custom-set'],
  'ecard3/H29': [275289, 275256, 'custom-set'],
  'ecard3/H30': [275290, 275255, 'custom-set'],
  'ecard3/H32': [275293, 275253, 'custom-set'],
  'pl1/6': [278426, 278427, 'corrected'],
  'pl1/81': [278419, 278502, 'corrected'],
  'pl1/97': [278421, 278518, 'corrected'],
  'pl1/102': [278420, 278523, 'corrected'],
  'pl4/46': [278869, 278918, 'corrected'],
  'pl4/52': [278870, 278924, 'corrected'],
  'pl4/74': [278872, 278946, 'corrected'],
  'svp/190': [784938, 780209, 'custom-set'],
  'xyp/XY93': [553429, 289795, 'corrected'],
};

const state = (c) => JSON.stringify([c.ids?.cardmarket ?? [], (c.variants ?? []).map((v) => v.cardmarketId ?? null)]);

const REGRESSION = process.env.CM_REGRESSION === '1';
describe('real-data regression (CM_REGRESSION=1)', { skip: REGRESSION ? false : 'nur mit CM_REGRESSION=1 (baut die echte API, ~30 s)' }, () => {
  let built;
  let report;
  let tmp;
  before(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cm-regression-'));
    runBuild({ repoRoot: root, outDir: path.relative(root, tmp), previousDir: 'api/v3/cards', writeRegistry: false });
    built = new Map();
    for (const f of fs.readdirSync(path.join(tmp, 'cards'))) for (const c of readJson(path.join(tmp, 'cards', f))) built.set(`${c.setId}/${c.cardId}`, c);
    report = readJson(path.join(tmp, 'reports', 'cardmarket-ids.json'));
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  test('regression: every published cardmarket id is kept unless a custom-set decides otherwise', () => {
    const dir = path.join(root, 'api', 'v3', 'cards');
    let published = 0;
    let withId = 0;
    const unexpected = [];
    let expectedLost = 0;
    for (const f of fs.readdirSync(dir)) {
      for (const c of readJson(path.join(dir, f))) {
        const key = `${c.setId}/${c.cardId}`;
        const now = built.get(key);
        assert.ok(now, `${key} fehlt im Build`);
        const before = primaryCardmarketId(c);
        if (before === undefined) continue;
        published++;
        if (primaryCardmarketId(now) !== undefined) withId++;
        const change = CHANGES[key];
        if (change) {
          // vor dem Neubau: alter Stand; danach: schon der neue
          assert.ok([change[0], change[1]].includes(before), `${key}: veroeffentlicht ${before}`);
          assert.equal(primaryCardmarketId(now) ?? null, change[1], key);
          assert.equal(now.ids.cardmarketSource ?? 'tcgdex', change[2], key);
          if (change[1] === null) expectedLost++;
          continue;
        }
        if (state(c) !== state(now)) unexpected.push(`${key}: ${state(c)} -> ${state(now)}`);
      }
    }
    assert.deepEqual(unexpected, []);
    assert.equal(withId, published - expectedLost, 'Abdeckung sinkt nur um gelistete falsche IDs');
    assert.ok(published > 21000, `${published} Karten mit ID`);
    // nur am Umstellungstag (danach stehen die IDs nicht mehr in previous)
    const dropped = new Set(['ecard1/47:custom-set', 'ecard1/66:custom-set', 'ecard1/68:custom-set']);
    assert.deepEqual(report.stabilityDropped.filter((d) => !dropped.has(`${d.cardKey}:${d.reason}`)), []);
    assert.deepEqual(report.stabilityConflicts, []);
    assert.deepEqual(report.customSets.conflicts, []);
    assert.deepEqual(report.customSets.nameWarnings, []);
      assert.deepEqual(report.customSets.dropped.map((d) => d.cardKey), ['ecard1/47', 'ecard1/66', 'ecard1/68']);
    assert.deepEqual(report.customSets.ambiguous, ['ecard1/1', 'ecard1/47', 'ecard1/66', 'ecard1/68']);
  });

  test('regression: set expansions from catalog, no tracker', () => {
    const sets = readJson(path.join(root, 'api', 'v3', 'sets.json'));
    assert.ok(sets.length > 200);
    // fruehere Tracker-Sets ohne TCGdex-Expansion: per Mehrheit (auch aus veroeffentlichten IDs) abgeleitet
    const derived = Object.fromEntries(report.expansionMismatch.sets.filter((s) => s.reason === 'derived').map((s) => [s.setId, s.newId]));
    assert.equal(derived.np, 1608);
    assert.equal(derived.bwp, 1611);
    assert.equal(derived.sma, 2514);
    assert.equal(derived.tk1a, 1626);
    assert.ok(report.setsWithoutExpansion.every((s) => s.setId.startsWith('TCGDEX-')), JSON.stringify(report.setsWithoutExpansion.map((s) => s.setId)));
  });
});
