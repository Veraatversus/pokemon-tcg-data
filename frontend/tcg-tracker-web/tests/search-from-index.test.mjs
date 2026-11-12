// Task 7 (Polish): Suche rendert direkt aus api/v3/search-index.json, ohne Kartendateien je Set.
import test from 'node:test';
import assert from 'node:assert/strict';

globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
const { CONFIG } = await import('../js/core/config.js');
const { resetV3Caches } = await import('../js/data/v3-api.js');
const { imageCandidates } = await import('../js/ui/image-fallback.js');
const {
  searchIndexEntries,
  searchIndexResults,
  searchFromIndex,
  indexEntryToCard
} = await import('../js/features/search/search-index-prefilter.js');

const V3 = 'https://x.test/v3/';
CONFIG.APIS.V3_BASE = V3;
CONFIG.APIS.REGISTRY_BASE = 'https://x.test/registry/';

const INDEX = [
  { setId: 'base1', cardId: '58', number: '58', name: 'Pikachu', artist: 'Mitsuhiro Arita', types: ['Lightning'], rarity: 'Common', supertype: 'Pokémon', img: 'https://img.test/en/base1/58.webp' },
  { setId: 'base1', cardId: '4', number: '4', name: 'Charizard', nameDe: 'Glurak', artist: 'Mitsuhiro Arita', types: ['Fire'], rarity: 'Rare Holo', supertype: 'Pokémon', img: 'https://img.test/en/base1/4.webp', imgDe: 'https://img.test/de/base1/4.webp' },
  { setId: 'me5', cardId: '1', number: '001', name: 'Bulbasaur', nameDe: 'Bisasam', artist: 'Ken Sugimori', types: ['Grass'], rarity: 'Common', supertype: 'Pokémon' },
  { setId: 'swsh12pt5', cardId: 'GG1', number: 'GG01', name: 'Pikachu', artist: 'Kagemaru Himeno', types: ['Lightning'], rarity: 'Rare Holo', supertype: 'Pokémon' },
  { setId: 'sv1', cardId: '7', number: '7', name: 'Sprigatito', nameDe: 'Felori', artist: 'Akira Komayama', types: ['Grass'], supertype: 'Pokémon' },
  { setId: 'sv1', cardId: '57', number: '57', name: 'Diglett', nameDe: 'Digda', artist: 'Saya Tsuruta', types: ['Fighting'], supertype: 'Pokémon' },
  { setId: 'sv1', cardId: '190', number: '190', name: 'Professor\'s Research', nameDe: 'Forschung des Professors', supertype: 'Trainer' }
];
const SETS = [
  { setId: 'base1', setName: 'Base Set', vera_ptcgoCode: 'BS', imported: true },
  { setId: 'me5', setName: 'Mega Evolution 5', imported: false },
  { setId: 'swsh12pt5', setName: 'Crown Zenith', vera_ptcgoCode: 'CRZ', aliases: ['swsh12pt5gg'], imported: true },
  { setId: 'sv1', setName: 'Karmesin & Purpur', vera_name: 'Scarlet & Violet', vera_ptcgoCode: 'SVI', imported: true }
];

const ids = (entries) => entries.map((e) => `${e.setId}/${e.cardId}`);

let fetchLog = [];
function stubFetch() {
  resetV3Caches();
  fetchLog = [];
  globalThis.fetch = async (url) => {
    const u = String(url);
    fetchLog.push(u.startsWith(V3) ? u.slice(V3.length) : u);
    if (u === `${V3}search-index.json`) return { ok: true, status: 200, json: async () => INDEX };
    return { ok: true, status: 200, json: async () => [] };
  };
}

test('artist query matches from index without set fetch', async () => {
  stubFetch();
  const results = await searchFromIndex('mitsuhiro arita', { sets: SETS });
  assert.deepEqual(ids(results.map((r) => r.entry)).sort(), ['base1/4', 'base1/58']);
  assert.deepEqual(fetchLog, ['search-index.json']);
  assert.equal(fetchLog.filter((u) => u.startsWith('cards/')).length, 0);
});

test('name query matches DE and EN names', () => {
  assert.deepEqual(ids(searchIndexEntries(INDEX, 'glurak', { sets: SETS })), ['base1/4']);
  assert.deepEqual(ids(searchIndexEntries(INDEX, 'Charizard', { sets: SETS })), ['base1/4']);
  assert.deepEqual(ids(searchIndexEntries(INDEX, 'pikachu', { sets: SETS })).sort(), ['base1/58', 'swsh12pt5/GG1']);
});

