import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildPriceFiles, writePriceFiles } from '../merge/cardmarket-prices.mjs';
import { primaryCardmarketId } from '../merge/cardmarket-ids.mjs';

const NOW = new Date('2026-11-13T05:00:00.000Z');
const card = (setId, cardId, id, variants) => ({ id: `${setId}-${cardId}`, setId, cardId, ids: { cardmarket: id === undefined ? [] : [id] }, ...(variants ? { variants } : {}) });
const guide = (...rows) => ({ version: 1, createdAt: '2026-11-13T02:44:11+0100', priceGuides: rows });
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'cm-prices-'));
const readJson = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));

test('writes only priced cards', () => {
  const cardsBySet = new Map([
    ['s1', [card('s1', '1', 10), card('s1', '2', 11), card('s1', '3'), card('s1', '4', 13)]],
    ['s2', [card('s2', '1', 99)]],
  ]);
  const { files, meta } = buildPriceFiles({
    cardsBySet, primaryCardmarketId, now: () => NOW,
    priceGuide: guide(
      { idProduct: 10, idCategory: 51, avg: 5, low: 1, trend: 2.5, avg1: null, avg7: 2, avg30: 3 },
      { idProduct: 13, avg: null, low: null, trend: null }, // nichts Numerisches -> kein Eintrag
      { idProduct: 3, trend: 7 }, // Karte ohne ID, Produkt gehoert niemandem
    ),
  });
  assert.deepEqual([...files.keys()], ['s1']);
  assert.deepEqual(files.get('s1'), { 1: { productId: 10, trend: 2.5, avg7: 2, avg30: 3, low: 1 } });
  assert.deepEqual(meta, { generatedAt: NOW.toISOString(), priceGuideCreatedAt: '2026-11-13T02:44:11+0100', cardsWithId: 4, cardsWithPrice: 1 });
});

test('uses the primary id of the card', () => {
  const c = card('s1', '1', 20, [{ type: 'normal', stamp: ['x'], cardmarketId: 21 }, { type: 'normal', cardmarketId: 20 }]);
  const { files } = buildPriceFiles({ cardsBySet: new Map([['s1', [c]]]), primaryCardmarketId, now: () => NOW, priceGuide: guide({ idProduct: 20, trend: 1 }, { idProduct: 21, trend: 9 }) });
  assert.equal(files.get('s1')['1'].productId, 20);
});

test('holo fields mapped', () => {
  const row = {
    idProduct: 10, avg: 1, low: 2, trend: 3, avg1: 4, avg7: 5, avg30: 6,
    'avg-holo': 11, 'low-holo': 12, 'trend-holo': 13, 'avg1-holo': 14, 'avg7-holo': 15, 'avg30-holo': 16,
  };
  const { files } = buildPriceFiles({ cardsBySet: new Map([['s1', [card('s1', '1', 10)]]]), primaryCardmarketId, now: () => NOW, priceGuide: guide(row) });
  assert.deepEqual(files.get('s1')['1'], {
    productId: 10, trend: 3, avg1: 4, avg7: 5, avg30: 6, low: 2, trendHolo: 13, avg1Holo: 14, avg7Holo: 15, avg30Holo: 16, lowHolo: 12,
  });
  // 0 ist ein gueltiger Wert, Nicht-Zahlen fallen weg
  const z = buildPriceFiles({ cardsBySet: new Map([['s1', [card('s1', '1', 10)]]]), primaryCardmarketId, now: () => NOW, priceGuide: guide({ idProduct: 10, trend: 0, low: '3', avg1: Number.NaN }) });
  assert.deepEqual(z.files.get('s1')['1'], { productId: 10, trend: 0 });
});

