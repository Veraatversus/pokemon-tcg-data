import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildCardmarketArtifacts, writeArtifactsToDirectory } from './lib/build-helpers.mjs';

const DEFAULT_SINGLES_URL = 'https://downloads.s3.cardmarket.com/productCatalog/productList/products_singles_6.json';
const DEFAULT_NONSINGLES_URL = 'https://downloads.s3.cardmarket.com/productCatalog/productList/products_nonsingles_6.json';
const DEFAULT_PRICE_GUIDE_URL = 'https://downloads.s3.cardmarket.com/productCatalog/priceGuide/price_guide_6.json';

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      'user-agent': 'veraatversus-cardmarket-builder/1.0',
      accept: 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

function validateArtifacts(artifacts) {
  if (!artifacts?.meta) throw new Error('Missing artifacts.meta');
  if (!artifacts?.index?.sets) throw new Error('Missing artifacts.index.sets');
  if (!artifacts?.index?.products) throw new Error('Missing artifacts.index.products');
  if (!artifacts?.index?.nonsinglesProducts) throw new Error('Missing artifacts.index.nonsinglesProducts');
  if (!artifacts?.index?.names) throw new Error('Missing artifacts.index.names');
  if (!artifacts?.index?.tracker) throw new Error('Missing artifacts.index.tracker');
  if (!Number.isFinite(artifacts.meta.singlesCount) || artifacts.meta.singlesCount <= 0) {
    throw new Error('Cardmarket singles feed produced no products');
  }
  if (!Number.isFinite(artifacts.meta.priceGuideCount) || artifacts.meta.priceGuideCount <= 0) {
    throw new Error('Cardmarket price guide feed produced no price entries');
  }
  if (!Number.isFinite(artifacts.meta.productIndexCount) || artifacts.meta.productIndexCount <= 0) {
    throw new Error('Cardmarket product lookup index is empty');
  }
  if (!Number.isFinite(artifacts.meta.nonsinglesCount) || artifacts.meta.nonsinglesCount < 0) {
    throw new Error('Cardmarket nonsingles feed produced an invalid count');
  }
}

async function loadTrackerReferenceData(repoRoot) {
  const trackerSetsPath = path.join(repoRoot, 'sets', 'en.json');
  let trackerSets = [];
  try {
    trackerSets = JSON.parse(await fs.readFile(trackerSetsPath, 'utf8'));
  } catch {
    trackerSets = [];
  }

  const trackerCardsBySet = {};
  await Promise.all(
    (Array.isArray(trackerSets) ? trackerSets : []).map(async (set) => {
      const setId = String(set?.id || '').trim();
      if (!setId) return;
      const cardsPath = path.join(repoRoot, 'cards', 'en', `${setId}.json`);
      try {
        const cards = JSON.parse(await fs.readFile(cardsPath, 'utf8'));
        trackerCardsBySet[setId] = Array.isArray(cards)
          ? cards.map((card) => ({ name: card?.name || '', number: card?.number || '' }))
          : [];
      } catch {
        trackerCardsBySet[setId] = [];
      }
    })
  );

  return { trackerSets, trackerCardsBySet };
}

async function resolveDefaultOutputDirs(repoRoot) {
  const dirs = [process.env.CARDMARKET_OUTPUT_DIR || path.join(repoRoot, 'cardmarket')];
  const frontendOutputDir = process.env.CARDMARKET_FRONTEND_OUTPUT_DIR || path.join(repoRoot, 'frontend', 'tcg-tracker-web', 'cardmarket');

  if (process.env.CARDMARKET_FRONTEND_OUTPUT_DIR) {
    dirs.push(frontendOutputDir);
    return dirs;
  }

  try {
    await fs.access(path.join(repoRoot, 'frontend', 'tcg-tracker-web'));
    dirs.push(frontendOutputDir);
  } catch {
    // master can omit the frontend tree entirely; local/dev builds can still opt in explicitly
  }

  return dirs;
}

export async function buildDailyCardmarketData({ singlesUrl = DEFAULT_SINGLES_URL, nonsinglesUrl = DEFAULT_NONSINGLES_URL, priceGuideUrl = DEFAULT_PRICE_GUIDE_URL, outputDir, outputDirs = [], repoRoot } = {}) {
  const resolvedRepoRoot = repoRoot ? path.resolve(repoRoot) : path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
  const [singlesPayload, nonsinglesPayload, priceGuidePayload, trackerReference] = await Promise.all([
    fetchJson(singlesUrl),
    fetchJson(nonsinglesUrl),
    fetchJson(priceGuideUrl),
    loadTrackerReferenceData(resolvedRepoRoot),
  ]);

  const artifacts = buildCardmarketArtifacts({
    singlesPayload,
    nonsinglesPayload,
    priceGuidePayload,
    trackerSets: trackerReference.trackerSets,
    trackerCardsBySet: trackerReference.trackerCardsBySet,
  });
  validateArtifacts(artifacts);

  const resolvedOutputDirs = [...new Set([
    ...outputDirs,
    outputDir,
  ].filter(Boolean).map((dir) => path.resolve(dir)))];

  for (const dir of resolvedOutputDirs) {
    await writeArtifactsToDirectory(artifacts, dir);
  }

  return artifacts;
}

const isDirectRun = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isDirectRun) {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

  resolveDefaultOutputDirs(repoRoot)
    .then((outputDirs) => buildDailyCardmarketData({ outputDirs, repoRoot })
      .then((artifacts) => {
        console.log(`Cardmarket build complete: ${artifacts.meta.singlesCount} singles, ${artifacts.meta.priceGuideCount} price rows, ${artifacts.meta.setCount} expansions -> ${outputDirs.join(', ')}`);
      }))
    .catch((error) => {
      console.error('[cardmarket-build] failed:', error);
      process.exitCode = 1;
    });
}
