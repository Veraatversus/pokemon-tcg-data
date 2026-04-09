import fs from 'node:fs/promises';
import path from 'node:path';

export function extractProductsList(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.products)) return payload.products;
  if (Array.isArray(payload?.productList)) return payload.productList;
  return [];
}

export function extractPriceGuideList(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.priceGuides)) return payload.priceGuides;
  if (Array.isArray(payload?.prices)) return payload.prices;
  return [];
}

function toNumberOrNull(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
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

function normalizePriceRow(row = {}) {
  return {
    cardmarketProductId: Number(row.idProduct || row.productId || 0) || null,
    average: toNumberOrNull(row.avg ?? row.avgPrice ?? row.average),
    low: toNumberOrNull(row.low ?? row.lowPrice),
    trend: toNumberOrNull(row.trendPrice ?? row.trend),
    reverseHoloSell: toNumberOrNull(row.reverseHoloSell),
    suggested: toNumberOrNull(row.suggestedPrice ?? row.suggested),
    raw: row,
  };
}

function buildPriceMap(priceRows = []) {
  const map = new Map();
  for (const row of priceRows) {
    const normalized = normalizePriceRow(row);
    if (!normalized.cardmarketProductId) continue;
    map.set(normalized.cardmarketProductId, normalized);
  }
  return map;
}

function normalizeCodeKey(value = '') {
  return normalizeMatcherText(value).replace(/\s+/g, '');
}

function pickBestExpansionId(counts = new Map()) {
  let resolvedExpansionId = '';
  let resolvedCount = 0;
  counts.forEach((count, expansionId) => {
    if (count > resolvedCount) {
      resolvedExpansionId = expansionId;
      resolvedCount = count;
    }
  });
  return resolvedExpansionId;
}

function inferExpansionIdFromTrackerCards(trackerCards = [], nameIndex = {}) {
  const counts = new Map();
  const normalizedNames = Array.from(new Set(
    (Array.isArray(trackerCards) ? trackerCards : [])
      .map((card) => normalizeMatcherText(card?.name || ''))
      .filter(Boolean)
  ));

  normalizedNames.forEach((name) => {
    const expansionIds = Array.isArray(nameIndex?.[name]) ? nameIndex[name] : [];
    expansionIds.forEach((expansionId) => {
      const normalizedExpansionId = String(expansionId || '').trim();
      if (!normalizedExpansionId) return;
      counts.set(normalizedExpansionId, (counts.get(normalizedExpansionId) || 0) + 1);
    });
  });

  return pickBestExpansionId(counts);
}

function buildTrackerSetIndex(trackerSets = [], trackerCardsBySet = {}, nameIndex = {}) {
  const bySetId = {};
  const byPtcgoCode = {};

  (Array.isArray(trackerSets) ? trackerSets : []).forEach((set) => {
    const setId = String(set?.id || '').trim();
    if (!setId) return;

    const expansionId = inferExpansionIdFromTrackerCards(trackerCardsBySet?.[setId] || [], nameIndex);
    if (!expansionId) return;

    bySetId[setId.toLowerCase()] = expansionId;

    const ptcgoCode = normalizeCodeKey(set?.ptcgoCode || set?.code || '');
    if (ptcgoCode) {
      byPtcgoCode[ptcgoCode] = expansionId;
    }
  });

  return { bySetId, byPtcgoCode };
}

export function buildCardmarketArtifacts({ singlesPayload, priceGuidePayload, trackerSets = [], trackerCardsBySet = {} } = {}) {
  const products = extractProductsList(singlesPayload);
  const priceRows = extractPriceGuideList(priceGuidePayload);
  const priceMap = buildPriceMap(priceRows);

  const groupedSets = {};
  const productIndex = {};
  const nameIndex = {};

  for (const product of products) {
    const expansionId = Number(product.idExpansion || product.expansionId || 0) || 0;
    const expansionKey = String(expansionId || 'unknown');
    if (!groupedSets[expansionKey]) {
      groupedSets[expansionKey] = {
        expansionId,
        cards: [],
      };
    }

    const cardmarketProductId = Number(product.idProduct || product.productId || 0) || null;
    const price = cardmarketProductId ? priceMap.get(cardmarketProductId) : null;
    const setPath = `sets/${expansionKey}.json`;

    groupedSets[expansionKey].cards.push({
      cardmarketProductId,
      name: String(product.name || '').trim(),
      categoryId: Number(product.idCategory || 0) || null,
      categoryName: String(product.categoryName || '').trim(),
      expansionId,
      metacardId: Number(product.idMetacard || 0) || null,
      dateAdded: String(product.dateAdded || '').trim(),
      prices: {
        avg: price?.average ?? null,
        low: price?.low ?? null,
        trend: price?.trend ?? null,
        reverseHoloSell: price?.reverseHoloSell ?? null,
        suggested: price?.suggested ?? null,
      },
    });

    if (cardmarketProductId && !productIndex[String(cardmarketProductId)]) {
      productIndex[String(cardmarketProductId)] = {
        expansionId,
        path: setPath,
      };
    }

    const normalizedName = normalizeMatcherText(extractBaseCardName(product.name || ''));
    if (normalizedName) {
      if (!nameIndex[normalizedName]) {
        nameIndex[normalizedName] = new Set();
      }
      nameIndex[normalizedName].add(expansionKey);
    }
  }

  const normalizedNameIndex = Object.fromEntries(
    Object.entries(nameIndex)
      .map(([name, expansionIds]) => [name, Array.from(expansionIds).sort((left, right) => Number(left) - Number(right))])
  );
  const trackerIndex = buildTrackerSetIndex(trackerSets, trackerCardsBySet, normalizedNameIndex);

  const indexSets = Object.values(groupedSets)
    .map((entry) => ({
      expansionId: entry.expansionId,
      cardCount: entry.cards.length,
      path: `sets/${entry.expansionId || 'unknown'}.json`,
    }))
    .sort((left, right) => left.expansionId - right.expansionId);

  return {
    meta: {
      schemaVersion: 2,
      generatedAt: new Date().toISOString(),
      singlesSourceCreatedAt: singlesPayload?.createdAt || null,
      priceGuideSourceCreatedAt: priceGuidePayload?.createdAt || null,
      singlesCount: products.length,
      priceGuideCount: priceRows.length,
      setCount: indexSets.length,
      productIndexCount: Object.keys(productIndex).length,
    },
    index: {
      sets: indexSets,
      products: productIndex,
      names: normalizedNameIndex,
      tracker: trackerIndex,
    },
    sets: groupedSets,
  };
}

export async function writeArtifactsToDirectory(artifacts, outputDir) {
  const indexDir = path.join(outputDir, 'index');
  const setsDir = path.join(outputDir, 'sets');

  await fs.mkdir(indexDir, { recursive: true });
  await fs.mkdir(setsDir, { recursive: true });

  await fs.writeFile(path.join(outputDir, 'meta.json'), JSON.stringify(artifacts.meta, null, 2) + '\n', 'utf8');
  await fs.writeFile(path.join(indexDir, 'sets.json'), JSON.stringify({ sets: artifacts.index?.sets || [] }, null, 2) + '\n', 'utf8');
  await fs.writeFile(path.join(indexDir, 'products.json'), JSON.stringify(artifacts.index?.products || {}, null, 2) + '\n', 'utf8');
  await fs.writeFile(path.join(indexDir, 'names.json'), JSON.stringify(artifacts.index?.names || {}, null, 2) + '\n', 'utf8');
  await fs.writeFile(path.join(indexDir, 'tracker.json'), JSON.stringify(artifacts.index?.tracker || { bySetId: {}, byPtcgoCode: {} }, null, 2) + '\n', 'utf8');

  await Promise.all(
    Object.entries(artifacts.sets).map(([expansionKey, payload]) =>
      fs.writeFile(path.join(setsDir, `${expansionKey}.json`), JSON.stringify(payload, null, 2) + '\n', 'utf8')
    )
  );
}
