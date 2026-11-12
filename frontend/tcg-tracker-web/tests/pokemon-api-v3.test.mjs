import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { resetV3Caches } from '../js/data/v3-api.js';
import {
  fetchAllAvailableSets,
  fetchMergedCards,
  fetchMergedCardsWithSetMeta,
  V3_UNREACHABLE_MESSAGE
} from '../js/data/pokemon-api.js';

// ── Gestubbter v3-Client: location + fetch, ausgeliefert aus Fixtures ──────────
const APP = 'https://x.test/repo/frontend/tcg-tracker-web/';
const V3 = 'https://x.test/repo/api/v3/';
const REG = 'https://x.test/repo/api/registry/';

const v3Set = (id, extra = {}) => ({
  id,
  ids: { pokemontcg: id.startsWith('TCGDEX-') ? null : id, tcgdex: null, cardmarket: null },
  name: `Name ${id}`,
  series: 'Serie',
  printedTotal: 3,
  total: 3,
  releaseDate: '2020/01/01',
  images: { logo: `https://assets.example/${id}/logo.png`, symbol: '' },
  aliases: [],
  ...extra
});

const v3Card = (setId, cardId, number, extra = {}) => ({
  id: `${setId}-${cardId}`,
  cardId,
  setId,
  number,
  name: `Card ${number}`,
  matchStatus: 'matched',
  ids: { pokemontcg: `${setId}-${cardId}`, tcgdex: null, cardmarket: [] },
  images: { small: `https://assets.example/${setId}/${cardId}/low.webp`, large: '' },
  i18n: { de: { name: `Karte ${number}` } },
  ...extra
});

const FIXTURES = {
  [`${V3}sets.json`]: [
    v3Set('me5', { ids: { pokemontcg: 'me5', tcgdex: 'me05', cardmarket: 6569 }, releaseDate: '2026/07/17', aliases: ['TCGDEX-me05'] }),
    v3Set('swsh12pt5', { releaseDate: '2023/01/20', aliases: ['TCGDEX-swsh12.5', 'swsh12pt5gg'] }),
    // Set, das Alias eines anderen Sets ist -> darf in der Overview nicht erscheinen
    v3Set('swsh12pt5gg', { releaseDate: '2023/01/20' }),
    v3Set('TCGDEX-miscp', { ids: { pokemontcg: null, tcgdex: 'miscp' }, releaseDate: '2030/01/01' }),
    v3Set('base1', { releaseDate: '1999/01/09' })
  ],
  [`${REG}sets.json`]: {
    me5: { aliases: ['TCGDEX-me05'], mergedSubsets: [], pokemontcg: 'me5', tcgdex: 'me05' },
    swsh12pt5: { aliases: ['TCGDEX-swsh12.5', 'swsh12pt5gg'], mergedSubsets: ['swsh12pt5gg'], pokemontcg: 'swsh12pt5', tcgdex: 'swsh12.5' },
    'TCGDEX-miscp': { aliases: [], mergedSubsets: [], tcgdex: 'miscp' },
    base1: { aliases: [], mergedSubsets: [], pokemontcg: 'base1' }
  },
  [`${V3}cards/me5.json`]: [
    v3Card('me5', '10', '10', { variants: [{ type: 'normal', cardmarketId: 895789 }] }),
    v3Card('me5', '2', '2', { ids: { pokemontcg: 'me5-2', tcgdex: 'me05-002', cardmarket: [777001] } }),
    // gleiche Nummer -> Gleichstand wird ueber collectionKey aufgeloest
    v3Card('me5', '2b', '2'),
    v3Card('me5', '1', '1')
  ]
};

let requested = [];
let failMode = null; // null | 'network' | 404

function installStubs() {
  globalThis.location = { href: APP, origin: 'https://x.test' };
  globalThis.fetch = async (url) => {
    const u = String(url);
    requested.push(u);
    if (failMode === 'network') throw new TypeError('fetch failed');
    if (failMode === 404 || !(u in FIXTURES)) {
      return { ok: false, status: 404, json: async () => ({}) };
    }
    return { ok: true, status: 200, json: async () => structuredClone(FIXTURES[u]) };
  };
}

function reset() {
  installStubs();
  resetV3Caches();
  requested = [];
  failMode = null;
}

test('fetchMergedCardsWithSetMeta: Alias-Set-ID TCGDEX-me05 laedt kanonisches me5', async () => {
  reset();
  const { cards, setMetaPatch } = await fetchMergedCardsWithSetMeta('TCGDEX-me05');
  assert.ok(requested.includes(`${V3}cards/me5.json`), 'cards/me5.json geladen');
  assert.ok(!requested.some((u) => u.includes('TCGDEX-me05')), 'kein Request auf die Alias-ID');
  assert.equal(cards.length, 4);
  assert.equal(setMetaPatch.setId, 'me5');
  assert.equal(setMetaPatch.setName, 'Name me5');
  assert.equal(setMetaPatch.tcgdex_id, 'me05');
});

