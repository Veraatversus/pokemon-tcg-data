import test from 'node:test';
import assert from 'node:assert/strict';

import { applyTcgdexOrderingToArtifacts } from './lib/tcgdex-ordering-helpers.mjs';

test('applyTcgdexOrderingToArtifacts orders matched cards first and appends unmatched cards', () => {
  const artifacts = {
    sets: {
      '1523': {
        expansionId: 1523,
        cards: [
          { cardmarketProductId: 500, name: 'Unmatched Card', collectorNumber: '200' },
          { cardmarketProductId: 102, name: 'Beta [Ability]', collectorNumber: '2' },
          { cardmarketProductId: 101, name: 'Alpha', collectorNumber: '1' },
          { cardmarketProductId: 501, name: 'Second Unmatched', collectorNumber: '201' },
        ],
      },
    },
  };

  const helperSetsByExpansionId = {
    '1523': {
      cards: [
        { number: '1', name: { en: 'Alpha', de: null }, cardmarketId: 101, tcgplayerId: null },
        { number: '2', name: { en: 'Beta', de: null }, cardmarketId: 102, tcgplayerId: null },
      ],
    },
  };

  const summary = applyTcgdexOrderingToArtifacts({
    artifacts,
    helperSetsByExpansionId,
  });

  assert.equal(summary.orderedSetCount, 1);
  assert.equal(summary.totalMatchedCards, 2);
  assert.equal(summary.totalUnmatchedCards, 2);
  assert.equal(summary.setMetrics.length, 1);
  assert.deepEqual(summary.setMetrics[0], {
    expansionId: '1523',
    originalCardCount: 4,
    matchedCardCount: 2,
    unmatchedCardCount: 2,
  });
  assert.deepEqual(
    artifacts.sets['1523'].cards.map((card) => card.cardmarketProductId),
    [101, 102, 500, 501]
  );
});

test('applyTcgdexOrderingToArtifacts keeps unmatched-only sets unchanged', () => {
  const artifacts = {
    sets: {
      '9999': {
        expansionId: 9999,
        cards: [
          { cardmarketProductId: 7, name: 'Only Card', collectorNumber: null },
        ],
      },
    },
  };

  const helperSetsByExpansionId = {};

  const summary = applyTcgdexOrderingToArtifacts({
    artifacts,
    helperSetsByExpansionId,
  });

  assert.equal(summary.orderedSetCount, 0);
  assert.equal(summary.totalMatchedCards, 0);
  assert.equal(summary.totalUnmatchedCards, 0);
  assert.equal(summary.setMetrics.length, 0);
  assert.deepEqual(
    artifacts.sets['9999'].cards.map((card) => card.cardmarketProductId),
    [7]
  );
});
