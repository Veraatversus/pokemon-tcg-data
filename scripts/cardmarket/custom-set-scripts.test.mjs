import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { applyCustomSetScripts } from './apply-custom-set-scripts.mjs';
import { transformSet as transformExpedition1536 } from './custom-sets/1536.mjs';
import { transformSet as transformAquapolis1537 } from './custom-sets/1537.mjs';
import { transformSet as transformSkyridge1538 } from './custom-sets/1538.mjs';

function createLogger() {
  const entries = [];
  return {
    entries,
    info: (...parts) => entries.push({ level: 'info', message: parts.join(' ') }),
    warn: (...parts) => entries.push({ level: 'warn', message: parts.join(' ') }),
  };
}

test('applyCustomSetScripts replaces original set artifact when script succeeds', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cardmarket-custom-scripts-'));
  const logger = createLogger();

  try {
    await fs.writeFile(
      path.join(tempDir, '1538.mjs'),
      "export function transformSet(payload) { return { ...payload, cards: [...payload.cards].reverse() }; }\n",
      'utf8'
    );

    const originalSet = {
      expansionId: 1538,
      cards: [
        { cardmarketProductId: 1 },
        { cardmarketProductId: 2 },
      ],
    };

    const artifacts = {
      sets: {
        '1538': originalSet,
        '1605': { expansionId: 1605, cards: [{ cardmarketProductId: 9 }] },
      },
    };

    await applyCustomSetScripts(artifacts, { scriptsDir: tempDir, logger });

    assert.deepEqual(
      artifacts.sets['1538'].cards.map((card) => card.cardmarketProductId),
      [2, 1]
    );
    assert.notEqual(artifacts.sets['1538'], originalSet);
    assert.deepEqual(
      artifacts.sets['1605'].cards.map((card) => card.cardmarketProductId),
      [9]
    );
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test('applyCustomSetScripts keeps original artifact when custom script throws', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cardmarket-custom-scripts-'));
  const logger = createLogger();

  try {
    await fs.writeFile(
      path.join(tempDir, '1538.mjs'),
      "export function transformSet() { throw new Error('boom'); }\n",
      'utf8'
    );

    const originalSet = {
      expansionId: 1538,
      cards: [{ cardmarketProductId: 1 }],
    };

    const artifacts = {
      sets: {
        '1538': originalSet,
      },
    };

    await applyCustomSetScripts(artifacts, { scriptsDir: tempDir, logger });

    assert.equal(artifacts.sets['1538'], originalSet);
    assert.equal(logger.entries.some((entry) => entry.level === 'warn'), true);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test('applyCustomSetScripts keeps original artifact when script export is invalid', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cardmarket-custom-scripts-'));
  const logger = createLogger();

  try {
    await fs.writeFile(
      path.join(tempDir, '1538.mjs'),
      "export const nope = true;\n",
      'utf8'
    );

    const originalSet = {
      expansionId: 1538,
      cards: [{ cardmarketProductId: 1 }],
    };

    const artifacts = {
      sets: {
        '1538': originalSet,
      },
    };

    await applyCustomSetScripts(artifacts, { scriptsDir: tempDir, logger });

    assert.equal(artifacts.sets['1538'], originalSet);
    assert.equal(logger.entries.some((entry) => entry.level === 'warn'), true);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test('Aquapolis 1537 custom set starts with the response order and collector numbers', async () => {
  const payload = JSON.parse(
    await fs.readFile(new URL('../../cardmarket/sets/1537.json', import.meta.url), 'utf8')
  );

  const result = transformAquapolis1537(payload, { logger: createLogger() });

  assert.deepEqual(
    result.cards.slice(0, 12).map((card) => card.cardmarketProductId),
    [275073, 275074, 275075, 275076, 275077, 275078, 275079, 275080, 275081, 275082, 362901, 275083]
  );
  assert.deepEqual(
    result.cards.slice(0, 12).map((card) => card.collectorNumber),
    ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '10V3', '11']
  );
});

test('Expedition Base Set 1536 custom set keeps the response order and collector numbers', async () => {
  const payload = JSON.parse(
    await fs.readFile(new URL('../../cardmarket/sets/1536.json', import.meta.url), 'utf8')
  );

  const result = transformExpedition1536(payload, { logger: createLogger() });

  assert.equal(result.cards.length, 169);
  assert.deepEqual(
    result.cards.slice(0, 12).map((card) => card.cardmarketProductId),
    [274876, 362878, 274877, 274878, 274879, 274880, 274881, 274882, 274883, 274884, 274885, 274886]
  );
  assert.deepEqual(
    result.cards.slice(0, 12).map((card) => card.collectorNumber),
    ['1', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11']
  );
  assert.deepEqual(
    result.cards.slice(-5).map((card) => card.cardmarketProductId),
    [275036, 275037, 275038, 275039, 275040]
  );
  assert.deepEqual(
    result.cards.slice(-5).map((card) => card.collectorNumber),
    ['161', '162', '163', '164', '165']
  );
});

test('Expedition Base Set 1536 transform ignores wrong collector numbers and restores response order', () => {
  const payload = {
    expansionId: 1536,
    cards: [
      { cardmarketProductId: 362878, collectorNumber: '999' },
      { cardmarketProductId: 275040, collectorNumber: '998' },
      { cardmarketProductId: 274876, collectorNumber: '997' },
      { cardmarketProductId: 274877, collectorNumber: '996' },
    ],
  };

  const result = transformExpedition1536(payload, { logger: createLogger() });

  assert.deepEqual(
    result.cards.map((card) => card.cardmarketProductId),
    [274876, 362878, 274877, 275040]
  );
  assert.deepEqual(
    result.cards.map((card) => card.collectorNumber),
    ['1', '1', '2', '165']
  );
});

test('Skyridge 1538 custom set keeps the response order and collector numbers', async () => {
  const payload = JSON.parse(
    await fs.readFile(new URL('../../cardmarket/sets/1538.json', import.meta.url), 'utf8')
  );

  const result = transformSkyridge1538(payload, { logger: createLogger() });

  assert.equal(result.cards.length, 186);
  // First 12 cards should be SK 1-12 (regular cards, not holo variants)
  assert.deepEqual(
    result.cards.slice(0, 12).map((card) => card.cardmarketProductId),
    [275259, 275260, 275261, 275262, 275263, 275264, 275265, 275266, 275267, 275268, 275269, 275270]
  );
  assert.deepEqual(
    result.cards.slice(0, 12).map((card) => card.collectorNumber),
    ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12']
  );
  // Holo variants (H1-H32) should be at the end, after all regular SK cards
  const hCards = result.cards.filter(c => c.collectorNumber && c.collectorNumber.startsWith('H'));
  assert.equal(hCards.length, 32);
  // Last cards should be holo variants or unmatched products
  const lastIds = result.cards.slice(-4).map((card) => card.cardmarketProductId);
  assert.ok(lastIds.every(id => [275254, 275256, 275255, 275252, 275253, 275408, 362908].includes(id)),
    'Last cards should be holo variants or unmatched products');
});

test('Skyridge 1538 transform ignores wrong collector numbers and restores response order', () => {
  const payload = {
    expansionId: 1538,
    cards: [
      { cardmarketProductId: 275238, collectorNumber: '999' },
      { cardmarketProductId: 275407, collectorNumber: '998' },
      { cardmarketProductId: 275227, collectorNumber: '997' },
      { cardmarketProductId: 275259, collectorNumber: '996' },
    ],
  };

  const result = transformSkyridge1538(payload, { logger: createLogger() });

  // SK cards come first (by SK order), then H cards.
  // H1 sits at the end of Page 1 in the source order, so it appears
  // before 149 (Page 2) — that's expected for the new layout.
  assert.deepEqual(
    result.cards.map((card) => card.cardmarketProductId),
    [275259, 275238, 275407, 275227]
  );
  assert.deepEqual(
    result.cards.map((card) => card.collectorNumber),
    ['1', 'H1', '149', 'H2']
  );
});

