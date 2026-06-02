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
    average1: toNumberOrNull(row.avg1),
    average7: toNumberOrNull(row.avg7),
    average30: toNumberOrNull(row.avg30),
    low: toNumberOrNull(row.low ?? row.lowPrice),
    trend: toNumberOrNull(row.trendPrice ?? row.trend),
    averageHolo: toNumberOrNull(row['avg-holo'] ?? row.avgHolo),
    average1Holo: toNumberOrNull(row['avg1-holo'] ?? row.avg1Holo),
    average7Holo: toNumberOrNull(row['avg7-holo'] ?? row.avg7Holo),
    average30Holo: toNumberOrNull(row['avg30-holo'] ?? row.avg30Holo),
    lowHolo: toNumberOrNull(row['low-holo'] ?? row.lowHolo),
    trendHolo: toNumberOrNull(row['trend-holo'] ?? row.trendHolo),
    reverseHoloSell: toNumberOrNull(row.reverseHoloSell),
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

const CATEGORY_BASE_SCORES = {
  'pokemon booster': 100,
  'pokemon box set': 54,
  'pokemon theme deck': 52,
  'pokemon trainer kits': 50,
  'pokemon tins': 48,
};

function addScoredCandidate(candidateMap, candidateName = '', score = 0) {
  const normalizedName = normalizeMatcherText(candidateName);
  if (!normalizedName || score <= 0) return;

  const currentScore = candidateMap.get(normalizedName) || 0;
  if (score > currentScore) {
    candidateMap.set(normalizedName, score);
  }
}

function removePattern(value = '', pattern) {
  const nextValue = normalizeMatcherText(String(value || '').replace(pattern, ' '));
  return nextValue && nextValue !== value ? nextValue : '';
}

function addDerivedAliases(candidateMap, baseName = '', baseScore = 0) {
  const queue = [{ name: normalizeMatcherText(baseName), score: baseScore }];
  const seen = new Set();

  while (queue.length) {
    const current = queue.shift();
    const currentName = normalizeMatcherText(current?.name || '');
    const currentScore = Number(current?.score || 0);
    if (!currentName || currentScore <= 0 || seen.has(currentName)) continue;
    seen.add(currentName);
    addScoredCandidate(candidateMap, currentName, currentScore);

    [
      { pattern: /^the\s+/, penalty: 4 },
      { pattern: /^ex\s+/, penalty: 4 },
      { pattern: /^pokemon card\s+/, penalty: 6 },
      { pattern: /\s+enhanced expansion pack$/, penalty: 8 },
      { pattern: /\s+expansion pack$/, penalty: 14 },
      { pattern: /\s+collection$/, penalty: 8 },
      { pattern: /\s+sleeved$/, penalty: 10 },
      { pattern: /\s+dollar tree$/, penalty: 10 },
      { pattern: /\s+promo$/, penalty: 10 },
      { pattern: /\s+jumbo$/, penalty: 12 },
      { pattern: /\s+mini tins?$/, penalty: 16 },
      { pattern: /\s+tins?$/, penalty: 16 },
      { pattern: /\s+elite trainer box$/, penalty: 18 },
      { pattern: /\s+build battle box$/, penalty: 18 },
      { pattern: /\s+box set$/, penalty: 18 },
      { pattern: /\s+theme deck$/, penalty: 18 },
      { pattern: /\s+trainer kits?$/, penalty: 18 },
      { pattern: /\s+special set$/, penalty: 18 },
      { pattern: /\s+set$/, penalty: 8 },
    ].forEach(({ pattern, penalty }) => {
      const nextName = removePattern(currentName, pattern);
      if (!nextName) return;
      queue.push({ name: nextName, score: currentScore - penalty });
    });
  }
}