test('untouched when no price guide', () => {
  const out = tmp();
  const dir = path.join(out, 'prices');
  fs.mkdirSync(dir);
  fs.writeFileSync(path.join(dir, 's1.json'), 'old-s1');
  fs.writeFileSync(path.join(dir, 'gone.json'), 'old-gone');
  fs.writeFileSync(path.join(dir, 'meta.json'), 'old-meta');
  const cardsBySet = new Map([['s1', [card('s1', '1', 10)]]]);
  const r = writePriceFiles({ outDir: out, cardsBySet, priceGuide: null, primaryCardmarketId });
  assert.equal(r, null);
  assert.equal(fs.readFileSync(path.join(dir, 's1.json'), 'utf8'), 'old-s1');
  assert.equal(fs.readFileSync(path.join(dir, 'gone.json'), 'utf8'), 'old-gone');
  assert.equal(fs.readFileSync(path.join(dir, 'meta.json'), 'utf8'), 'old-meta');
  // ohne vorhandenes Verzeichnis wird auch keines angelegt
  const fresh = tmp();
  assert.equal(writePriceFiles({ outDir: fresh, cardsBySet, priceGuide: null, primaryCardmarketId }), null);
  assert.equal(fs.existsSync(path.join(fresh, 'prices')), false);
});

test('writes files and meta, removes stale price files', () => {
  const out = tmp();
  const dir = path.join(out, 'prices');
  fs.mkdirSync(dir);
  fs.writeFileSync(path.join(dir, 'gone.json'), '{}');
  const cardsBySet = new Map([['s1', [card('s1', '1', 10)]], ['s2', [card('s2', '1', 11)]]]);
  writePriceFiles({ outDir: out, cardsBySet, priceGuide: guide({ idProduct: 10, trend: 2 }), primaryCardmarketId, now: () => NOW });
  assert.deepEqual(fs.readdirSync(dir).sort(), ['meta.json', 's1.json']);
  assert.deepEqual(readJson(path.join(dir, 's1.json')), { 1: { productId: 10, trend: 2 } });
  assert.deepEqual(readJson(path.join(dir, 'meta.json')), { generatedAt: NOW.toISOString(), priceGuideCreatedAt: '2026-11-13T02:44:11+0100', cardsWithId: 2, cardsWithPrice: 1 });
});

test('generatedAt changes when any price changes, stays when nothing does', () => {
  const out = tmp();
  const cardsBySet = new Map([['s1', [card('s1', '1', 10)]]]);
  const metaOf = () => readJson(path.join(out, 'prices', 'meta.json'));
  writePriceFiles({ outDir: out, cardsBySet, priceGuide: guide({ idProduct: 10, trend: 2 }), primaryCardmarketId, now: () => new Date('2026-11-13T05:00:00Z') });
  writePriceFiles({ outDir: out, cardsBySet, priceGuide: guide({ idProduct: 10, trend: 2 }), primaryCardmarketId, now: () => new Date('2026-11-14T05:00:00Z') });
  assert.equal(metaOf().generatedAt, '2026-11-13T05:00:00.000Z');
  writePriceFiles({ outDir: out, cardsBySet, priceGuide: guide({ idProduct: 10, trend: 3 }), primaryCardmarketId, now: () => new Date('2026-11-15T05:00:00Z') });
  assert.equal(metaOf().generatedAt, '2026-11-15T05:00:00.000Z');
  assert.equal(metaOf().cardsWithPrice, 1);
});

test('empty price guide is treated like none', () => {
  const out = tmp();
  const dir = path.join(out, 'prices');
  fs.mkdirSync(dir);
  fs.writeFileSync(path.join(dir, 's1.json'), 'old');
  fs.writeFileSync(path.join(dir, 'meta.json'), 'old-meta');
  const cardsBySet = new Map([['s1', [card('s1', '1', 10)]]]);
  for (const g of [{ version: 1, createdAt: 'x', priceGuides: [] }, {}, [], 'junk']) {
    assert.equal(writePriceFiles({ outDir: out, cardsBySet, priceGuide: g, primaryCardmarketId }), null);
  }
  assert.equal(fs.readFileSync(path.join(dir, 's1.json'), 'utf8'), 'old');
  assert.equal(fs.readFileSync(path.join(dir, 'meta.json'), 'utf8'), 'old-meta');
});

test('published price files stay below 8 MB', { skip: !fs.existsSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'api', 'v3', 'prices')) }, () => {
  const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'api', 'v3', 'prices');
  const total = fs.readdirSync(dir).reduce((n, f) => n + fs.statSync(path.join(dir, f)).size, 0);
  assert.ok(total < 8 * 1024 * 1024, `prices ${total} Bytes`);
});
