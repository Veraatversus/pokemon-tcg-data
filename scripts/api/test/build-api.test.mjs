import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runBuild, requiredFieldViolations, BuildValidationError } from '../build-api.mjs';
import { cardmarketSearchUrl } from '../merge/cardmarket-ids.mjs';
import { RegistryFrozenError } from '../registry/build-registry.mjs';

const write = (root, rel, content) => {
  const f = path.join(root, rel);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, typeof content === 'string' ? content : `${JSON.stringify(content, null, 2)}\n`);
};

const serieTs = (id, en) => `import { Serie } from '../interfaces'\nconst serie: Serie = { id: "${id}", name: { en: "${en}", de: "${en} DE" } }\nexport default serie\n`;
const setTs = (serieName, id, en, extra = '') => `import { Set } from '../../interfaces'\nimport serie from '../${serieName}'\nconst set: Set = { id: "${id}", name: { en: "${en}", de: "${en} DE" }, serie: serie, cardCount: { official: 3 }, releaseDate: "2023-03-31"${extra} }\nexport default set\n`;
const cardTs = (setName, body) => `import { Card } from '../../../interfaces'\nimport Set from '../${setName}'\nconst card: Card = { set: Set, ${body} }\nexport default card\n`;

function makeRepo() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'build-api-'));
  write(root, 'sources/SOURCES.json', {
    pokemontcg: { commit: '1111111111111111111111111111111111111111', fetchedAt: '2026-01-01T00:00:00.000Z' },
    tcgdex: { commit: '2222222222222222222222222222222222222222', fetchedAt: '2026-02-02T00:00:00.000Z' },
  });
  write(root, 'sources/pokemontcg/sets/en.json', [
    { id: 'sv1', name: 'Scarlet & Violet', series: 'Scarlet & Violet', printedTotal: 3, total: 3, ptcgoCode: 'SVI', releaseDate: '2023/03/31', images: { symbol: 'pt-s', logo: 'pt-l' } },
  ]);
  const pt = (n, name, extra = {}) => ({
    id: `sv1-${n}`, name, supertype: 'Pokémon', subtypes: ['Basic'], number: String(n), rarity: 'Common', hp: '60',
    images: { small: `https://images.pokemontcg.io/sv1/${n}.png`, large: `https://images.pokemontcg.io/sv1/${n}_hires.png` }, ...extra,
  });
  write(root, 'sources/pokemontcg/cards/en/sv1.json', [pt(1, 'Alpha', { types: ['Grass'], artist: 'Ann Artist' }), pt(2, 'Beta'), pt(3, 'Gamma')]);

  const d = 'sources/tcgdex/data';
  write(root, `${d}/Scarlet & Violet.ts`, serieTs('sv', 'Scarlet & Violet'));
  write(root, `${d}/Scarlet & Violet/Scarlet & Violet.ts`, setTs('Scarlet & Violet', 'sv01', 'Scarlet & Violet', ', thirdParty: { cardmarket: 4999 }'));
  const svCard = (n, en, de) => cardTs('Scarlet & Violet', `name: { en: "${en}", de: "${de}" }, category: "Pokemon", stage: "Basic", rarity: "Common", hp: 60, regulationMark: "G", variants: [{ type: "normal", thirdParty: { cardmarket: ${700 + n} } }]`);
  write(root, `${d}/Scarlet & Violet/Scarlet & Violet/001.ts`, svCard(1, 'Alpha', 'Alpha DE'));
  write(root, `${d}/Scarlet & Violet/Scarlet & Violet/002.ts`, svCard(2, 'Beta', 'Beta DE'));
  write(root, `${d}/Scarlet & Violet/Scarlet & Violet/004.ts`, svCard(4, 'Delta', 'Delta DE'));
  write(root, `${d}/Pokémon TCG Pocket.ts`, serieTs('tcgp', 'Pokémon TCG Pocket'));
  write(root, `${d}/Pokémon TCG Pocket/Genetic Apex.ts`, setTs('Pokémon TCG Pocket', 'A1', 'Genetic Apex'));
  for (const n of ['001', '002', '010']) {
    write(root, `${d}/Pokémon TCG Pocket/Genetic Apex/${n}.ts`, cardTs('Genetic Apex', `name: { en: "Pocket ${n}", de: "Tasche ${n}" }, category: "Pokemon", stage: "Basic", rarity: "One Diamond", hp: 70`));
  }
  write(root, 'sources/tcgdex/meta/legals.ts', `import { Filter } from '../interfaces'\nexport const standard: Filter = { includes: { series: [], sets: [], regulationMark: ['G'] }, excludes: { sets: [], cards: [] } }\nexport const expanded: Filter = { includes: { series: ['sv'], sets: [], regulationMark: [] }, excludes: { sets: [], cards: [] } }\n`);
  write(root, 'sources/tcgdex/assets-index.json', {
    en: { sv: { sv01: { '001': 'h', '004': 'h', logo: 'h' } }, tcgp: { A1: { '001': 'h', '002': 'h', '010': 'h', logo: 'h' } } },
    de: { sv: { sv01: { '001': 'h' } } },
    univ: {},
  });
  write(root, 'api/mappings/set-map.json', { pairs: [{ pokemontcg: 'sv1', tcgdex: 'sv01' }] });
  write(root, 'api/mappings/card-map.json', {});
  write(root, 'api/mappings/subset-merge.json', { merges: [] });
  write(root, 'api/mappings/canonical-keys.json', {});
  write(root, 'api/v3/reports/matching.json', { untouched: true });
  // Altformat cardmarket/ (eingefroren) darf der Build nicht mehr lesen: kaputte Dateien schaden nicht.
  for (const f of ['cardmarket/index/tracker.json', 'cardmarket/index/products.json', 'cardmarket/index/sets.json', 'cardmarket/sets/4999.json']) write(root, f, 'kein JSON {');
  return root;
}

