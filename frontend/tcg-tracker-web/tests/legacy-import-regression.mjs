import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  parseLegacyWorkbook,
  buildLegacyImportPlan,
  buildLegacyImportSelectionTree,
  filterLegacyImportPlanBySelection,
  extractLegacySpreadsheetId,
  buildWorkbookFromGoogleSheetsSpreadsheet,
  loadLegacyWorkbookFromSpreadsheetInput,
  pickPreferredLegacyDriveXlsxFile
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

function createGoogleSheetsFixture() {
  return {
    sheets: [
      {
        properties: { title: 'Scarlet & Violet' },
        data: [
          {
            rowData: [
              {
                values: [
                  { formattedValue: 'Scarlet & Violet', note: 'Set ID: sv1' }
                ]
              },
              {},
              {
                values: [
                  { formattedValue: '001' },
                  {},
                  {},
                  { formattedValue: '002' },
                  {}
                ]
              },
              {},
              {
                values: [
                  { effectiveValue: { boolValue: true }, formattedValue: 'TRUE' },
                  { effectiveValue: { boolValue: false }, formattedValue: 'FALSE' },
                  {},
                  { effectiveValue: { boolValue: true }, formattedValue: 'TRUE' },
                  { effectiveValue: { boolValue: true }, formattedValue: 'TRUE' }
                ]
              }
            ]
          }
        ]
      }
    ]
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

function testExtractsSpreadsheetIdFromUrl() {
  const spreadsheetId = '1AbCdEfGhIjKlMnOpQrStUvWxYz1234567890';

  assert.equal(extractLegacySpreadsheetId(`https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit#gid=0`), spreadsheetId);
  assert.equal(extractLegacySpreadsheetId(spreadsheetId), spreadsheetId);
  assert.equal(extractLegacySpreadsheetId('not-a-sheet'), null);
}

function testBuildsWorkbookFromGoogleSheetsGridData() {
  const workbook = buildWorkbookFromGoogleSheetsSpreadsheet(createGoogleSheetsFixture());
  const parsed = parseLegacyWorkbook(workbook);

  assert.equal(parsed.sheets.length, 1, 'Google Sheets grid data should be convertible into the legacy workbook parser format.');
  assert.equal(parsed.sheets[0].sourceSetIdRaw, 'sv1', 'The set note from the Google Sheet should be preserved for exact set resolution.');
  assert.deepEqual(
    parsed.sheets[0].cards,
    [
      { sourceCardId: '001', normalizedCardId: '1', g: true, rh: false },
      { sourceCardId: '002', normalizedCardId: '2', g: true, rh: true }
    ]
  );
}

function testLegacySheetDialogIsRenderedOutsideCollapsedToolsPanel() {
  const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const dialogIndex = html.indexOf('<dialog id="dialog-legacy-sheet-import"');
  const detailsCloseIndex = html.indexOf('</details>');

  assert.notEqual(dialogIndex, -1, 'The direct Sheets-link dialog should exist in index.html.');
  assert.notEqual(detailsCloseIndex, -1, 'The dashboard tools disclosure markup should exist in index.html.');
  assert.ok(
    dialogIndex > detailsCloseIndex,
    'The direct Sheets-link dialog must be rendered outside the collapsed dashboard <details> block, otherwise showModal() stays visually hidden.'
  );
}

function testPrefersSiblingDriveXlsxForLegacySheetImports() {
  const preferred = pickPreferredLegacyDriveXlsxFile(
    {
      id: 'sheet-1',
      name: 'Urst noch ne Kopie von Scarlett/Violet',
      parents: ['folder-1']
    },
    [
      {
        id: 'other-sheet',
        name: 'Urst noch ne Kopie von Scarlett/Violet',
        mimeType: 'application/vnd.google-apps.spreadsheet',
        parents: ['folder-1']
      },
      {
        id: 'xlsx-1',
        name: 'Urst noch ne Kopie von Scarlett/Violet.xlsx',
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        fileExtension: 'xlsx',
        parents: ['folder-1']
      },
      {
        id: 'xlsx-2',
        name: 'Kopie von Scarlett/Violet.xlsx',
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        fileExtension: 'xlsx',
        parents: ['folder-2']
      }
    ]
  );

  assert.equal(
    preferred?.id || null,
    'xlsx-1',
    'When a same-name sibling `.xlsx` exists in Drive, the Sheets-link import should prefer that original workbook over the lossy converted Google Sheet copy.'
  );
}

function testBuildsLegacySelectionTreeWithAllCardsPreselected() {
  const plan = {
    ok: true,
    matchedSets: [
      {
        setId: 'sv1',
        setName: 'Scarlet & Violet',
        sheetName: 'Karmesin & Purpur',
        imported: false,
        cards: [
          { cardId: '001', sourceCardId: '001', g: true, rh: false },
          { cardId: '002', sourceCardId: '002', g: true, rh: true }
        ]
      }
    ]
  };
  const tree = buildLegacyImportSelectionTree(plan, {
    sv1: [
      { number: '001', name: 'Koraidon' },
      { number: '002', name: 'Miraidon' }
    ]
  });

  assert.equal(tree.sets.length, 1);
  assert.equal(tree.sets[0].selected, true);
  assert.deepEqual(
    tree.sets[0].cards.map((card) => ({ cardId: card.cardId, name: card.name, selected: card.selected })),
    [
      { cardId: '001', name: 'Koraidon', selected: true },
      { cardId: '002', name: 'Miraidon', selected: true }
    ],
    'The selection dialog should start with every matched set and card preselected.'
  );
}

function testFiltersLegacyImportPlanBySelection() {
  const plan = {
    ok: true,
    matchedSets: [
      {
        setId: 'sv1',
        setName: 'Scarlet & Violet',
        imported: false,
        cards: [
          { cardId: '001', sourceCardId: '001', g: true, rh: false },
          { cardId: '002', sourceCardId: '002', g: true, rh: true }
        ]
      },
      {
        setId: 'sv2',
        setName: 'Paldea Evolved',
        imported: true,
        cards: [
          { cardId: '010', sourceCardId: '010', g: true, rh: false }
        ]
      }
    ],
    missingSetIds: ['sv1'],
    unresolvedSheets: [],
    unresolvedCards: [],
    stats: {
      sheetCount: 2,
      checkedCardCount: 3,
      matchedCardCount: 3,
      missingSetCount: 1
    }
  };
  const tree = buildLegacyImportSelectionTree(plan, {
    sv1: [
      { number: '001', name: 'Koraidon' },
      { number: '002', name: 'Miraidon' }
    ],
    sv2: [
      { number: '010', name: 'Meowscarada' }
    ]
  });

  tree.sets[0].cards[1].selected = false;
  tree.sets[1].selected = false;
  tree.sets[1].cards[0].selected = false;

  const filtered = filterLegacyImportPlanBySelection(plan, tree);

  assert.equal(filtered.matchedSets.length, 1);
  assert.deepEqual(filtered.missingSetIds, ['sv1']);
  assert.deepEqual(filtered.matchedSets[0].cards.map((card) => card.cardId), ['001']);
  assert.equal(filtered.stats.sheetCount, 1);
  assert.equal(filtered.stats.checkedCardCount, 1);
  assert.equal(filtered.stats.matchedCardCount, 1);
}

async function testLoadsSpreadsheetAfterDiscoveryBecomesReady() {
  const spreadsheetId = '1AbCdEfGhIjKlMnOpQrStUvWxYz1234567890';
  const previousGapi = globalThis.gapi;

  globalThis.gapi = {
    client: {
      async load() {
        globalThis.gapi.client.sheets = {
          spreadsheets: {
            async get({ spreadsheetId: id }) {
              assert.equal(id, spreadsheetId);
              return { result: createGoogleSheetsFixture() };
            }
          }
        };
      }
    }
  };

  try {
    const workbook = await loadLegacyWorkbookFromSpreadsheetInput(spreadsheetId);
    assert.equal(workbook.SheetNames[0], 'Scarlet & Violet');
  } finally {
    globalThis.gapi = previousGapi;
  }
}

async function run() {
  testParsesLegacyGridFromWorkbook();
  testBuildsStrictImportPlanForKnownSet();
  testExtractsSetIdFromHeaderTextFallback();
  testStopsOnUnknownCardMappings();
  testExtractsSpreadsheetIdFromUrl();
  testBuildsWorkbookFromGoogleSheetsGridData();
  testLegacySheetDialogIsRenderedOutsideCollapsedToolsPanel();
  testPrefersSiblingDriveXlsxForLegacySheetImports();
  testBuildsLegacySelectionTreeWithAllCardsPreselected();
  testFiltersLegacyImportPlanBySelection();
  await testLoadsSpreadsheetAfterDiscoveryBecomesReady();
  console.log('legacy-import-regression: ok');
}

run().catch((error) => {
  console.error('legacy-import-regression: failed');
  console.error(error);
  process.exit(1);
});
