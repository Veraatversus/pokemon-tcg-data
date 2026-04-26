import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  buildCardmarketArtifacts,
  extractProductsList,
  writeArtifactsToDirectory,
} from './lib/build-helpers.mjs';

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

async function fetchProductPage(productId, { timeoutMs = 15000 } = {}) {
  const timeoutSignal = Number.isFinite(timeoutMs) && timeoutMs > 0
    ? AbortSignal.timeout(timeoutMs)
    : undefined;
  const response = await fetch(`https://www.cardmarket.com/de/Pokemon/Products?idProduct=${encodeURIComponent(productId)}`, {
    signal: timeoutSignal,
    headers: {
      'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36',
      accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'accept-language': 'de-DE,de;q=0.9,en;q=0.8',
      referer: 'https://www.cardmarket.com/de/Pokemon',
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch Cardmarket product ${productId}: ${response.status} ${response.statusText}`);
  }

  return response.text();
}

function normalizeMatcherText(value = '') {
  return String(value || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function extractBaseCardName(value = '') {
  return String(value || '').split('[')[0].trim();
}

function decodeHtmlEntities(value = '') {
  return String(value || '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&#39;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>');
}

export function extractCollectorNumberFromProductPageHtml(html = '') {
  const titleMatch = String(html || '').match(/<title[^>]*>([^<]+)<\/title>/i);
  const titleText = decodeHtmlEntities(titleMatch?.[1] || '');
  const titleNumberMatch = titleText.match(/\(([A-Z0-9-]+\s+)?([A-Z]*\d+[A-Z]*)\)/i);
  if (titleNumberMatch?.[2]) {
    return String(titleNumberMatch[2]).trim().toUpperCase();
  }

  const plainText = decodeHtmlEntities(String(html || '').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ');
  const plainNumberMatch = plainText.match(/\bNummer\b\s*([A-Z]*\d+[A-Z]*)/i);
  if (plainNumberMatch?.[1]) {
    return String(plainNumberMatch[1]).trim().toUpperCase();
  }

  return '';
}

export async function enrichSinglesWithCollectorNumbers(singlesPayload, { fetchProductPage: fetchProductPageOverride = fetchProductPage } = {}) {
  const products = extractProductsList(singlesPayload);
  if (!Array.isArray(products) || !products.length) return singlesPayload;

  const clonedProducts = products.map((product) => ({ ...product }));
  const duplicateGroups = new Map();

  clonedProducts.forEach((product, index) => {
    const expansionId = String(product?.idExpansion || product?.expansionId || '').trim();
    const metacardId = String(product?.idMetacard || product?.metacardId || '').trim();
    const baseName = normalizeMatcherText(extractBaseCardName(product?.name || ''));
    if (!expansionId || !metacardId || !baseName) return;

    const key = `${expansionId}::${metacardId}::${baseName}`;
    const group = duplicateGroups.get(key) || [];
    group.push({ product, index });
    duplicateGroups.set(key, group);
  });

  for (const group of duplicateGroups.values()) {
    if (!Array.isArray(group) || group.length < 2) continue;

    for (const entry of group) {
      const productId = String(entry?.product?.idProduct || entry?.product?.productId || '').trim();
      if (!productId) continue;

      try {
        const html = await fetchProductPageOverride(productId);
        const collectorNumber = extractCollectorNumberFromProductPageHtml(html);
        if (collectorNumber) {
          clonedProducts[entry.index].collectorNumber = collectorNumber;
        }
      } catch {
        // leave the duplicate unresolved when Cardmarket blocks an individual product page
      }
    }
  }

  if (Array.isArray(singlesPayload)) {
    return clonedProducts;
  }

  if (Array.isArray(singlesPayload?.products)) {
    return {
      ...singlesPayload,
      products: clonedProducts,
    };
  }

  if (Array.isArray(singlesPayload?.productList)) {
    return {
      ...singlesPayload,
      productList: clonedProducts,
    };
  }

  return singlesPayload;
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

export async function backfillCollectorNumbersInArtifactsDir(outputDir, {
  fetchProductPage: fetchProductPageOverride = fetchProductPage,
  setIds = null,
} = {}) {
  const setsDir = path.join(path.resolve(outputDir), 'sets');
  let setFiles = [];
  try {
    setFiles = (await fs.readdir(setsDir)).filter((fileName) => fileName.endsWith('.json'));
  } catch {
    return { filesUpdated: 0, productsAnnotated: 0 };
  }

  let filesUpdated = 0;
  let productsAnnotated = 0;

  for (const fileName of setFiles) {
    const setIdFromFile = String(fileName || '').replace(/\.json$/i, '').trim();
    if (Array.isArray(setIds) && setIds.length && !setIds.includes(setIdFromFile)) {
      continue;
    }

    const filePath = path.join(setsDir, fileName);
    const payload = JSON.parse(await fs.readFile(filePath, 'utf8'));
    const cards = Array.isArray(payload?.cards) ? payload.cards.map((card) => ({ ...card })) : [];
    const groups = new Map();

    cards.forEach((card, index) => {
      const expansionId = String(card?.expansionId || '').trim();
      const metacardId = String(card?.metacardId || '').trim();
      const baseName = normalizeMatcherText(extractBaseCardName(card?.name || ''));
      if (!expansionId || !metacardId || !baseName) return;

      const key = `${expansionId}::${metacardId}::${baseName}`;
      const group = groups.get(key) || [];
      group.push({ card, index });
      groups.set(key, group);
    });

    let changed = false;
    for (const group of groups.values()) {
      if (!Array.isArray(group) || group.length < 2) continue;
      if (!group.some(({ card }) => !String(card?.collectorNumber || '').trim())) continue;

      for (const entry of group) {
        if (String(entry.card?.collectorNumber || '').trim()) continue;
        const productId = String(entry.card?.cardmarketProductId || '').trim();
        if (!productId) continue;

        try {
          const html = await fetchProductPageOverride(productId);
          const collectorNumber = extractCollectorNumberFromProductPageHtml(html);
          if (!collectorNumber) continue;

          cards[entry.index].collectorNumber = collectorNumber;
          productsAnnotated += 1;
          changed = true;
        } catch {
          // skip individual product pages that Cardmarket rejects during local backfills
        }
      }
    }

    if (changed) {
      filesUpdated += 1;
      await fs.writeFile(filePath, JSON.stringify({ ...payload, cards }), 'utf8');
    }
  }

  return { filesUpdated, productsAnnotated };
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
  const [rawSinglesPayload, nonsinglesPayload, priceGuidePayload, trackerReference] = await Promise.all([
    fetchJson(singlesUrl),
    fetchJson(nonsinglesUrl),
    fetchJson(priceGuideUrl),
    loadTrackerReferenceData(resolvedRepoRoot),
  ]);

  const singlesPayload = await enrichSinglesWithCollectorNumbers(rawSinglesPayload);

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
