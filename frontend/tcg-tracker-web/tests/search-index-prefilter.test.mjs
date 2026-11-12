// Fix-Runde 1 (Task 6): Suche laedt search-index.json und nur die Kartendateien der Sets mit Treffern.
import test from 'node:test';
import assert from 'node:assert/strict';

globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
const { CONFIG } = await import('../js/core/config.js');
const { resetV3Caches, loadV3Cards } = await import('../js/data/v3-api.js');
const { selectSearchSets, indexEntryToCard } = await import('../js/features/search/search-index-prefilter.js');

const V3 = 'https://x.test/v3/';
CONFIG.APIS.V3_BASE = V3;
CONFIG.APIS.REGISTRY_BASE = 'https://x.test/registry/';

const INDEX = [
  { setId: 'base1', cardId: '58', number: '58', name: 'Pikachu' },
  { setId: 'base1', cardId: '4', number: '4', name: 'Charizard', nameDe: 'Glurak' },
  { setId: 'me5', cardId: '1', number: '1', name: 'Bulbasaur', nameDe: 'Bisasam' },
  { setId: 'swsh12pt5', cardId: 'GG1', number: 'GG01', name: 'Pikachu' },
  { setId: 'sv1', cardId: '7', number: '7', name: 'Sprigatito', nameDe: 'Felori' }
];
const SETS = ['base1', 'me5', 'swsh12pt5', 'sv1'].map((setId) => ({ setId, setName: `Set ${setId}`, imported: true }));

let fetchLog = [];
function stub({ indexOk = true } = {}) {
  resetV3Caches();
  fetchLog = [];
  globalThis.fetch = async (url) => {
    const u = String(url);
    fetchLog.push(u.slice(V3.length));
    if (u === `${V3}search-index.json`) {
      return indexOk ? { ok: true, status: 200, json: async () => INDEX } : { ok: false, status: 503, json: async () => null };
    }
    if (u.startsWith(`${V3}cards/`)) return { ok: true, status: 200, json: async () => [] };
    return { ok: false, status: 404, json: async () => null };
  };
}
const nameMatch = (query) => (card) => [card.name, card.tcgdex_name].some((v) => String(v || '').toLowerCase().includes(query));

async function search(query, opts = {}) {
  const selected = await selectSearchSets({ sets: SETS, matchCard: nameMatch(query), ...opts });
  for (const set of selected || SETS) await loadV3Cards(set.setId);
  return selected;
}

test('Namenssuche: Index + nur Kartendateien der Sets mit Treffern', async () => {
  stub();
  const selected = await search('pikachu');
  assert.deepEqual(selected.map((s) => s.setId), ['base1', 'swsh12pt5']);
  assert.deepEqual(fetchLog, ['search-index.json', 'cards/base1.json', 'cards/swsh12pt5.json']);
});

test('deutscher Name (nameDe) trifft ueber den Index', async () => {
  stub();
  const selected = await search('glurak');
  assert.deepEqual(selected.map((s) => s.setId), ['base1']);
  assert.equal(fetchLog.filter((u) => u.startsWith('cards/')).length, 1);
});

test('Suchbereich wird respektiert (nur uebergebene Sets, z. B. importiert)', async () => {
  stub();
  const selected = await selectSearchSets({ sets: SETS.filter((s) => s.setId !== 'swsh12pt5'), matchCard: nameMatch('pikachu') });
  assert.deepEqual(selected.map((s) => s.setId), ['base1']);
});

test('Set-Feld-Treffer (matchSet) laedt das Set auch ohne Kartentreffer', async () => {
  stub();
  const selected = await selectSearchSets({ sets: SETS, matchCard: () => false, matchSet: (s) => s.setId === 'sv1' });
  assert.deepEqual(selected.map((s) => s.setId), ['sv1']);
});

test('kein Indextreffer oder Index nicht erreichbar -> null (voller Scan)', async () => {
  stub();
  assert.equal(await selectSearchSets({ sets: SETS, matchCard: nameMatch('holo rare') }), null);
  stub({ indexOk: false });
  await assert.rejects(selectSearchSets({ sets: SETS, matchCard: nameMatch('pikachu') }));
});

test('indexEntryToCard: Display-Felder fuer die bestehende Trefferlogik', () => {
  assert.deepEqual(indexEntryToCard(INDEX[1]), {
    setId: 'base1', collectionKey: '4', number: '4', name: 'Charizard', vera_name: 'Charizard', tcgdex_name: 'Glurak'
  });
});
