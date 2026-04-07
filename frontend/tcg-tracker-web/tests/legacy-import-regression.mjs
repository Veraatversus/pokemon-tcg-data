import assert from 'node:assert/strict';
import {
  parseLegacyWorkbook,
  buildLegacyImportPlan
} from '../js/features/collection/legacy-import.js';

function createWorkbookFixture() {
  return {
    SheetNames: ['Sets Overview', 'Scarlet & Violet'],
    Sheets: {
      'Sets Overview': {
        A1: { v: 'ignore me' }
      },
      'Scarlet & Violet': {
        A1: { v: 'Scarlet & Violet', c: [{ t: 'Set ID: sv1' }] },
        A3: { v: '001' },
        A5: { v: true },
        B5: { v: false },
        D3: { v: '002' },
        D5: { v: true },
        E5: { v: true },
        G3: { v: '003' },
        G5: { v: false },
        H5: { v: false }
      }
    }
  };
}

function createWorkbookFixtureWithoutComment() {
  return {
    SheetNames: ['Scarlet & Violet'],
    Sheets: {
      'Scarlet & Violet': {
        A1: { v: 'Scarlet & Violet (Set-ID: sv1)' },
        A3: { v: '001' },
        A5: { v: true },
        B5: { v: false }
      }
    }
  };
}

function testParsesLegacyGridFromWorkbook() {
  const parsed = parseLegacyWorkbook(createWorkbookFixture());

  assert.equal(parsed.sheets.length, 1, 'Only real set sheets should be parsed.');
  assert.equal(parsed.sheets[0].sourceSetIdRaw, 'sv1');
  assert.equal(parsed.sheets[0].sheetName, 'Scarlet & Violet');
  assert.deepEqual(
    parsed.sheets[0].cards,
    [
      { sourceCardId: '001', normalizedCardId: '1', g: true, rh: false },
      { sourceCardId: '002', normalizedCardId: '2', g: true, rh: true }
    ],
    'Only checked legacy cards should be carried forward for migration.'
  );
}

function testBuildsStrictImportPlanForKnownSet() {
  const parsed = parseLegacyWorkbook(createWorkbookFixture());
  const plan = buildLegacyImportPlan({
    parsedWorkbook: parsed,
    allSets: [
      { setId: 'sv1', setName: 'Scarlet & Violet', imported: false }
    ],
    cardsBySetId: {
      sv1: [
        { number: '001', name: 'Koraidon' },
        { number: '002', name: 'Miraidon' }
      ]
    }
  });

  assert.equal(plan.ok, true, 'A fully resolvable workbook should produce an importable plan.');
  assert.deepEqual(plan.missingSetIds, ['sv1']);
  assert.equal(plan.matchedSets.length, 1);
  assert.deepEqual(
    plan.matchedSets[0].cards.map((entry) => ({ cardId: entry.cardId, g: entry.g, rh: entry.rh })),
    [
      { cardId: '001', g: true, rh: false },
      { cardId: '002', g: true, rh: true }
    ]
  );
}

function testExtractsSetIdFromHeaderTextFallback() {
  const parsed = parseLegacyWorkbook(createWorkbookFixtureWithoutComment());

  assert.equal(parsed.sheets.length, 1, 'Comment-free sheets should still be parsed.');
  assert.equal(parsed.sheets[0].sourceSetIdRaw, 'sv1', 'The parser must recover the canonical set ID from the A1 header text fallback.');
  assert.equal(parsed.sheets[0].sourceSetName, 'Scarlet & Violet', 'The visible set name should be cleaned up for exact fallback matching.');
}

function testStopsOnUnknownCardMappings() {
  const workbook = createWorkbookFixture();
  workbook.Sheets['Scarlet & Violet'].J3 = { v: '999' };
  workbook.Sheets['Scarlet & Violet'].J5 = { v: true };
  workbook.Sheets['Scarlet & Violet'].K5 = { v: false };

  const parsed = parseLegacyWorkbook(workbook);
  const plan = buildLegacyImportPlan({
    parsedWorkbook: parsed,
    allSets: [
      { setId: 'sv1', setName: 'Scarlet & Violet', imported: true }
    ],
    cardsBySetId: {
      sv1: [
        { number: '001', name: 'Koraidon' },
        { number: '002', name: 'Miraidon' }
      ]
    }
  });

  assert.equal(plan.ok, false, 'Unknown card IDs must block the entire import.');
  assert.equal(plan.unresolvedCards.length, 1);
  assert.equal(plan.unresolvedCards[0].sourceCardId, '999');
}

try {
  testParsesLegacyGridFromWorkbook();
  testBuildsStrictImportPlanForKnownSet();
  testExtractsSetIdFromHeaderTextFallback();
  testStopsOnUnknownCardMappings();
  console.log('legacy-import-regression: ok');
} catch (error) {
  console.error('legacy-import-regression: failed');
  console.error(error);
  process.exit(1);
}