test('fetchMergedCardsWithSetMeta: jede Karte traegt collectionKey, cardId, number, i18n_de', async () => {
  reset();
  const { cards } = await fetchMergedCardsWithSetMeta('me5');
  for (const card of cards) {
    assert.ok(card.collectionKey, `collectionKey fuer ${card.cardId}`);
    assert.ok(card.cardId.startsWith('me5-'));
    assert.ok(card.number);
    assert.ok(card.i18n_de);
  }
  const ten = cards.find((c) => c.collectionKey === '10');
  assert.equal(ten.cardId, 'me5-10');
  assert.equal(ten.cardmarketUrl, 'https://www.cardmarket.com/de/Pokemon/Products?idProduct=895789');
  const two = cards.find((c) => c.collectionKey === '2');
  assert.equal(two.cardmarketUrl, 'https://www.cardmarket.com/de/Pokemon/Products?idProduct=777001', 'Fallback auf ids.cardmarket');
});

test('fetchMergedCardsWithSetMeta: Sortierung naturalSort nach number, Gleichstand nach collectionKey', async () => {
  reset();
  const { cards } = await fetchMergedCardsWithSetMeta('me5');
  assert.deepEqual(cards.map((c) => c.collectionKey), ['1', '2', '2b', '10']);
});

test('fetchMergedCards liefert die Karten aus fetchMergedCardsWithSetMeta', async () => {
  reset();
  const cards = await fetchMergedCards('me5');
  assert.deepEqual(cards.map((c) => c.collectionKey), ['1', '2', '2b', '10']);
});

test('nur api/v3 und api/registry werden angefragt (keine Laufzeit-APIs, kein Cardmarket-Matching)', async () => {
  reset();
  await fetchMergedCardsWithSetMeta('me5');
  await fetchAllAvailableSets();
  assert.ok(requested.length > 0);
  for (const url of requested) {
    assert.ok(url.startsWith(V3) || url.startsWith(REG), `unerwarteter Request ${url}`);
  }
});

test('fetchAllAvailableSets: Alias-Sets fehlen, TCGdex-only zuletzt, sonst Datum absteigend', async () => {
  reset();
  const sets = await fetchAllAvailableSets();
  const ids = sets.map((s) => s.setId);
  assert.ok(!ids.includes('swsh12pt5gg'), 'Alias-Set darf nicht erscheinen');
  assert.deepEqual(ids, ['me5', 'swsh12pt5', 'base1', 'TCGDEX-miscp']);
  const me5 = sets[0];
  assert.equal(me5.setName, 'Name me5');
  assert.deepEqual(me5.aliases, ['TCGDEX-me05']);
  assert.equal(me5.totalCards, 3);
});

test('Fehlerfall 404: klare Meldung "Kartendaten (api/v3) nicht erreichbar"', async () => {
  reset();
  failMode = 404;
  await assert.rejects(() => fetchMergedCardsWithSetMeta('me5'), (err) => {
    assert.equal(err.message, 'Kartendaten (api/v3) nicht erreichbar');
    assert.equal(err.message, V3_UNREACHABLE_MESSAGE);
    assert.equal(err.code, 'V3_UNREACHABLE');
    assert.match(String(err.cause?.message), /404/);
    return true;
  });
  await assert.rejects(() => fetchAllAvailableSets(), { message: V3_UNREACHABLE_MESSAGE });
});

test('Fehlerfall offline (fetch wirft): gleiche Meldung', async () => {
  reset();
  failMode = 'network';
  await assert.rejects(() => fetchMergedCardsWithSetMeta('me5'), { message: V3_UNREACHABLE_MESSAGE, code: 'V3_UNREACHABLE' });
});

test('Fehlerfall Kartendatei fehlt (404 nur fuer cards/<set>.json): gleiche Meldung', async () => {
  reset();
  await assert.rejects(() => fetchMergedCardsWithSetMeta('base1'), { message: V3_UNREACHABLE_MESSAGE });
});

test('unbekannte Set-ID: eigener Fehler, kein Request auf cards/', async () => {
  reset();
  await assert.rejects(() => fetchMergedCardsWithSetMeta('does-not-exist'), (err) => {
    assert.equal(err.code, 'V3_SET_UNKNOWN');
    assert.match(err.message, /does-not-exist/);
    return true;
  });
  assert.ok(!requested.some((u) => u.includes('/cards/')));
});

test('Abort wird als AbortError durchgereicht, nicht als v3-Fehler', async () => {
  reset();
  const ctrl = new AbortController();
  ctrl.abort();
  await assert.rejects(() => fetchMergedCardsWithSetMeta('me5', { signal: ctrl.signal }), { name: 'AbortError' });
});

test('Aufrufer-Fallback: .catch(() => ({ cards: [] })) bleibt nutzbar (db_cards-Pfad)', async () => {
  reset();
  failMode = 'network';
  const payload = await fetchMergedCardsWithSetMeta('me5').catch(() => ({ cards: [], setMetaPatch: null }));
  assert.deepEqual(payload, { cards: [], setMetaPatch: null });
});

// ── grep-Test: keine Laufzeit-APIs mehr im Frontend-Code ───────────────────────
function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

test('grep: keine api.pokemontcg.io / api.tcgdex.net in js/**', () => {
  const jsDir = fileURLToPath(new URL('../js/', import.meta.url));
  const hits = walk(jsDir)
    .filter((f) => /\.(m?js)$/.test(f))
    .filter((f) => /api\.pokemontcg\.io|api\.tcgdex\.net/.test(readFileSync(f, 'utf8')));
  assert.deepEqual(hits, []);
});
