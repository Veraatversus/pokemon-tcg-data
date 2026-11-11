import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runBuild, requiredFieldViolations, BuildValidationError } from '../build-api.mjs';
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
  write(root, 'sources/pokemontcg/cards/en/sv1.json', [pt(1, 'Alpha'), pt(2, 'Beta'), pt(3, 'Gamma')]);

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
  write(root, 'cardmarket/index/tracker.json', { bySetId: { sv1: '5000' } });
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
      'cards/TCGDEX-A1.json', 'cards/sv1.json', 'meta.json', 'reports/matching.json', 'search-index.json', 'sets.json',
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
    const idx = readJson(path.join(v3, 'search-index.json'));
    assert.equal(idx.length, 7);
    assert.deepEqual(idx[0], { cardId: '1', name: 'Pocket 001', nameDe: 'Tasche 001', number: '001', setId: 'TCGDEX-A1' });
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

test('runBuild tcgdexOnly: kanonische IDs aus der Registry, Registry nicht geschrieben', () => {
  const root = makeRepo();
  try {
    runBuild({ repoRoot: root });
    const reg = snapshot(path.join(root, 'api', 'registry'));
    fs.rmSync(path.join(root, 'sources', 'pokemontcg'), { recursive: true });
    const out = path.join(root, 'out-td');
    // sv1-2 hat kein TCGdex-Bild und ohne pokemontcg keine Legacy-URL -> Pflichtfeld-Gate
    assert.throws(() => runBuild({ repoRoot: root, tcgdexOnly: true, outDir: 'out-td' }), (e) => e instanceof BuildValidationError
      && e.violations.includes('Karte sv1-2: images.small fehlt') && e.violations.length === 1);
    assert.equal(fs.existsSync(out), false);
    const assets = readJson(path.join(root, 'sources', 'tcgdex', 'assets-index.json'));
    assets.en.sv.sv01['002'] = 'h';
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
    assert.equal(sv1[1].images.small, 'https://assets.tcgdex.net/en/sv/sv01/002/low.webp');
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

test('requiredFieldViolations: Pflichtfelder fuer Karten und Sets', () => {
  const ok = { id: 's-1', setId: 's', cardId: '1', name: 'A', number: '1', images: { small: 'x' } };
  assert.deepEqual(requiredFieldViolations({ sets: [{ id: 's', name: 'S' }], cardsBySet: new Map([['s', [ok]]]) }), []);
  const v = requiredFieldViolations({
    sets: [{ id: 't' }],
    cardsBySet: new Map([['s', [{ ...ok, name: '' }, { ...ok, id: 's-2', images: undefined }, { ...ok, id: 's-3', images: { large: 'y' } }]]]),
  });
  assert.deepEqual(v, [
    'Set t: name fehlt',
    'Karte s-1: name fehlt',
    'Karte s-2: images.small fehlt',
    'Karte s-3: images.small fehlt',
  ]);
});
