import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cardSampleCandidates, cardImageCandidates, withSampledCardImages, scrydexCandidates, applyScrydexImages, scrydexImages } from '../merge/images.mjs';
import { scrydexStatus, scrydexPlaceholderEtag } from '../sources/verify-assets.mjs';
import { cardImages } from '../merge/merge-card.mjs';

const B = 'https://assets.tcgdex.net';
const set = (id, serieId, ids) => ({ id, serieId, cards: ids.map((localId) => ({ localId })) });
const ok = { status: 'ok', checkedAt: 'x' };
const missing = { status: 'missing', checkedAt: 'x' };

test('cardSampleCandidates: nur Sets/Sprachen ohne Index-Eintrag, erste und letzte Karte', () => {
  const index = { en: { me: { me05: { '001': {} } } }, de: { me: { me05: { '001': {} } } } };
  const sets = [set('me05', 'me', ['001']), set('me06', 'me', ['010', '002', '141']), set('empty', 'me', [])];
  assert.deepEqual(cardSampleCandidates(index, sets), [
    { lang: 'en', serieId: 'me', setId: 'me06', urls: [`${B}/en/me/me06/002/low.webp`, `${B}/en/me/me06/141/low.webp`] },
    { lang: 'de', serieId: 'me', setId: 'me06', urls: [`${B}/de/me/me06/002/low.webp`, `${B}/de/me/me06/141/low.webp`] },
  ]);
});

test('cardSampleCandidates: ein Kartenset mit einer Karte prueft eine URL; localId wird kodiert', () => {
  const sets = [set('miscp', 'misc', ['?'])];
  assert.deepEqual(cardSampleCandidates({}, sets, ['de']), [
    { lang: 'de', serieId: 'misc', setId: 'miscp', urls: [`${B}/de/misc/miscp/%3F/low.webp`] },
  ]);
});

test('cardImageCandidates: nur Sets mit mindestens einer bestandenen Stichprobe, dann jede Karte', () => {
  const sets = [set('me06', 'me', ['001', '002', 'B', '141']), set('none', 'me', ['001', '009'])];
  const verified = {
    [`${B}/de/me/me06/001/low.webp`]: missing,
    [`${B}/de/me/me06/141/low.webp`]: ok, // eine von zwei reicht
    [`${B}/de/me/none/001/low.webp`]: missing,
    [`${B}/de/me/none/009/low.webp`]: missing,
  };
  const [c, ...rest] = cardImageCandidates({}, sets, verified, ['de']);
  assert.equal(rest.length, 0);
  assert.deepEqual(c.ids, ['001', '002', '141', 'B']);
  assert.deepEqual(c.urls, ['001', '002', '141', 'B'].map((id) => `${B}/de/me/me06/${id}/low.webp`));
});

test('withSampledCardImages: nur Karten mit eigenem ok kommen in den Index', () => {
  const index = { en: { me: { me05: { '001': {} } } } };
  const sets = [set('me06', 'me', ['001', '002', '141']), set('30th', 'me', ['001', '161'])];
  const verified = {
    [`${B}/de/me/me06/001/low.webp`]: ok,
    [`${B}/de/me/me06/141/low.webp`]: ok,
    [`${B}/de/me/me06/002/low.webp`]: missing,
    [`${B}/en/me/me06/001/low.webp`]: missing,
    [`${B}/en/me/me06/141/low.webp`]: missing, // Stichprobe ganz fehlend -> nichts
  };
  const out = withSampledCardImages(index, sets, verified);
  assert.deepEqual(Object.keys(out.de.me.me06).sort(), ['001', '141']);
  assert.equal(out.en.me.me06, undefined);
  assert.equal(out.de.me['30th'], undefined, 'nichts geprueft -> nichts uebernommen');
  assert.deepEqual(out.en.me.me05, { '001': {} });
  assert.equal(index.de, undefined, 'Eingabe-Index bleibt unveraendert');
  const card = { localId: '141', set: { id: 'me06', serieId: 'me' } };
  assert.deepEqual(cardImages(out, 'de', card), { small: `${B}/de/me/me06/141/low.webp`, large: `${B}/de/me/me06/141/high.webp` });
  assert.equal(cardImages(out, 'de', { localId: '002', set: { id: 'me06', serieId: 'me' } }), null);
});

