import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cardSampleCandidates, withSampledCardImages } from '../merge/images.mjs';
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

test('withSampledCardImages: Stichprobe ok -> alle Karten des Sets im Index; sonst unveraendert', () => {
  const index = { en: { me: { me05: { '001': {} } } } };
  const sets = [set('me06', 'me', ['001', '002', '141']), set('30th', 'me', ['001', '161'])];
  const verified = {
    [`${B}/de/me/me06/001/low.webp`]: ok,
    [`${B}/de/me/me06/141/low.webp`]: ok,
    [`${B}/en/me/me06/001/low.webp`]: ok,
    [`${B}/en/me/me06/141/low.webp`]: missing, // nur eine von zwei -> nicht uebernehmen
    [`${B}/de/me/30th/001/low.webp`]: ok, // 161 unbekannt -> nicht uebernehmen
  };
  const out = withSampledCardImages(index, sets, verified);
  assert.deepEqual(Object.keys(out.de.me.me06).sort(), ['001', '002', '141']);
  assert.equal(out.en.me.me06, undefined);
  assert.equal(out.de.me['30th'], undefined);
  assert.deepEqual(out.en.me.me05, { '001': {} });
  assert.equal(index.de, undefined, 'Eingabe-Index bleibt unveraendert');
  const card = { localId: '002', set: { id: 'me06', serieId: 'me' } };
  assert.deepEqual(cardImages(out, 'de', card), { small: `${B}/de/me/me06/002/low.webp`, large: `${B}/de/me/me06/002/high.webp` });
});

test('withSampledCardImages: Set schon im Index -> keine Stichprobe, Index gewinnt', () => {
  const index = { de: { me: { me06: { '001': {} } } } };
  const sets = [set('me06', 'me', ['001', '002'])];
  const out = withSampledCardImages(index, sets, { [`${B}/de/me/me06/002/low.webp`]: ok });
  assert.deepEqual(Object.keys(out.de.me.me06), ['001']);
});

test('Sonderkarten mit Buchstaben (30th: B/G/R): Stichprobe und Uebernahme nur numerisch', () => {
  const sets = [set('30th', 'me', ['001', '158', 'B', 'G', 'R'])];
  const [c] = cardSampleCandidates({}, sets, ['de']);
  assert.deepEqual(c.urls, [`${B}/de/me/30th/001/low.webp`, `${B}/de/me/30th/158/low.webp`]);
  const out = withSampledCardImages({}, sets, { [c.urls[0]]: ok, [c.urls[1]]: ok }, ['de']);
  assert.deepEqual(Object.keys(out.de.me['30th']).sort(), ['001', '158']);
  // Nur Buchstaben-IDs: dann diese
  const [only] = cardSampleCandidates({}, [set('x', 'y', ['A', 'C'])], ['de']);
  assert.deepEqual(only.urls, [`${B}/de/y/x/A/low.webp`, `${B}/de/y/x/C/low.webp`]);
});