function snapshot(dir) {
  const out = {};
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else out[path.relative(dir, p).split(path.sep).join('/')] = fs.readFileSync(p, 'utf8');
    }
  };
  if (fs.existsSync(dir)) walk(dir);
  return out;
}

const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const keysOf = (dir) => Object.entries(snapshot(path.join(dir, 'cards')))
  .flatMap(([, s]) => JSON.parse(s).map((c) => `${c.setId}/${c.cardId}`)).sort();

test('runBuild: Mini-Repo, zwei Laeufe identisch, Registry geschrieben, alte Dateien entfernt', () => {
  const root = makeRepo();
  try {
    const r1 = runBuild({ repoRoot: root });
    assert.equal(r1.sets, 2);
    assert.equal(r1.cards, 7);
    assert.deepEqual(r1.matchStatus, { matched: 2, primary_only: 1, tcgdex_only: 4 });
    assert.ok(r1.registryChanges.length > 0);
    const v3 = path.join(root, 'api', 'v3');
    assert.deepEqual(Object.keys(snapshot(v3)).sort(), [
      'cards/TCGDEX-A1.json', 'cards/sv1.json', 'meta.json', 'reports/cardmarket-ids.json', 'reports/cardmarket-ids.md', 'reports/learned-tables.json', 'reports/matching.json', 'search-index.json', 'sets.json',
    ]);
    const sv1 = readJson(path.join(v3, 'cards', 'sv1.json'));
    assert.deepEqual(sv1.map((c) => c.cardId), ['1', '2', '3', '4']);
    assert.deepEqual(sv1.map((c) => c.matchStatus), ['matched', 'matched', 'primary_only', 'tcgdex_only']);
    assert.equal(sv1[0].i18n.de.name, 'Alpha DE');
    assert.equal(sv1[0].images.small, 'https://assets.tcgdex.net/en/sv/sv01/001/low.webp');
    assert.equal(sv1[1].images.small, 'https://images.pokemontcg.io/sv1/2.png'); // kein TCGdex-Bild -> Legacy
    assert.deepEqual(sv1[0].legalities, { unlimited: 'Legal', standard: 'Legal', expanded: 'Legal' });
    assert.deepEqual(sv1[0].sources, { pokemontcg: '11111111', tcgdex: '22222222' });
    const a1 = readJson(path.join(v3, 'cards', 'TCGDEX-A1.json'));
    assert.deepEqual(a1.map((c) => c.id), ['TCGDEX-A1-1', 'TCGDEX-A1-2', 'TCGDEX-A1-10']);
    assert.equal(a1[0].number, '001');
    const sets = readJson(path.join(v3, 'sets.json'));
    assert.deepEqual(sets.map((s) => s.id).sort(), ['TCGDEX-A1', 'sv1']);
    assert.equal(sets.find((s) => s.id === 'sv1').ids.cardmarket, 4999);
    assert.equal(sets.find((s) => s.id === 'sv1').total, 4);
    const meta = readJson(path.join(v3, 'meta.json'));
    assert.equal(meta.sources.tcgdex.fetchedAt, '2026-02-02T00:00:00.000Z');
    assert.equal(meta.sources.tcgdex.commit, '2222222222222222222222222222222222222222');
    assert.equal(meta.sources.pokemontcg.fetchedAt, undefined);
    assert.deepEqual(meta.counts, { cards: 7, sets: 2, matched: 2, primary_only: 1, tcgdex_only: 4 });
    assert.deepEqual(meta.warnings, { missingImages: { bySet: {}, total: 0 } });
    assert.deepEqual(r1.missingImages, { total: 0, bySet: {} });
    const idx = readJson(path.join(v3, 'search-index.json'));
    assert.equal(idx.length, 7);
    assert.deepEqual(idx[0], { cardId: '1', name: 'Pocket 001', nameDe: 'Tasche 001', number: '001', setId: 'TCGDEX-A1', img: 'https://assets.tcgdex.net/en/tcgp/A1/001/low.webp', rarity: 'One Diamond', supertype: 'Pokémon' });
    assert.ok(fs.existsSync(path.join(root, 'api', 'registry', 'sets.json')));
    assert.deepEqual(readJson(path.join(v3, 'reports', 'matching.json')), { untouched: true });
    for (const s of Object.values(snapshot(v3))) assert.ok(s.endsWith('\n') && !s.includes('\r'));

    const before = { v3: snapshot(v3), reg: snapshot(path.join(root, 'api', 'registry')) };
    write(root, 'api/v3/cards/stale.json', []);
    const r2 = runBuild({ repoRoot: root });
    assert.deepEqual(r2.registryChanges, []);
    assert.deepEqual(snapshot(v3), before.v3);
    assert.deepEqual(snapshot(path.join(root, 'api', 'registry')), before.reg);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

const isCompact = (s) => s.endsWith('\n') && s.indexOf('\n') === s.length - 1;

test('search index carries display fields', () => {
  const root = makeRepo();
  try {
    runBuild({ repoRoot: root });
    const idx = readJson(path.join(root, 'api', 'v3', 'search-index.json'));
    const raw = fs.readFileSync(path.join(root, 'api', 'v3', 'search-index.json'), 'utf8');
    assert.ok(isCompact(raw) && !raw.includes('\n  '), 'Suchindex kompakt, eine Zeile');
    assert.ok(isCompact(fs.readFileSync(path.join(root, 'api', 'v3', 'cards', 'sv1.json'), 'utf8')), 'Kartendatei kompakt');
    for (const f of [path.join(root, 'api', 'v3', 'sets.json'), path.join(root, 'api', 'v3', 'meta.json'), path.join(root, 'api', 'registry', 'sets.json')]) {
      assert.ok(fs.readFileSync(f, 'utf8').includes('\n  '), `${path.basename(f)} bleibt eingerueckt`);
    }
    const alpha = idx.find((e) => e.setId === 'sv1' && e.cardId === '1');
    assert.equal(alpha.img, 'https://assets.tcgdex.net/en/sv/sv01/001/low.webp');
    assert.equal(alpha.imgDe, 'https://assets.tcgdex.net/de/sv/sv01/001/low.webp');
    assert.deepEqual(alpha.types, ['Grass']);
    assert.equal(alpha.rarity, 'Common');
    assert.equal(alpha.artist, 'Ann Artist');
    assert.equal(alpha.supertype, 'Pokémon');
    assert.equal(alpha.cm, 701); // Cardmarket-Produkt-ID: erste Variante mit cardmarketId
    const beta = idx.find((e) => e.setId === 'sv1' && e.cardId === '2');
    assert.ok(!('imgDe' in beta));
    assert.ok(!('artist' in beta));
    for (const e of idx) for (const v of Object.values(e)) assert.notEqual(v, undefined);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

const catalogLine = (id, name, expansionId = 4999) => JSON.stringify({ id, name, expansionId, collectorNumber: null, metacardId: null, dateAdded: '2023-01-01 00:00:00' });

test('runBuild: Cardmarket-IDs aus Katalog und custom-set nachgetragen, Report und cm im Suchindex', () => {
  const root = makeRepo();
  try {
    // sv1-3 (Gamma) hat keine TCGdex-Cardmarket-ID; der Katalog kennt genau ein Gamma-Produkt (ohne Nummer).
    // custom-set 4999: #2 -> 702 (bestaetigt die TCGdex-ID von Beta).
    write(root, 'sources/cardmarket/catalog.jsonl', `${[catalogLine(701, 'Alpha [Tackle]'), catalogLine(702, 'Beta [Tackle]'), catalogLine(704, 'Delta [Tackle]'), catalogLine(803, 'Gamma [Gnaw | Bite]')].join('\n')}\n`);
    write(root, 'sources/cardmarket/custom-sets/4999.json', { expansionId: 4999, name: 'Scarlet & Violet', cards: [{ productId: 702, collectorNumber: '2' }] });
    const r = runBuild({ repoRoot: root });
    const v3 = path.join(root, 'api', 'v3');
    const sv1 = readJson(path.join(v3, 'cards', 'sv1.json'));
    assert.deepEqual(sv1[0].ids.cardmarket, [701]); // TCGdex-ID bleibt
    assert.equal(sv1[0].ids.cardmarketSource, undefined);
    assert.deepEqual(sv1[1].ids.cardmarket, [702]);
    assert.equal(sv1[1].ids.cardmarketSource, 'custom-set');
    assert.deepEqual(sv1[2].ids.cardmarket, [803]);
    assert.equal(sv1[2].ids.cardmarketSource, 'matched');
    const report = readJson(path.join(v3, 'reports', 'cardmarket-ids.json'));
    assert.deepEqual(report.bySet.sv1, { expansionId: 4999, cards: 4, tcgdex: 2, matched: 1, missing: 0, ambiguous: 0, customSet: 1, coverage: { cards: 4, withId: 4, bySource: { tcgdex: 2, customSet: 1, matched: 1 } }, searchUrl: cardmarketSearchUrl(4999) });
    assert.equal(report.totals.matched, 1);
    assert.equal(r.cardmarketIds.matched, 1);
    assert.deepEqual(r.cardmarketIds.duplicates, { ids: 0, cards: 0, corrected: 0, kept: 0 });
    assert.deepEqual(report.duplicateTcgdexIds, {});
    const raw = fs.readFileSync(path.join(v3, 'reports', 'cardmarket-ids.json'), 'utf8');
    assert.ok(raw.includes('\n  '), 'Report eingerueckt');
    const idx = readJson(path.join(v3, 'search-index.json'));
    const cm = (setId, cardId) => idx.find((e) => e.setId === setId && e.cardId === cardId).cm;
    assert.equal(cm('sv1', '1'), 701);
    assert.equal(cm('sv1', '3'), 803);
    assert.equal(cm('sv1', '4'), 704);
    assert.ok(idx.filter((e) => e.setId === 'TCGDEX-A1').every((e) => !('cm' in e)));

    // Folgetag: ein zweites Gamma-Produkt macht den Namen mehrdeutig -> Stabilitaetsregel behaelt 803
    fs.appendFileSync(path.join(root, 'sources', 'cardmarket', 'catalog.jsonl'), `${catalogLine(804, 'Gamma [Other]')}\n`);
    const r2 = runBuild({ repoRoot: root });
    const day2 = readJson(path.join(v3, 'cards', 'sv1.json'));
    assert.deepEqual(day2[2].ids.cardmarket, [803]);
    assert.equal(day2[2].ids.cardmarketSource, 'matched');
    assert.equal(r2.cardmarketIds.stabilityKept, 1);
    const report2 = readJson(path.join(v3, 'reports', 'cardmarket-ids.json'));
    assert.deepEqual(report2.stabilityKept, [{ cardKey: 'sv1/3', productId: 803, source: 'matched', todayId: null, todaySource: null }]);
    // Produkt verschwindet aus dem Katalog -> gestrige ID entfaellt, das jetzt eindeutige Gamma-Produkt gilt
    const lines = fs.readFileSync(path.join(root, 'sources', 'cardmarket', 'catalog.jsonl'), 'utf8').split('\n').filter((l) => l && !l.includes('"id":803,'));
    fs.writeFileSync(path.join(root, 'sources', 'cardmarket', 'catalog.jsonl'), `${lines.join('\n')}\n`);
    runBuild({ repoRoot: root });
    assert.deepEqual(readJson(path.join(v3, 'cards', 'sv1.json'))[2].ids.cardmarket, [804]);
    assert.deepEqual(readJson(path.join(v3, 'reports', 'cardmarket-ids.json')).stabilityDropped, [{ cardKey: 'sv1/3', productId: 803, source: 'matched', reason: 'product-gone' }]);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('runBuild: assets-verified.json filtert fehlende Set-Logos, Zusammenfassung der Assets', () => {
  const root = makeRepo();
  try {
    const A = 'https://assets.tcgdex.net';
    const at = '2026-11-12T00:00:00.000Z';
    write(root, 'sources/tcgdex/assets-verified.json', {
      [`${A}/en/sv/sv01/logo.webp`]: { status: 'missing', checkedAt: at },
      [`${A}/en/sv/sv01/logo.png`]: { status: 'missing', checkedAt: at },
      [`${A}/en/tcgp/A1/logo.webp`]: { status: 'ok', checkedAt: at },
      [`${A}/en/gone/gone/logo.webp`]: { status: 'ok', checkedAt: at }, // kein Kandidat mehr -> zaehlt nicht
    });
    const r = runBuild({ repoRoot: root });
    const sets = readJson(path.join(root, 'api', 'v3', 'sets.json'));
    assert.equal(sets.find((s) => s.id === 'sv1').images.logo, 'pt-l');
    assert.equal(sets.find((s) => s.id === 'TCGDEX-A1').images.logo, `${A}/en/tcgp/A1/logo.webp`);
    assert.deepEqual(r.assets, { ok: 1, missing: 1 }); // je Asset-Gruppe (webp+png), nicht je URL
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('runBuild tcgdexOnly: kanonische IDs aus der Registry, Registry nicht geschrieben', () => {
  const root = makeRepo();
  try {
    runBuild({ repoRoot: root });
    const reg = snapshot(path.join(root, 'api', 'registry'));
    fs.rmSync(path.join(root, 'sources', 'pokemontcg'), { recursive: true });
    const out = path.join(root, 'out-td');
    // sv1-2: kein EN-Bild, ohne pokemontcg keine Legacy-URL -> nur i18n.de.images; A1/010: gar kein Bild -> Warnung
    const assets = readJson(path.join(root, 'sources', 'tcgdex', 'assets-index.json'));
    assets.de.sv.sv01['002'] = 'h';
    delete assets.en.tcgp.A1['010'];
    write(root, 'sources/tcgdex/assets-index.json', assets);
    const r = runBuild({ repoRoot: root, tcgdexOnly: true, outDir: 'out-td' });
    assert.deepEqual(snapshot(path.join(root, 'api', 'registry')), reg);
    const full = keysOf(path.join(root, 'api', 'v3'));
    const td = keysOf(out);
    // pt-only-Karte ohne jede Quelle kann ohne pokemontcg nicht erzeugt werden
    assert.deepEqual(td, full.filter((k) => k !== 'sv1/3'));
    assert.deepEqual(r.skippedNoSource, ['sv1/3']);
    const sv1 = readJson(path.join(out, 'cards', 'sv1.json'));
    assert.equal(sv1[0].name, 'Alpha');
    assert.equal(sv1[0].matchStatus, 'tcgdex_only');
    assert.equal('images' in sv1[1], false); // nur DE-Bild: oben kein images, nicht als fehlend gezaehlt
    assert.equal(sv1[1].i18n.de.images.small, 'https://assets.tcgdex.net/de/sv/sv01/002/low.webp');
    const a1 = readJson(path.join(out, 'cards', 'TCGDEX-A1.json'));
    assert.equal(a1.length, 3);
    assert.equal('images' in a1[2], false); // ohne Bild: Feld fehlt, Karte bleibt
    assert.deepEqual(r.missingImages, { total: 1, bySet: { 'TCGDEX-A1': 1 } });
    assert.deepEqual(readJson(path.join(out, 'meta.json')).warnings, { missingImages: { bySet: { 'TCGDEX-A1': 1 }, total: 1 } });
    assert.deepEqual(readJson(path.join(out, 'sets.json')).find((s) => s.id === 'sv1').name, 'Scarlet & Violet');
    assert.equal(readJson(path.join(out, 'meta.json')).sources.pokemontcg, null);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('runBuild: eingefrorene Registry-Abweichung bricht ab', () => {
  const root = makeRepo();
  try {
    runBuild({ repoRoot: root });
    const f = path.join(root, 'api', 'registry', 'cards', 'TCGDEX-A1.json');
    const cards = readJson(f);
    cards['1'].tcgdex = [{ set: 'A1', localId: '999' }];
    fs.writeFileSync(f, `${JSON.stringify(cards, null, 2)}\n`);
    assert.throws(() => runBuild({ repoRoot: root }), RegistryFrozenError);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('runBuild: Karte ohne Namen bricht mit BuildValidationError ab, nichts geschrieben', () => {
  const root = makeRepo();
  try {
    write(root, 'sources/tcgdex/data/Pokémon TCG Pocket/Genetic Apex/002.ts', cardTs('Genetic Apex', 'name: {}, category: "Pokemon", stage: "Basic"'));
    assert.throws(() => runBuild({ repoRoot: root }), (e) => e instanceof BuildValidationError
      && e.violations.length === 1 && e.violations[0] === 'Karte TCGDEX-A1-2: name fehlt');
    assert.equal(fs.existsSync(path.join(root, 'api', 'v3', 'cards')), false);
    assert.equal(fs.existsSync(path.join(root, 'api', 'registry')), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('requiredFieldViolations: Pflichtfelder fuer Karten und Sets (Bilder nicht Pflicht)', () => {
  const ok = { id: 's-1', setId: 's', cardId: '1', name: 'A', number: '1', images: { small: 'x' } };
  assert.deepEqual(requiredFieldViolations({ sets: [{ id: 's', name: 'S' }], cardsBySet: new Map([['s', [ok]]]) }), []);
  const v = requiredFieldViolations({
    sets: [{ id: 't' }],
    cardsBySet: new Map([['s', [{ ...ok, name: '' }, { ...ok, id: 's-2', images: undefined }, { ...ok, id: 's-3', images: { large: 'y' } }]]]),
  });
  assert.deepEqual(v, [
    'Set t: name fehlt',
    'Karte s-1: name fehlt',
  ]);
  const w = requiredFieldViolations({ sets: [], cardsBySet: new Map([['s', [{ ...ok, number: ' ' }, { ...ok, id: undefined }]]]) });
  assert.deepEqual(w, ['Karte s-1: number fehlt', 'Karte ?: id fehlt']);
});

test('runBuild: schreibt gelernte Tabellen deterministisch nach reports/learned-tables.json', () => {
  const root = makeRepo();
  try {
    runBuild({ repoRoot: root });
    const f = path.join(root, 'api', 'v3', 'reports', 'learned-tables.json');
    const a = fs.readFileSync(f, 'utf8');
    assert.ok(a.endsWith('\n'));
    assert.equal(typeof JSON.parse(a), 'object');
    runBuild({ repoRoot: root });
    assert.equal(fs.readFileSync(f, 'utf8'), a);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('runBuild: verschwundene Quelle einer Registry-Karte ist ein Build-Fehler mit Set/Karte/Ref', () => {
  const root = makeRepo();
  try {
    runBuild({ repoRoot: root });
    // pt-Karte sv1-3 (nur pokemontcg) verschwindet aus der Quelle
    write(root, 'sources/pokemontcg/cards/en/sv1.json', readJson(path.join(root, 'sources/pokemontcg/cards/en/sv1.json')).filter((c) => c.id !== 'sv1-3'));
    assert.throws(() => runBuild({ repoRoot: root }), (e) => /sv1\/3/.test(e.message)
      && (e instanceof BuildValidationError || e instanceof RegistryFrozenError));
    // tcgdex-only darf pt-only-Karten weiterhin auslassen
    const ok = makeRepo();
    try {
      runBuild({ repoRoot: ok });
      fs.rmSync(path.join(ok, 'sources', 'pokemontcg'), { recursive: true });
      assert.deepEqual(runBuild({ repoRoot: ok, tcgdexOnly: true, outDir: 'out-td' }).skippedNoSource, ['sv1/3']);
    } finally {
      fs.rmSync(ok, { recursive: true, force: true });
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('runBuild: synthetisiertes pt-Set nimmt Name/printedTotal aus TCGdex, total aus Kartenzahl', () => {
  const root = makeRepo();
  try {
    const d = 'sources/tcgdex/data';
    write(root, `${d}/Scarlet & Violet/Promo.ts`, setTs('Scarlet & Violet', 'mep', 'Mega Promos').replace('cardCount: { official: 3 }', 'cardCount: { official: 99 }'));
    write(root, `${d}/Scarlet & Violet/Promo/001.ts`, cardTs('Promo', 'name: { en: "Promo A", de: "Promo A DE" }, category: "Pokemon", stage: "Basic", rarity: "Promo", hp: 60'));
    write(root, 'sources/pokemontcg/cards/en/mep.json', [{ id: 'mep-1', name: 'Promo A', number: '1', supertype: 'Pokémon', subtypes: ['Basic'], images: { small: 'x', large: 'y' } }]);
    write(root, 'api/mappings/set-map.json', { pairs: [{ pokemontcg: 'sv1', tcgdex: 'sv01' }, { pokemontcg: 'mep', tcgdex: 'mep' }] });
    runBuild({ repoRoot: root });
    const mep = readJson(path.join(root, 'api', 'v3', 'sets.json')).find((s) => s.id === 'mep');
    assert.equal(mep.name, 'Mega Promos');
    assert.equal(mep.i18n.de.name, 'Mega Promos DE');
    assert.equal(mep.printedTotal, 99);
    assert.equal(mep.total, 1);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('runBuild: unsichere Set-IDs werden nie zu Dateinamen', () => {
  for (const bad of ['../x', 'a/b']) {
    const root = makeRepo();
    try {
      const sets = readJson(path.join(root, 'sources/pokemontcg/sets/en.json'));
      sets[0].id = bad;
      write(root, 'sources/pokemontcg/sets/en.json', sets);
      assert.throws(() => runBuild({ repoRoot: root }), /Ungueltige Set-ID|ungueltig/);
      assert.equal(fs.existsSync(path.join(root, 'api', 'v3', 'cards')), false);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }
});

test('excluded-series: Pocket-Set erscheint nicht in api/v3, Registry behaelt ihn, leere Konfig stellt wieder her', () => {
  const root = makeRepo();
  try {
    runBuild({ repoRoot: root });
    const v3 = path.join(root, 'api', 'v3');
    write(root, 'api/v3/prices/TCGDEX-A1.json', []);
    const regBefore = readJson(path.join(root, 'api', 'registry', 'sets.json'));
    assert.ok(regBefore['TCGDEX-A1']);

    write(root, 'api/mappings/excluded-series.json', { _comment: 'x', series: ['tcgp'] });
    const r = runBuild({ repoRoot: root });
    assert.equal(r.sets, 1);
    assert.equal(r.cards, 4);
    assert.ok(!fs.existsSync(path.join(v3, 'cards', 'TCGDEX-A1.json')), 'stale Kartendatei entfernt');
    assert.ok(!fs.existsSync(path.join(v3, 'prices', 'TCGDEX-A1.json')), 'stale Preisdatei entfernt');
    assert.deepEqual(readJson(path.join(v3, 'sets.json')).map((s) => s.id), ['sv1']);
    assert.ok(readJson(path.join(v3, 'search-index.json')).every((e) => e.setId !== 'TCGDEX-A1'));
    const meta = readJson(path.join(v3, 'meta.json'));
    assert.deepEqual(meta.excludedSetIds, ['TCGDEX-A1']);
    assert.deepEqual(meta.excludedSeries, ['tcgp']);
    assert.equal(meta.counts.sets, 1);
    assert.ok(readJson(path.join(root, 'api', 'registry', 'sets.json'))['TCGDEX-A1'], 'Registry behaelt den Schluessel');
    assert.ok(readJson(path.join(root, 'api', 'registry', 'cards', 'TCGDEX-A1.json')));

    write(root, 'api/mappings/excluded-series.json', { _comment: 'x', series: [] });
    const r2 = runBuild({ repoRoot: root });
    assert.equal(r2.sets, 2);
    assert.ok(fs.existsSync(path.join(v3, 'cards', 'TCGDEX-A1.json')));
    assert.deepEqual(readJson(path.join(v3, 'meta.json')).excludedSetIds, []);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('runBuild: cardmarket-ids.md, Issue-Ergebnis in .cache; vorherige sets.json liefert die bekannten Sets', () => {
  const root = makeRepo();
  try {
    write(root, 'sources/cardmarket/catalog.jsonl', `${[catalogLine(701, 'Alpha [Tackle]')].join('\n')}\n`);
    const r1 = runBuild({ repoRoot: root });
    const md = fs.readFileSync(path.join(root, 'api', 'v3', 'reports', 'cardmarket-ids.md'), 'utf8');
    assert.match(md, /^# Cardmarket-Zuordnung/);
    assert.match(md, /\| sv1 \| 4999 \|/);
    assert.equal(r1.cardmarketIssue.open, false); // erster Lauf: keine vorherige sets.json -> Neu-Regel ausgesetzt
    const issueFile = path.join(root, '.cache', 'cardmarket', 'issue.json');
    assert.deepEqual(readJson(issueFile), r1.cardmarketIssue);
    // sets.json ohne sv1 -> sv1 gilt als neu und hat < 80 % Abdeckung (3 von 4 ohne ID)
    const setsFile = path.join(root, 'api', 'v3', 'sets.json');
    fs.writeFileSync(setsFile, JSON.stringify(readJson(setsFile).filter((s) => s.id !== 'sv1')));
    fs.writeFileSync(path.join(root, 'sources', 'cardmarket', 'meta.json'), JSON.stringify({ consecutiveFailures: 0 }));
    const r2 = runBuild({ repoRoot: root });
    assert.equal(r2.cardmarketIssue.open, true);
    assert.match(r2.cardmarketIssue.body, /`sv1`/);
    assert.equal(readJson(issueFile).open, r2.cardmarketIssue.open);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
