// Regressionstest gegen die echten Daten (Task A2, Spec §7): Matching auf sources/cardmarket (Katalog +
// custom-sets) mit Stabilitaetsregel gegen die veroeffentlichten api/v3/cards.
// - Umwandlung: die vier custom-sets (JSON) liefern exakt die Nummern der alten Skripte.
// - Jede Karte mit Cardmarket-ID behaelt ihren Stand (ids.cardmarket + Varianten-IDs) ausser den unten
//   ausdruecklich gelisteten Abweichungen; alle Abweichungen kommen aus custom-sets (Stufe 2).
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { runBuild } from '../build-api.mjs';
import { primaryCardmarketId } from '../merge/cardmarket-ids.mjs';
import { loadCardmarketCatalog } from '../sources/cardmarket-catalog.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const CUSTOM_SETS = [1536, 1537, 1538, 5241];

test('conversion: custom-set JSON yields exactly the collector numbers of the old scripts', async () => {
  for (const id of CUSTOM_SETS) {
    const json = readJson(path.join(root, 'sources', 'cardmarket', 'custom-sets', `${id}.json`));
    assert.equal(json.expansionId, id);
    const script = path.join(root, 'scripts', 'cardmarket', 'custom-sets', `${id}.mjs`);
    const scriptIds = [...fs.readFileSync(script, 'utf8').matchAll(/productId: (\d+)/g)].map((m) => Number(m[1]));
    const { transformSet } = await import(pathToFileURL(script).href);
    // Payload mit allen Produkten des Skripts, damit nichts als "fehlend" wegfaellt
    const out = transformSet({ expansionId: id, cards: scriptIds.map((p) => ({ cardmarketProductId: p, collectorNumber: null })) }, { logger: { warn() {}, info() {} } });
    const expected = out.cards.filter((c) => c.collectorNumber !== null).map((c) => ({ productId: c.cardmarketProductId, collectorNumber: c.collectorNumber }));
    assert.deepEqual(json.cards, expected, `custom-set ${id}`);
    assert.equal(new Set(json.cards.map((c) => c.productId)).size, new Set(scriptIds).size, `custom-set ${id}: alle Produkte`);
  }
  // Loader: Nummern genau aus den JSON-Dateien; nicht im Katalog: nur die fuenf 5241-Lot-Produkte (224a-d, f)
  const catalog = loadCardmarketCatalog(path.join(root, 'sources', 'cardmarket'));
  assert.deepEqual(catalog.missingCustomSetProducts.map((m) => `${m.expansionId}/${m.collectorNumber}`), ['5241/224a', '5241/224b', '5241/224c', '5241/224d', '5241/224f']);
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

// Abweichungen gegenueber dem Stand vor Task A2: "<setId>/<cardId>": [primaer vorher, primaer jetzt].
// Grund jeweils custom-set (Stufe 2): TCGdex vertauscht in Aquapolis (1537) und Skyridge (1538) normale und
// Holo-Karten (#n <-> Hn) sowie gleichnamige Karten (z. B. Ledyba 72/73); SVP 190 ist laut custom-set 780209,
// 784938 ist 190V2; ecard3-149 ebenso (362907 = 149V2). ecard1-12 behaelt die primaere ID, die Jumbo-Variante
// verliert 362884 (laut custom-set #47, nie das normale Produkt).
const CHANGES = {
  'ecard1/12': [274887, 274887],
  'ecard2/1': [275052, 275073],
  'ecard2/2': [275041, 275074],
  'ecard2/3': [275072, 275075],
  'ecard2/4': [275060, 275076],
  'ecard2/5': [275059, 275077],
  'ecard2/6': [275062, 275078],
  'ecard2/8': [275063, 275080],
  'ecard2/10': [275065, 275082],
  'ecard2/11': [275064, 275083],
  'ecard2/12': [275051, 275084],
  'ecard2/14': [275050, 275086],
  'ecard2/16': [275053, 275088],
  'ecard2/17': [275054, 275089],
  'ecard2/19': [275056, 275091],
  'ecard2/20': [275055, 275092],
  'ecard2/22': [275049, 275094],
  'ecard2/23': [275048, 275095],
  'ecard2/24': [275043, 275096],
  'ecard2/25': [275042, 275097],
  'ecard2/26': [275044, 275098],
  'ecard2/32': [275045, 275104],
  'ecard2/34': [275047, 275106],
  'ecard2/35': [275058, 275107],
  'ecard2/36': [275046, 275108],
  'ecard2/37': [275057, 275109],
  'ecard2/38': [275061, 275110],
  'ecard2/39': [275069, 275111],
  'ecard2/40': [275071, 275112],
  'ecard2/41': [275070, 275113],
  'ecard2/42': [275068, 275114],
  'ecard2/43': [275066, 275115],
  'ecard2/44': [275067, 275116],
  'ecard2/H1': [275073, 275052],
  'ecard2/H2': [275074, 275041],
  'ecard2/H3': [275075, 275072],
  'ecard2/H4': [275076, 275060],
  'ecard2/H5': [275077, 275059],
  'ecard2/H6': [275078, 275062],
  'ecard2/H7': [275080, 275063],
  'ecard2/H8': [275082, 275065],
  'ecard2/H9': [275083, 275064],
  'ecard2/H10': [275084, 275051],
  'ecard2/H11': [275086, 275050],
  'ecard2/H12': [275088, 275053],
  'ecard2/H13': [275089, 275054],
  'ecard2/H14': [275091, 275056],
  'ecard2/H15': [275092, 275055],
  'ecard2/H16': [275094, 275049],
  'ecard2/H17': [275095, 275048],
  'ecard2/H18': [275096, 275043],
  'ecard2/H19': [275097, 275042],
  'ecard2/H20': [275098, 275044],
  'ecard2/H21': [275104, 275045],
  'ecard2/H22': [275106, 275047],
  'ecard2/H23': [275107, 275058],
  'ecard2/H24': [275108, 275046],
  'ecard2/H25': [275109, 275057],
  'ecard2/H26': [275110, 275061],
  'ecard2/H27': [275111, 275069],
  'ecard2/H28': [275112, 275071],
  'ecard2/H29': [275113, 275070],
  'ecard2/H30': [275114, 275068],
  'ecard2/H31': [275115, 275066],
  'ecard2/H32': [275116, 275067],
  'ecard3/2': [275238, 275260],
  'ecard3/3': [275227, 275261],
  'ecard3/4': [275258, 275262],
  'ecard3/5': [275246, 275263],
  'ecard3/6': [275245, 275264],
  'ecard3/7': [275248, 275265],
  'ecard3/8': [275249, 275266],
  'ecard3/9': [275251, 275267],
  'ecard3/10': [275250, 275268],
  'ecard3/11': [275237, 275269],
  'ecard3/12': [275236, 275270],
  'ecard3/13': [275239, 275271],
  'ecard3/14': [275240, 275272],
  'ecard3/15': [275242, 275273],
  'ecard3/16': [275241, 275274],
  'ecard3/17': [275234, 275276],
  'ecard3/19': [275228, 275277],
  'ecard3/21': [275230, 275279],
  'ecard3/22': [275231, 275280],
  'ecard3/24': [275233, 275301],
  'ecard3/25': [275244, 275283],
  'ecard3/26': [275232, 275284],
  'ecard3/27': [275243, 275285],
  'ecard3/28': [275247, 275286],
  'ecard3/29': [275257, 275287],
  'ecard3/30': [275254, 275288],
  'ecard3/31': [275256, 275289],
  'ecard3/32': [275255, 275290],
  'ecard3/35': [275253, 275293],
  'ecard3/72': [275330, 275331],
  'ecard3/73': [275331, 275330],
  'ecard3/85': [275343, 275344],
  'ecard3/86': [275344, 275343],
  'ecard3/94': [275352, 275353],
  'ecard3/95': [275353, 275352],
  'ecard3/98': [275356, 275357],
  'ecard3/99': [275357, 275356],
  'ecard3/103': [275361, 275362],
  'ecard3/104': [275362, 275361],
  'ecard3/107': [275365, 275366],
  'ecard3/108': [275366, 275365],
  'ecard3/114': [275372, 275373],
  'ecard3/115': [275373, 275372],
  'ecard3/117': [275375, 275376],
  'ecard3/118': [275376, 275375],
  'ecard3/149': [362907, 275407],
  'ecard3/H1': [275260, 275238],
  'ecard3/H2': [275261, 275227],
  'ecard3/H3': [275262, 275258],
  'ecard3/H4': [275263, 275246],
  'ecard3/H5': [275264, 275245],
  'ecard3/H6': [275265, 275248],
  'ecard3/H7': [275266, 275249],
  'ecard3/H8': [275267, 275251],
  'ecard3/H9': [275268, 275250],
  'ecard3/H10': [275269, 275237],
  'ecard3/H11': [275270, 275236],
  'ecard3/H12': [275271, 275239],
  'ecard3/H13': [275272, 275240],
  'ecard3/H14': [275273, 275242],
  'ecard3/H15': [275274, 275241],
  'ecard3/H17': [275276, 275234],
  'ecard3/H19': [275277, 275228],
  'ecard3/H20': [275279, 275230],
  'ecard3/H21': [275280, 275231],
  'ecard3/H22': [275301, 275233],
  'ecard3/H23': [275283, 275244],
  'ecard3/H24': [275284, 275232],
  'ecard3/H25': [275285, 275243],
  'ecard3/H26': [275286, 275247],
  'ecard3/H27': [275287, 275257],
  'ecard3/H28': [275288, 275254],
  'ecard3/H29': [275289, 275256],
  'ecard3/H30': [275290, 275255],
  'ecard3/H32': [275293, 275253],
  'svp/190': [784938, 780209],
};

const state = (c) => JSON.stringify([c.ids?.cardmarket ?? [], (c.variants ?? []).map((v) => v.cardmarketId ?? null)]);

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
        assert.equal(primaryCardmarketId(now), change[1], key);
        assert.equal(now.ids.cardmarketSource, 'custom-set', key);
        continue;
      }
      if (state(c) !== state(now)) unexpected.push(`${key}: ${state(c)} -> ${state(now)}`);
    }
  }
  assert.deepEqual(unexpected, []);
  assert.equal(withId, published, 'Abdeckung darf nicht sinken');
  assert.ok(published > 21000, `${published} Karten mit ID`);
  assert.deepEqual(report.stabilityDropped, []);
  assert.deepEqual(report.stabilityConflicts, []);
  assert.deepEqual(report.customSets.conflicts, []);
  assert.deepEqual(report.customSets.nameWarnings, []);
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
