import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { applyCustomSetScripts } from './apply-custom-set-scripts.mjs';

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