function buildExpansionNameCandidates(nonsinglesProducts = []) {
  const candidatesByExpansionId = new Map();

  (Array.isArray(nonsinglesProducts) ? nonsinglesProducts : []).forEach((product) => {
    const expansionId = String(Number(product?.idExpansion || product?.expansionId || 0) || '').trim();
    if (!expansionId) return;

    const categoryName = normalizeMatcherText(product?.categoryName || '');
    const productName = String(product?.name || '').trim();
    if (!productName) return;

    const baseScore = CATEGORY_BASE_SCORES[categoryName] || 0;
    if (!baseScore) return;

    const strippedProductName = String(productName || '')
      .replace(/\([^)]*\)/g, ' ')
      .replace(/^[A-Za-z0-9]+\s*:\s*/, ' ')
      .trim();

    const candidateMap = candidatesByExpansionId.get(expansionId) || new Map();
    const normalizedName = normalizeMatcherText(strippedProductName);
    if (!normalizedName) return;

    if (categoryName === 'pokemon booster' && /\bbooster\b/i.test(strippedProductName)) {
      const boosterBaseName = normalizeMatcherText(strippedProductName.replace(/\bbooster\b/ig, ' '));
      addDerivedAliases(candidateMap, boosterBaseName, baseScore);
    }

    addDerivedAliases(candidateMap, normalizedName, Math.max(baseScore - 20, 1));
    candidatesByExpansionId.set(expansionId, candidateMap);
  });

  return candidatesByExpansionId;
}

function scoreSetNameCandidate(setNameKey = '', candidateName = '', candidateScore = 0, preferredExpansion = false) {
  const normalizedSetName = normalizeMatcherText(setNameKey);
  const normalizedCandidateName = normalizeMatcherText(candidateName);
  if (!normalizedSetName || !normalizedCandidateName || candidateScore <= 0) return 0;

  let score = 0;
  if (normalizedCandidateName === normalizedSetName) {
    score = candidateScore + 100;
  }

  if (score <= 0) return 0;
  return preferredExpansion ? score + 15 : score;
}

function resolveTrackerSetNameExpansionId(setNameKey = '', preferredExpansionId = '', expansionNameCandidates = new Map()) {
  const matches = [];

  expansionNameCandidates.forEach((candidateMap, expansionId) => {
    let bestScore = 0;
    candidateMap.forEach((candidateScore, candidateName) => {
      const score = scoreSetNameCandidate(setNameKey, candidateName, candidateScore, expansionId === preferredExpansionId);
      if (score > bestScore) {
        bestScore = score;
      }
    });

    if (bestScore > 0) {
      matches.push({ expansionId, score: bestScore });
    }
  });

  matches.sort((left, right) => {
    if (right.score !== left.score) return right.score - left.score;
    return Number(left.expansionId) - Number(right.expansionId);
  });

  if (!matches.length) return '';
  if (matches.length === 1) return matches[0].expansionId;

  if (matches[0].score === matches[1].score) {
    if (preferredExpansionId && matches.some((match) => match.expansionId === preferredExpansionId && match.score === matches[0].score)) {
      return preferredExpansionId;
    }
    return '';
  }

  return matches[0].expansionId;
}