test('withSampledCardImages: Set schon im Index -> keine Pruefung, Index gewinnt', () => {
  const index = { de: { me: { me06: { '001': {} } } } };
  const sets = [set('me06', 'me', ['001', '002'])];
  const out = withSampledCardImages(index, sets, { [`${B}/de/me/me06/002/low.webp`]: ok });
  assert.deepEqual(Object.keys(out.de.me.me06), ['001']);
});

test('Sonderkarten mit Buchstaben (30th: B/G/R): Stichprobe numerisch, Uebernahme je eigener Pruefung', () => {
  const sets = [set('30th', 'me', ['001', '158', 'B', 'G', 'R'])];
  const [c] = cardSampleCandidates({}, sets, ['de']);
  assert.deepEqual(c.urls, [`${B}/de/me/30th/001/low.webp`, `${B}/de/me/30th/158/low.webp`]);
  const verified = { [c.urls[0]]: ok, [c.urls[1]]: ok, [`${B}/de/me/30th/B/low.webp`]: ok, [`${B}/de/me/30th/G/low.webp`]: missing };
  const out = withSampledCardImages({}, sets, verified, ['de']);
  assert.deepEqual(Object.keys(out.de.me['30th']).sort(), ['001', '158', 'B']);
  // Nur Buchstaben-IDs: dann diese
  const [only] = cardSampleCandidates({}, [set('x', 'y', ['A', 'C'])], ['de']);
  assert.deepEqual(only.urls, [`${B}/de/y/x/A/low.webp`, `${B}/de/y/x/C/low.webp`]);
});

const SX = 'https://images.scrydex.com/pokemon';
const v3 = (id, extra = {}) => ({ id, ...extra });

test('scrydexCandidates: Karten ohne jedes Bild oder mit Scrydex-Bild, keine TCGDEX-Sets', () => {
  const cards = [
    v3('mep-34'),
    v3('mep-1', { images: { small: 'https://assets.tcgdex.net/en/me/mep/001/low.webp' } }),
    v3('mep-2', { i18n: { de: { images: { small: 'https://assets.tcgdex.net/de/me/mep/002/low.webp' } } } }),
    v3('mep-3', { images: { small: `${SX}/mep-3/small`, large: `${SX}/mep-3/large` } }),
    v3('TCGDEX-2019sm-fr-1'),
    v3('mep-34'),
  ];
  assert.deepEqual(scrydexCandidates(cards), [`${SX}/mep-34/small`, `${SX}/mep-3/small`]);
});

test('applyScrydexImages: nur verifiziertes ok, nur ohne jedes Bild', () => {
  const cards = [
    v3('mep-34'),
    v3('mep-35'),
    v3('mep-2', { i18n: { de: { images: { small: 'x' } } } }),
    v3('TCGDEX-a-1'),
  ];
  const verified = { [`${SX}/mep-34/small`]: ok, [`${SX}/mep-35/small`]: missing, [`${SX}/mep-2/small`]: ok, [`${SX}/TCGDEX-a-1/small`]: ok };
  assert.equal(applyScrydexImages(cards, verified), 1);
  assert.deepEqual(cards[0].images, { small: `${SX}/mep-34/small`, large: `${SX}/mep-34/large` });
  assert.equal(cards[1].images, undefined);
  assert.equal(cards[2].images, undefined);
  assert.equal(cards[3].images, undefined);
  assert.deepEqual(scrydexImages('a b-1'), { small: `${SX}/a%20b-1/small`, large: `${SX}/a%20b-1/large` });
});

test('scrydexStatus: Platzhalter (Kartenrueckseite) gilt als fehlend; ohne Platzhalter-ETag nichts', () => {
  assert.equal(scrydexStatus({ status: 200, etag: '"real"' }, '"ph"'), 200);
  assert.equal(scrydexStatus({ status: 200, etag: '"ph"' }, '"ph"'), 404);
  assert.equal(scrydexStatus({ status: 200, etag: null }, '"ph"'), 404);
  assert.equal(scrydexStatus({ status: 503, etag: null }, '"ph"'), 503);
  assert.equal(scrydexStatus({ status: 200, etag: '"real"' }, null), null);
  assert.equal(scrydexStatus(null, '"ph"'), null);
});

test('scrydexPlaceholderEtag: ETag der Rueckseite, sonst null', async () => {
  assert.equal(await scrydexPlaceholderEtag({ head: async () => ({ status: 200, etag: '"ph"' }) }), '"ph"');
  assert.equal(await scrydexPlaceholderEtag({ head: async () => null }), null);
  assert.equal(await scrydexPlaceholderEtag({ head: async () => ({ status: 500, etag: '"x"' }) }), null);
});