test('results carry img and collection key', () => {
  const [result] = searchIndexResults(INDEX, 'glurak', { sets: SETS });
  assert.equal(result.set.setId, 'base1');
  const card = indexEntryToCard(result.entry, { language: 'de' });
  assert.equal(card.collectionKey, '4');
  assert.equal(card.setId, 'base1');
  assert.equal(card.number, '4');
  assert.equal(card.name, 'Glurak');
  assert.deepEqual(imageCandidates(card, 'cardSmall', 'de'), ['https://img.test/de/base1/4.webp', 'https://img.test/en/base1/4.webp']);
  assert.deepEqual(imageCandidates(card, 'cardSmall', 'en'), ['https://img.test/en/base1/4.webp', 'https://img.test/de/base1/4.webp']);
  assert.equal(indexEntryToCard(result.entry, { language: 'en' }).name, 'Charizard');
});

test('Gross-/Kleinschreibung und Diakritika egal', () => {
  assert.equal(searchIndexEntries(INDEX, 'pokemon', { sets: SETS }).length, 6);
  assert.deepEqual(ids(searchIndexEntries(INDEX, 'GLÜRAK', { sets: SETS })), ['base1/4']);
});

test('alle Suchwoerter muessen ein Feld treffen (Name, Kuenstler, Typ, Seltenheit, Set, Nummer)', () => {
  assert.deepEqual(ids(searchIndexEntries(INDEX, 'pikachu rare holo', { sets: SETS })), ['swsh12pt5/GG1']);
  assert.deepEqual(ids(searchIndexEntries(INDEX, 'grass bisasam', { sets: SETS })), ['me5/1']);
  assert.deepEqual(ids(searchIndexEntries(INDEX, 'pikachu crown zenith', { sets: SETS })), ['swsh12pt5/GG1']);
  assert.deepEqual(ids(searchIndexEntries(INDEX, '57 digda', { sets: SETS })), ['sv1/57']);
  assert.deepEqual(ids(searchIndexEntries(INDEX, 'digda 99', { sets: SETS })), []);
  assert.deepEqual(ids(searchIndexEntries(INDEX, 'gg01', { sets: SETS })), ['swsh12pt5/GG1']);
  assert.deepEqual(ids(searchIndexEntries(INDEX, '1 bisasam', { sets: SETS })), ['me5/1']);
});

test('Suchbereich: nur uebergebene Sets, setFilter auf ein Set (auch per Alias)', () => {
  const imported = SETS.filter((s) => s.imported);
  assert.deepEqual(ids(searchIndexEntries(INDEX, 'grass', { sets: imported })), ['sv1/7']);
  assert.deepEqual(ids(searchIndexEntries(INDEX, 'pikachu', { sets: SETS, setFilter: 'swsh12pt5gg' })), ['swsh12pt5/GG1']);
  assert.deepEqual(ids(searchIndexEntries(INDEX, 'pikachu', { sets: SETS, setFilter: 'sv1' })), []);
});

test('setFilter ohne Suchwort liefert das ganze Set (strukturierte Suche "SVI")', () => {
  assert.deepEqual(ids(searchIndexEntries(INDEX, '', { sets: SETS, setFilter: 'sv1' })), ['sv1/7', 'sv1/57', 'sv1/190']);
  assert.deepEqual(searchIndexEntries(INDEX, '', { sets: SETS }), []);
});

test('Sortierung: exakter Name vor Namensanfang vor sonstigen Treffern', () => {
  const index = [
    { setId: 'sv1', cardId: '1', number: '1', name: 'Pikachu ex' },
    { setId: 'sv1', cardId: '2', number: '2', name: 'Raichu', artist: 'Pikachu Fan' },
    { setId: 'sv1', cardId: '3', number: '3', name: 'Pikachu' }
  ];
  assert.deepEqual(ids(searchIndexEntries(index, 'pikachu', { sets: SETS })), ['sv1/3', 'sv1/1', 'sv1/2']);
});

test('grosser Index (24k Eintraege) wird schnell durchsucht', () => {
  const big = [];
  for (let i = 0; i < 24000; i += 1) {
    big.push({ setId: SETS[i % 4].setId, cardId: String(i), number: String(i), name: `Karte ${i}`, artist: i % 7 ? 'Ken Sugimori' : 'Mitsuhiro Arita', types: ['Fire'] });
  }
  searchIndexEntries(big, 'warmup', { sets: SETS });
  const start = performance.now();
  const hits = searchIndexEntries(big, 'arita', { sets: SETS });
  const elapsed = performance.now() - start;
  assert.ok(hits.length > 3000);
  assert.ok(elapsed < 250, `Suche dauerte ${elapsed.toFixed(1)} ms`);
});