function isFallbackEligibleTrackerSet(setNameKey = '', setId = '') {
  const normalizedSetName = normalizeMatcherText(setNameKey);
  const normalizedSetId = String(setId || '').trim().toLowerCase();
  if (!normalizedSetName && !normalizedSetId) return false;

  return (
    /black star promos/.test(normalizedSetName) ||
    /mcdonald s collection \d{4}/.test(normalizedSetName) ||
    /trainer kit/.test(normalizedSetName) ||
    /^hs\s+/.test(normalizedSetName) ||
    /shiny vault|trainer gallery|galarian gallery/.test(normalizedSetName) ||
    /classic collection|futsal collection|starter set|pokemon rumble|energies|best of game/.test(normalizedSetName) ||
    /tk\d[a-z]|mcd\d{2}|hgss\d+/.test(normalizedSetId)
  );
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

function buildTrackerSetIndex(trackerSets = [], trackerCardsBySet = {}, nameIndex = {}, expansionNameCandidates = new Map(), tcgdexSetToCardmarketMap = {}) {
  const tcgdexIdMap = tcgdexSetToCardmarketMap?.idMap || {};
  const tcgdexNameMap = tcgdexSetToCardmarketMap?.nameMap || {};

  const bySetId = {};
  const byPtcgoCode = {};
  const bySetName = {};
  const inferredExpansionIdBySetId = {};
  const resolvedExpansionIdBySetId = {};
  const byPtcgoCodeCandidates = {};

  // Phase 1: Primary matching via tcgdex sets-master.json
  (Array.isArray(trackerSets) ? trackerSets : []).forEach((set) => {
    const setId = String(set?.id || '').trim();
    if (!setId) return;

    const normalizedSetId = setId.toLowerCase();

    // 1a: Direct ID match (tcgdexSetId → cardmarketSetId)
    const tcgdexCardmarketId = tcgdexIdMap[setId];
    if (tcgdexCardmarketId) {
      resolvedExpansionIdBySetId[normalizedSetId] = tcgdexCardmarketId;
      return;
    }

    // 1b: English name match (tracker set name → tcgdex en name → cardmarketSetId)
    const trackerEnName = normalizeMatcherText(set?.name || '');
    if (trackerEnName && tcgdexNameMap[trackerEnName]) {
      resolvedExpansionIdBySetId[normalizedSetId] = tcgdexNameMap[trackerEnName];
    }
  });

  // Phase 2: Fallback matching via card-name inference + set-name scoring
  (Array.isArray(trackerSets) ? trackerSets : []).forEach((set) => {
    const setId = String(set?.id || '').trim();
    if (!setId) return;

    const normalizedSetId = setId.toLowerCase();

    // Skip if already resolved by primary tcgdex matching
    if (resolvedExpansionIdBySetId[normalizedSetId]) return;

    const expansionId = inferExpansionIdFromTrackerCards(trackerCardsBySet?.[setId] || [], nameIndex);
    if (expansionId) {
      inferredExpansionIdBySetId[normalizedSetId] = expansionId;
    }

    const setNameKey = normalizeMatcherText(set?.name || '');
    if (!setNameKey) return;

    let resolvedSetNameExpansionId = resolveTrackerSetNameExpansionId(
      setNameKey,
      inferredExpansionIdBySetId[normalizedSetId] || '',
      expansionNameCandidates
    );

    if (!resolvedSetNameExpansionId && isFallbackEligibleTrackerSet(setNameKey, setId)) {
      resolvedSetNameExpansionId =
        inferredExpansionIdBySetId[normalizedSetId] ||
        '';
    }

    if (resolvedSetNameExpansionId) {
      resolvedExpansionIdBySetId[normalizedSetId] = resolvedSetNameExpansionId;
      bySetName[setNameKey] = resolvedSetNameExpansionId;
    }
  });

  // Phase 3: Build final indices from resolved expansion IDs
  (Array.isArray(trackerSets) ? trackerSets : []).forEach((set) => {
    const setId = String(set?.id || '').trim();
    if (!setId) return;

    const normalizedSetId = setId.toLowerCase();
    const resolvedExpansionId = String(resolvedExpansionIdBySetId[normalizedSetId] || '').trim();
    if (!resolvedExpansionId) return;

    bySetId[normalizedSetId] = resolvedExpansionId;

    const ptcgoCode = normalizeCodeKey(set?.ptcgoCode || set?.code || '');
    if (ptcgoCode) {
      if (!byPtcgoCodeCandidates[ptcgoCode]) {
        byPtcgoCodeCandidates[ptcgoCode] = new Set();
      }
      byPtcgoCodeCandidates[ptcgoCode].add(resolvedExpansionId);
    }
  });

  Object.entries(byPtcgoCodeCandidates).forEach(([ptcgoCode, expansionIds]) => {
    const uniqueExpansionIds = Array.from(expansionIds || []);
    if (uniqueExpansionIds.length === 1) {
      byPtcgoCode[ptcgoCode] = uniqueExpansionIds[0];
    }
  });

  return { bySetId, byPtcgoCode, bySetName };
}

export function buildCardmarketArtifacts({ singlesPayload, nonsinglesPayload, priceGuidePayload, trackerSets = [], trackerCardsBySet = {}, tcgdexSetToCardmarketMap = { idMap: {}, nameMap: {} } } = {}) {
  const products = extractProductsList(singlesPayload);
  const nonsinglesProducts = extractProductsList(nonsinglesPayload);
  const priceRows = extractPriceGuideList(priceGuidePayload);
  const priceMap = buildPriceMap(priceRows);

  const groupedSets = {};
  const productIndex = {};
  const nameIndex = {};
  const nonsinglesProductsIndex = {};

  const allProducts = [...products, ...nonsinglesProducts];
  allProducts.forEach((product) => {
    const expansionId = Number(product?.idExpansion || product?.expansionId || 0) || 0;
    const expansionKey = String(expansionId || 'unknown');
    if (!groupedSets[expansionKey]) {
      groupedSets[expansionKey] = {
        expansionId,
        cards: [],
      };
    }

    const cardmarketProductId = Number(product?.idProduct || product?.productId || 0) || null;
    if (cardmarketProductId && !productIndex[String(cardmarketProductId)]) {
      productIndex[String(cardmarketProductId)] = {
        expansionId,
        path: `sets/${expansionKey}.json`,
      };
    }
  });

  for (const product of products) {
    const expansionId = Number(product.idExpansion || product.expansionId || 0) || 0;
    const expansionKey = String(expansionId || 'unknown');

    const cardmarketProductId = Number(product.idProduct || product.productId || 0) || null;
    const price = cardmarketProductId ? priceMap.get(cardmarketProductId) : null;

    groupedSets[expansionKey].cards.push({
      cardmarketProductId,
      name: String(product.name || '').trim(),
      collectorNumber: String(product.collectorNumber || product.number || '').trim() || null,
      categoryId: Number(product.idCategory || 0) || null,
      categoryName: String(product.categoryName || '').trim(),
      expansionId,
      metacardId: Number(product.idMetacard || 0) || null,
      dateAdded: String(product.dateAdded || '').trim(),
      prices: {
        avg: price?.average ?? null,
        avg1: price?.average1 ?? null,
        avg7: price?.average7 ?? null,
        avg30: price?.average30 ?? null,
        low: price?.low ?? null,
        trend: price?.trend ?? null,
        avgHolo: price?.averageHolo ?? null,
        avg1Holo: price?.average1Holo ?? null,
        avg7Holo: price?.average7Holo ?? null,
        avg30Holo: price?.average30Holo ?? null,
        lowHolo: price?.lowHolo ?? null,
        trendHolo: price?.trendHolo ?? null,
        reverseHoloSell: price?.reverseHoloSell ?? null,
      },
    });

    const normalizedName = normalizeMatcherText(extractBaseCardName(product.name || ''));
    if (normalizedName) {
      if (!nameIndex[normalizedName]) {
        nameIndex[normalizedName] = new Set();
      }
      nameIndex[normalizedName].add(expansionKey);
    }
  }

  for (const product of nonsinglesProducts) {
    const cardmarketProductId = Number(product.idProduct || product.productId || 0) || null;
    if (!cardmarketProductId) continue;

    const expansionId = Number(product.idExpansion || product.expansionId || 0) || 0;
    const expansionKey = String(expansionId || 'unknown');
    nonsinglesProductsIndex[String(cardmarketProductId)] = {
      name: String(product.name || '').trim(),
      categoryId: Number(product.idCategory || 0) || null,
      categoryName: String(product.categoryName || '').trim(),
      expansionId,
      metacardId: Number(product.idMetacard || 0) || null,
      dateAdded: String(product.dateAdded || '').trim(),
      path: `sets/${expansionKey}.json`,
    };
  }

  const normalizedNameIndex = Object.fromEntries(
    Object.entries(nameIndex)
      .map(([name, expansionIds]) => [name, Array.from(expansionIds).sort((left, right) => Number(left) - Number(right))])
  );
  const expansionNameCandidates = buildExpansionNameCandidates(nonsinglesProducts);
  const trackerIndex = buildTrackerSetIndex(trackerSets, trackerCardsBySet, normalizedNameIndex, expansionNameCandidates, tcgdexSetToCardmarketMap);

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
      nonsinglesSourceCreatedAt: nonsinglesPayload?.createdAt || null,
      priceGuideSourceCreatedAt: priceGuidePayload?.createdAt || null,
      singlesCount: products.length,
      nonsinglesCount: nonsinglesProducts.length,
      priceGuideCount: priceRows.length,
      setCount: indexSets.length,
      productIndexCount: Object.keys(productIndex).length,
    },
    index: {
      sets: indexSets,
      products: productIndex,
      names: normalizedNameIndex,
      nonsinglesProducts: nonsinglesProductsIndex,
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

  await fs.writeFile(path.join(outputDir, 'meta.json'), JSON.stringify(artifacts.meta), 'utf8');
  await fs.writeFile(path.join(indexDir, 'sets.json'), JSON.stringify({ sets: artifacts.index?.sets || [] }), 'utf8');
  await fs.writeFile(path.join(indexDir, 'products.json'), JSON.stringify(artifacts.index?.products || {}), 'utf8');
  await fs.writeFile(path.join(indexDir, 'nonsingles-products.json'), JSON.stringify(artifacts.index?.nonsinglesProducts || {}), 'utf8');
  await fs.writeFile(path.join(indexDir, 'names.json'), JSON.stringify(artifacts.index?.names || {}), 'utf8');
  await fs.writeFile(path.join(indexDir, 'tracker.json'), JSON.stringify(artifacts.index?.tracker || { bySetId: {}, byPtcgoCode: {}, bySetName: {} }), 'utf8');

  await Promise.all(
    Object.entries(artifacts.sets).map(([expansionKey, payload]) =>
      fs.writeFile(path.join(setsDir, `${expansionKey}.json`), JSON.stringify(payload), 'utf8')
    )
  );
}

/**
 * Loads the tcgdex sets-master.json and builds a lookup map:
 *   tcgdexSetId (e.g. "ecard3") → cardmarketSetId (e.g. "1538")
 *
 * This is the authoritative primary matching source for tracker set resolution.
 * Only entries with a non-null cardmarketSetId are included.
 */
export async function loadTcgdexSetToCardmarketMap(repoRoot) {
  const setsMasterPath = path.join(repoRoot, 'scripts', 'cardmarket', 'helpers', 'tcgdex-data', 'sets-master.json');
  try {
    const raw = await fs.readFile(setsMasterPath, 'utf8');
    const data = JSON.parse(raw);
    const sets = Array.isArray(data?.sets) ? data.sets : [];
    const idMap = {};
    const nameMap = {};
    for (const set of sets) {
      const tcgdexId = String(set?.tcgdexSetId || '').trim();
      const cardmarketId = set?.cardmarketSetId;
      if (tcgdexId && cardmarketId != null) {
        idMap[tcgdexId] = String(Number(cardmarketId));
      }
      const enName = normalizeMatcherText(set?.name?.en || '');
      if (enName && cardmarketId != null) {
        const cmId = String(Number(cardmarketId));
        if (!nameMap[enName]) {
          nameMap[enName] = cmId;
        }
      }
    }
    return { idMap, nameMap };
  } catch {
    return { idMap: {}, nameMap: {} };
  }
}
