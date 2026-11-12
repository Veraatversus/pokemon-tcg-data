// Suche ueber api/v3/search-index.json: Index einmal je Session laden, keine Kartendateien je Set.
// (Bis Task 7 war das eine Vorauswahl der Sets fuer den vollen Scan; der Scan ist entfallen.)
import test from 'node:test';
import assert from 'node:assert/strict';

globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
const { CONFIG } = await import('../js/core/config.js');
const { resetV3Caches } = await import('../js/data/v3-api.js');
const { searchFromIndex, indexEntryToCard } = await import('../js/features/search/search-index-prefilter.js');

const V3 = 'https://x.test/v3/';
CONFIG.APIS.V3_BASE = V3;
CONFIG.APIS.REGISTRY_BASE = 'https://x.test/registry/';

const INDEX = [
  { setId: 'base1', cardId: '58', number: '58', name: 'Pikachu' },
  { setId: 'base1', cardId: '4', number: '4', name: 'Charizard', nameDe: 'Glurak' },
  { setId: 'swsh12pt5', cardId: 'GG1', number: 'GG01', name: 'Pikachu' }
];
const SETS = ['base1', 'swsh12pt5'].map((setId) => ({ setId, setName: `Set ${setId}`, imported: true }));

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
    return { ok: true, status: 200, json: async () => [] };
  };
}

test('Index wird je Session einmal geladen, keine Kartendateien', async () => {
  stub();
  assert.equal((await searchFromIndex('pikachu', { sets: SETS })).length, 2);
  assert.equal((await searchFromIndex('glurak', { sets: SETS })).length, 1);
  assert.deepEqual(fetchLog, ['search-index.json']);
});

test('Index nicht erreichbar -> Fehler (kein Scan aller Sets)', async () => {
  stub({ indexOk: false });
  await assert.rejects(searchFromIndex('pikachu', { sets: SETS }));
  assert.equal(fetchLog.filter((u) => u.startsWith('cards/')).length, 0);
});

test('indexEntryToCard: Anzeige-Karte mit collectionKey, Namen und Bildern', () => {
  assert.deepEqual(indexEntryToCard(INDEX[1], { language: 'de' }), {
    setId: 'base1',
    cardId: '4',
    collectionKey: '4',
    number: '4',
    name: 'Glurak',
    vera_name: 'Charizard',
    tcgdex_name: 'Glurak',
    artist: '',
    rarity: '',
    types: [],
    supertype: '',
    images: {},
    i18n: { de: { name: 'Glurak', images: {} } },
    fromSearchIndex: true
  });
  assert.equal(indexEntryToCard(INDEX[0], { language: 'de' }).name, 'Pikachu');
});
