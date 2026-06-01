import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {
  collectTcgdexHelperData,
  runTcgdexHelperCli,
  writeTcgdexHelperArtifacts,
  sortLocalIds,
} from './tcgdex-helper/generate-tcgdex-helpers.mjs';

async function makeFixtureRepo() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tcgdex-fixture-'));
  const dataDir = path.join(root, 'data', 'Base');
  await fs.mkdir(dataDir, { recursive: true });

  const setFile = path.join(dataDir, 'Base Set.ts');
  const setCardsDir = path.join(dataDir, 'Base Set');
  await fs.mkdir(setCardsDir, { recursive: true });

  await fs.writeFile(
    setFile,
    `import { Set } from '../../interfaces'\n\nconst base1: Set = {\n  id: "base1",\n  name: { en: "Base Set", de: "Grundset" },\n  abbreviations: { official: "BS" },\n  thirdParty: { cardmarket: 1523, tcgplayer: 604 }\n}\n\nexport default base1\n`,
    'utf8'
  );

  await fs.writeFile(
    path.join(setCardsDir, '10.ts'),
    `const card = {\n  name: { en: "Charizard", de: "Glurak" },\n  thirdParty: { cardmarket: 273699, tcgplayer: 42365 }\n}\nexport default card\n`,
    'utf8'
  );

  await fs.writeFile(
    path.join(setCardsDir, '2.ts'),
    `const card = {\n  name: { en: "Blastoise" },\n  thirdParty: { cardmarket: 273697 }\n}\nexport default card\n`,
    'utf8'
  );

  await fs.writeFile(
    path.join(setCardsDir, 'TG01.ts'),
    `const card = {\n  name: { en: "Bonus Card", de: "Bonuskarte" },\n  thirdParty: { tcgplayer: 999999 }\n}\nexport default card\n`,
    'utf8'
  );

  const secondSetFile = path.join(dataDir, 'Shadow Set.ts');
  const secondSetCardsDir = path.join(dataDir, 'Shadow Set');
  await fs.mkdir(secondSetCardsDir, { recursive: true });
  await fs.writeFile(
    secondSetFile,
    `const shadow = {\n  id: "base-shadow",\n  name: { en: "Shadow Set" },\n  abbreviations: { official: "SHD" },\n  thirdParty: { tcgplayer: 777 }\n}\nexport default shadow\n`,
    'utf8'
  );
  await fs.writeFile(
    path.join(secondSetCardsDir, '1.ts'),
    `const card = { name: { de: "Nur Deutsch" } }\nexport default card\n`,
    'utf8'
  );

  return root;
}

test('sortLocalIds applies natural order for mixed local ids', () => {
  const sorted = ['10', '2', '10a', 'TG01', '1'].sort(sortLocalIds);
  assert.deepEqual(sorted, ['1', '2', '10', '10a', 'TG01']);
});

test('collectTcgdexHelperData builds complete set list and card lists with null handling', async () => {
  const fixtureRoot = await makeFixtureRepo();
  const result = await collectTcgdexHelperData({ sourceDir: fixtureRoot });

  assert.equal(result.sets.length, 2);

  const baseSet = result.sets.find((set) => set.tcgdexSetId === 'base1');
  assert.ok(baseSet);
  assert.equal(baseSet.name.en, 'Base Set');
  assert.equal(baseSet.name.de, 'Grundset');
  assert.equal(baseSet.officialAbbreviation, 'BS');
  assert.equal(baseSet.cardmarketSetId, 1523);
  assert.equal(baseSet.tcgplayerSetId, 604);

  const shadowSet = result.sets.find((set) => set.tcgdexSetId === 'base-shadow');
  assert.ok(shadowSet);
  assert.equal(shadowSet.name.en, 'Shadow Set');
  assert.equal(shadowSet.name.de, null);
  assert.equal(shadowSet.cardmarketSetId, null);
  assert.equal(shadowSet.tcgplayerSetId, 777);

  const baseCards = result.cardsByTcgdexSetId.base1;
  assert.deepEqual(
    baseCards.map((card) => card.number),
    ['2', '10', 'TG01']
  );

  assert.deepEqual(baseCards[0], {
    number: '2',
    name: { en: 'Blastoise', de: null },
    cardmarketId: 273697,
    tcgplayerId: null,
  });

  assert.deepEqual(baseCards[2], {
    number: 'TG01',
    name: { en: 'Bonus Card', de: 'Bonuskarte' },
    cardmarketId: null,
    tcgplayerId: 999999,
  });
});

test('writeTcgdexHelperArtifacts writes set master and per-set files by cardmarket id', async () => {
  const fixtureRoot = await makeFixtureRepo();
  const outputDir = await fs.mkdtemp(path.join(os.tmpdir(), 'tcgdex-output-'));
  const collected = await collectTcgdexHelperData({ sourceDir: fixtureRoot });

  await writeTcgdexHelperArtifacts({
    outputDir,
    collected,
    source: { repoUrl: 'https://github.com/tcgdex/cards-database.git', ref: 'master' },
  });

  const setsPath = path.join(outputDir, 'sets-master.json');
  const setsPayload = JSON.parse(await fs.readFile(setsPath, 'utf8'));
  assert.equal(Array.isArray(setsPayload.sets), true);
  assert.equal(setsPayload.sets.length, 2);

  const baseSetPath = path.join(outputDir, 'sets', '1523.json');
  const baseSetPayload = JSON.parse(await fs.readFile(baseSetPath, 'utf8'));
  assert.equal(baseSetPayload.tcgdexSetId, 'base1');
  assert.equal(baseSetPayload.cardmarketSetId, 1523);
  assert.deepEqual(baseSetPayload.cards.map((card) => card.number), ['2', '10', 'TG01']);

  const fallbackSetPath = path.join(outputDir, 'unmatched', 'base-shadow.json');
  const fallbackPayload = JSON.parse(await fs.readFile(fallbackSetPath, 'utf8'));
  assert.equal(fallbackPayload.cardmarketSetId, null);
  assert.equal(fallbackPayload.cards.length, 1);
}
);

test('runTcgdexHelperCli generates artifacts from a provided source directory', async () => {
  const fixtureRoot = await makeFixtureRepo();
  const outputDir = await fs.mkdtemp(path.join(os.tmpdir(), 'tcgdex-cli-output-'));

  const summary = await runTcgdexHelperCli([
    '--source-dir', fixtureRoot,
    '--out-dir', outputDir,
  ]);

  assert.equal(summary.setCount, 2);
  assert.equal(summary.dryRun, false);

  await fs.access(path.join(outputDir, 'sets-master.json'));
  await fs.access(path.join(outputDir, 'sets', '1523.json'));
  await fs.access(path.join(outputDir, 'unmatched', 'base-shadow.json'));
});

test('writeTcgdexHelperArtifacts applies manual set id mapping for known unmatched tcgdex sets', async () => {
  const outputDir = await fs.mkdtemp(path.join(os.tmpdir(), 'tcgdex-manual-map-'));
  const collected = {
    sets: [
      {
        tcgdexSetId: 'sv10',
        name: { en: 'SV10', de: null },
        officialAbbreviation: 'SV10',
        cardmarketSetId: null,
        tcgplayerSetId: null,
      },
    ],
    cardsByTcgdexSetId: {
      sv10: [
        {
          number: '1',
          name: { en: 'Sample Card', de: null },
          cardmarketId: 825995,
          tcgplayerId: null,
        },
      ],
    },
  };

  await writeTcgdexHelperArtifacts({
    outputDir,
    collected,
    source: { repoUrl: 'https://github.com/tcgdex/cards-database.git', ref: 'master' },
  });

  const mappedSetPath = path.join(outputDir, 'sets', '6096.json');
  const mappedSetPayload = JSON.parse(await fs.readFile(mappedSetPath, 'utf8'));
  assert.equal(mappedSetPayload.tcgdexSetId, 'sv10');
  assert.equal(mappedSetPayload.cardmarketSetId, 6096);

  await assert.rejects(() => fs.access(path.join(outputDir, 'unmatched', 'sv10.json')));
});