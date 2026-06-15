const DEFAULT_REMOTE_CARDMARKET_BASE = 'https://veraatversus.github.io/pokemon-tcg-data/cardmarket';

export function isLocalOrigin(origin = '') {
  return /^https?:\/\/(localhost|127\.0\.0\.1)(?::\d+)?$/i.test(String(origin || '').trim());
}

export function getCardmarketBaseUrl({ origin = globalThis?.location?.origin, remoteBase = DEFAULT_REMOTE_CARDMARKET_BASE } = {}) {
  const normalizedOrigin = String(origin || '').trim().replace(/\/$/, '');
  if (isLocalOrigin(normalizedOrigin)) {
    return `${normalizedOrigin}/cardmarket`;
  }
  return String(remoteBase || DEFAULT_REMOTE_CARDMARKET_BASE).trim().replace(/\/$/, '');
}

export function extractCardmarketProductId(url = '') {
  const text = String(url || '').trim();
  if (!text) return '';

  const queryMatch = text.match(/[?&]idProduct=(\d+)/i);
  if (queryMatch) return queryMatch[1];

  const pathMatch = text.match(/\/(\d+)(?:[/?#]|$)/);
  return pathMatch ? pathMatch[1] : '';
}

export function getCardmarketUrlFromCard(card = {}) {
  return String(card?.cardmarketUrl || card?.vera_cardmarket_url || card?.tcgdex_cardmarket_url || '').trim();
}

export function isGeneratedCardmarketSearchUrl(url = '') {
  const value = String(url || '').trim().toLowerCase();
  return (value.includes('cardmarket.com') && value.includes('/products/search') && value.includes('searchstring=')) || (value.includes('cardmarket.com') && value.includes('/pokemon/products') && value.includes('idproduct='));
}

export function buildCardmarketProductUrl(productId, { language = 'de' } = {}) {
  const normalizedProductId = String(productId || '').trim();
  if (!/^\d+$/.test(normalizedProductId)) return '';
  const normalizedLanguage = String(language || 'de').trim().toLowerCase() || 'de';
  return `https://www.cardmarket.com/${encodeURIComponent(normalizedLanguage)}/Pokemon/Products?idProduct=${normalizedProductId}`;
}

// Builds the official Cardmarket product image URL.
// URL pattern: https://product-images.s3.cardmarket.com/{categoryId}/{setCode}/{productId}/{productId}.jpg
// setCode is the upper-cased ptcgoCode (e.g. "CRI" for "cri"). categoryId and productId
// come from the matched Cardmarket setPayload entry.
//
// When `proxyUrl` is provided AND the runtime is in a local-dev environment,
// the URL is built as a same-origin proxy request — see
// `scripts/dev-cardmarket-proxy.mjs`. The proxy bypasses CloudFront's hotlink
// Referer check (which the browser cannot spoof from JS). Production builds
// ignore `proxyUrl` entirely so the function always returns the direct S3 URL.
//
// The lib copy is a pure-data helper used by the build scripts. It does not
// perform the env check; the build runs locally so proxy support is always
// honoured here.
export function buildCardmarketImageUrl({ cardmarketProductId, categoryId, setCode, proxyUrl } = {}) {
  const productId = String(cardmarketProductId || '').trim();
  const category = String(categoryId ?? '').trim();
  const code = String(setCode || '').trim().toUpperCase();
  if (!/^\d+$/.test(productId)) return '';
  if (!/^\d+$/.test(category)) return '';
  if (!code) return '';
  const proxyBase = String(proxyUrl || '').trim().replace(/\/$/, '');
  if (proxyBase) {
    const params = new URLSearchParams({ productId, categoryId: category, setCode: code });
    return `${proxyBase}/cardmarket-image-proxy?${params.toString()}`;
  }
  return `https://product-images.s3.cardmarket.com/${category}/${code}/${productId}/${productId}.jpg`;
}

export function resolveCardmarketEntryFromSetPayload(setPayload = {}, productId = '') {
  const normalizedProductId = String(productId || '').trim();
  if (!normalizedProductId) return null;

  const cards = Array.isArray(setPayload?.cards) ? setPayload.cards : [];
  return cards.find((entry) => String(entry?.cardmarketProductId || '').trim() === normalizedProductId) || null;
}

function normalizeMatcherText(value = '') {
  return String(value || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function extractEntryBaseName(value = '') {
  return String(value || '').split('[')[0].trim();
}

function extractEntryHintTokens(value = '') {
  const tokens = [];
  const matches = String(value || '').match(/\[([^\]]+)\]/g) || [];
  matches.forEach((chunk) => {
    const inner = String(chunk || '').replace(/^\[/, '').replace(/\]$/, '');
    inner
      .split('|')
      .map((token) => normalizeMatcherText(token))
      .filter(Boolean)
      .forEach((token) => tokens.push(token));
  });
  return tokens;
}

function extractCardHintTokens(card = {}) {
  const tokens = new Set();
  const add = (value) => {
    const normalized = normalizeMatcherText(value);
    if (normalized) tokens.add(normalized);
  };

  (Array.isArray(card?.vera_abilities) ? card.vera_abilities : []).forEach((ability) => {
    add(ability?.name);
  });
  (Array.isArray(card?.vera_attacks) ? card.vera_attacks : []).forEach((attack) => {
    add(attack?.name);
  });

  return Array.from(tokens);
}

function normalizeCollectorNumber(value = '') {
  return String(value || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '')
    .trim();
}

/**
 * Strips leading zeros from each numeric segment of a collector number,
 * producing a canonical key that treats H09 == H9, 009 == 9, A001 == A1.
 * Non-numeric segments (letters) are preserved as-is.
 */
function normalizeCollectorKey(value = '') {
  const normalized = normalizeCollectorNumber(value);
  if (!normalized) return '';
  return normalized.replace(/0+(\d+)/g, '$1');
}

function normalizeCollectorNumeric(value = '') {
  const normalized = normalizeCollectorNumber(value);
  if (!/^\d+$/.test(normalized)) return '';
  return String(Number(normalized));
}

export function entryCollectorMatchesCard(entry = {}, card = {}) {
  const cardCollectors = [card?.number, card?.collectorNumber, card?.vera_number, card?.tcgdex_number]
    .map((value) => String(value || '').trim())
    .filter(Boolean);
  if (!cardCollectors.length) return false;

  const entryCollectors = [entry?.collectorNumber, entry?.number, entry?.cardNumber]
    .map((value) => String(value || '').trim())
    .filter(Boolean);
  if (!entryCollectors.length) return false;

  const normalizedCard = cardCollectors.map(normalizeCollectorNumber).filter(Boolean);
  const normalizedCardKey = cardCollectors.map(normalizeCollectorKey).filter(Boolean);
  const normalizedCardNumeric = cardCollectors.map(normalizeCollectorNumeric).filter(Boolean);
  const normalizedEntry = entryCollectors.map(normalizeCollectorNumber).filter(Boolean);
  const normalizedEntryKey = entryCollectors.map(normalizeCollectorKey).filter(Boolean);
  const normalizedEntryNumeric = entryCollectors.map(normalizeCollectorNumeric).filter(Boolean);

  return normalizedCard.some((value) => normalizedEntry.includes(value))
    || normalizedCardKey.some((value) => normalizedEntryKey.includes(value))
    || normalizedCardNumeric.some((value) => normalizedEntryNumeric.includes(value));
}

function resolveByCardHints(card = {}, candidatePool = []) {
  const cardHints = extractCardHintTokens(card);
  if (!cardHints.length || candidatePool.length < 2) return null;

  let bestEntry = null;
  let bestScore = 0;
  let tie = false;

  candidatePool.forEach((entry) => {
    const entryHints = extractEntryHintTokens(entry?.name || '');
    if (!entryHints.length) return;
    const score = cardHints.reduce((acc, hint) => acc + (entryHints.includes(hint) ? 1 : 0), 0);
    if (score <= 0) return;
    if (score > bestScore) {
      bestEntry = entry;
      bestScore = score;
      tie = false;
    } else if (score === bestScore) {
      tie = true;
    }
  });

  if (!bestEntry || tie) return null;
  return bestEntry;
}

function resolveByRarityPriceProfile(card = {}, candidatePool = []) {
  if (candidatePool.length < 2) return null;
  const rarity = normalizeMatcherText(card?.rarity || card?.vera_rarity || card?.tcgdex_rarity || '');
  if (!rarity) return null;

  const withTrend = candidatePool
    .map((entry) => ({ entry, trend: toFinitePrice(entry?.prices?.trend) }))
    .filter((item) => item.trend != null);
  if (withTrend.length < 2) return null;

  const isHolo = rarity.includes('holo');
  const sorted = [...withTrend].sort((left, right) => left.trend - right.trend);
  return isHolo ? sorted[sorted.length - 1].entry : sorted[0].entry;
}

function namesLooselyOverlap(left = '', right = '') {
  const a = normalizeMatcherText(left);
  const b = normalizeMatcherText(right);
  if (!a || !b) return false;
  return a === b || a.includes(b) || b.includes(a);
}

function extractPreferredCardNames(card = {}) {
  return Array.from(new Set(
    [card?.vera_name, card?.tcgdex_name, card?.name]
      .map((value) => normalizeMatcherText(value))
      .filter(Boolean)
  ));
}

function extractPreferredSetNames(card = {}) {
  // Set name fields (vera_set_name, tcgdex_set_name, setName, set_name) are SET-level
  // properties, not CARD-level. They do not exist on the card schema (see CARD_DB_HEADERS
  // in schema-contract.js). The set name is sourced from the set record via resolveSetById
  // (see Phase 1c in inferCardmarketExpansionIdFromCards). This function is kept for
  // backward-compat with any external callers; it intentionally returns an empty array
  // because real cards have no set-name fields.
  void card;
  return [];
}

function entryMatchesAnyCardName(entry = {}, normalizedCardNames = []) {
  if (!Array.isArray(normalizedCardNames) || !normalizedCardNames.length) return false;

  const normalizedEntryName = normalizeMatcherText(extractEntryBaseName(entry?.name || ''));
  if (!normalizedEntryName) return false;

  if (normalizedCardNames.includes(normalizedEntryName)) return true;

  return normalizedCardNames.some((normalizedCardName) => (
    normalizedEntryName.includes(normalizedCardName) || normalizedCardName.includes(normalizedEntryName)
  ));
}

function normalizeCodeKey(value = '') {
  return normalizeMatcherText(value).replace(/\s+/g, '');
}

function extractPotentialPtcgoCodes(cards = []) {
  const codes = new Set();

  cards.forEach((card) => {
    const url = getCardmarketUrlFromCard(card);
    const match = String(url || '').match(/searchString=([^&#]+)/i);
    if (!match?.[1]) return;

    try {
      const decoded = decodeURIComponent(match[1]).replace(/\+/g, ' ');
      const firstToken = String(decoded).trim().split(/\s+/)[0] || '';
      const normalized = normalizeCodeKey(firstToken);
      if (normalized) codes.add(normalized);
    } catch {
      // ignore malformed search urls
    }
  });

  return Array.from(codes);
}

function extractPotentialSetNameKeys(cards = []) {
  // Returns an empty array. Set name fields (vera_set_name, tcgdex_set_name, setName,
  // set_name) are SET-level properties, not CARD-level. Cards do not carry them. The
  // set name lookup uses the set record via resolveSetById (see Phase 1c). Kept as a
  // no-op for backward-compat.
  void cards;
  return [];
}

function normalizeForTrackerBySetId(value = '') {
  return String(value || '').replace(/^TCGDEX-/i, '').trim().toLowerCase();
}

function resolveSetLookupCandidates({ cards = [], currentSetId = '', resolveSetById = null } = {}) {
  const candidates = [];
  const seen = new Set();

  const push = (setId, source) => {
    const normalized = normalizeForTrackerBySetId(setId);
    if (!normalized) return;
    const key = `${normalized}::${source}`;
    if (seen.has(key)) return;
    seen.add(key);
    candidates.push({ setId: normalized, source });
  };

  push(currentSetId, 'currentSetId');

  if (typeof resolveSetById === 'function') {
    push(currentSetId, 'resolveSetById-currentSetId');
    (Array.isArray(cards) ? cards : []).forEach((card) => {
      push(card?.setId, 'resolveSetById-cardSetId');
    });
  } else {
    (Array.isArray(cards) ? cards : []).forEach((card) => {
      push(card?.setId, 'cardSetId');
    });
  }

  return candidates;
}

export function inferCardmarketExpansionIdFromCards(cards = [], productIndex = {}, { nameIndex = null, trackerSetIndex = null, resolveSetById = null, currentSetId = '' } = {}) {
  if (!Array.isArray(cards) || !cards.length) {
    return '';
  }

  // Phase 0: Resolve expansion directly from the set when a set resolver is available.
  // This is the most reliable path: state.sets / sets/en.json carry canonical setId + ptcgoCode + name
  // that don't depend on stale URL/DB state. It wins over URL-voting.
  //
  // Lookup precedence: setId (bySetId) > ptcgoCode (byPtcgoCode) > name (bySetName).
  // setId is the most stable identifier (rarely changes, uniquely identifies an expansion),
  // ptcgoCode is short but can shift between releases, name is the most volatile.
  if (trackerSetIndex && typeof trackerSetIndex === 'object') {
    const setCandidates = resolveSetLookupCandidates({ cards, currentSetId, resolveSetById });

    for (const { setId } of setCandidates) {
      // 1) setId → bySetId (highest trust)
      const directExpansionId = String(trackerSetIndex?.bySetId?.[setId] || '').trim();
      if (directExpansionId) return directExpansionId;

      const setRecord = typeof resolveSetById === 'function' ? resolveSetById(setId) : null;
      if (setRecord) {
        // 2) set.ptcgoCode → byPtcgoCode
        const ptcgoCode = normalizeCodeKey(setRecord?.ptcgoCode || setRecord?.code || '');
        if (ptcgoCode) {
          const expansionId = String(trackerSetIndex?.byPtcgoCode?.[ptcgoCode] || '').trim();
          if (expansionId) return expansionId;
        }
        // 3) set.name → bySetName
        const setNameKey = normalizeMatcherText(setRecord?.name || '');
        if (setNameKey) {
          const expansionId = String(trackerSetIndex?.bySetName?.[setNameKey] || '').trim();
          if (expansionId) return expansionId;
        }
      }
    }
  }

  const counts = new Map();

  // Phase 1: Tracker-first voting. Tracker index entries (bySetId, byPtcgoCode, bySetName)
  // are the authoritative source — built from our DB (sets/en.json + tcgdex-helper).
  // They get HIGH weight so they win over productIndex (built from Cardmarket's auto-feed,
  // which can be wrong for cross-set listings).
  if (trackerSetIndex && typeof trackerSetIndex === 'object') {
    // 1a. bySetId: each card's setId → bySetId lookup
    const setIds = Array.from(new Set(
      cards.map((card) => normalizeForTrackerBySetId(card?.setId)).filter(Boolean)
    ));
    setIds.forEach((setId) => {
      const expansionId = String(trackerSetIndex?.bySetId?.[setId] || '').trim();
      if (!expansionId) return;
      counts.set(expansionId, (counts.get(expansionId) || 0) + Math.max(cards.length * 2, 10));
    });

    // 1b. byPtcgoCode: priority order is
    //     1. setRecord.ptcgoCode via resolveSetById (the canonical set code from the DB)
    //     2. URL-extracted ptcgoCode from searchString (final fallback)
    // Per-card ptcgoCode is NOT consulted because cards do not carry this field —
    // the CARD_DB_HEADERS schema in schema-contract.js confirms it. The set-level
    // ptcgoCode is canonical and is reached via the resolver.
    const ptcgoCodes = [];
    const seenPtcgo = new Set();
    const addPtcgo = (code) => {
      const normalized = normalizeCodeKey(code);
      if (!normalized || seenPtcgo.has(normalized)) return;
      seenPtcgo.add(normalized);
      ptcgoCodes.push(normalized);
    };
    if (typeof resolveSetById === 'function' && currentSetId) {
      const setRecord = resolveSetById(currentSetId);
      if (setRecord) {
        addPtcgo(setRecord.ptcgoCode);
        addPtcgo(setRecord.code);
      }
    }
    extractPotentialPtcgoCodes(cards).forEach(addPtcgo);

    ptcgoCodes.forEach((code) => {
      const expansionId = String(trackerSetIndex?.byPtcgoCode?.[code] || '').trim();
      if (!expansionId) return;
      counts.set(expansionId, (counts.get(expansionId) || 0) + Math.max(cards.length * 2, 10));
    });

    // 1c. bySetName: only via setRecord.name (the resolver).
    //     Per-card set name fields do not exist (set-level properties), so we don't
    //     scan cards here. Used as a soft fallback when neither setId nor ptcgoCode
    //     matched.
    const setNameKeys = new Set();
    if (typeof resolveSetById === 'function' && currentSetId) {
      const setRecord = resolveSetById(currentSetId);
      const setNameKey = normalizeMatcherText(setRecord?.name || '');
      if (setNameKey) setNameKeys.add(setNameKey);
    }

    setNameKeys.forEach((setNameKey) => {
      const expansionId = String(trackerSetIndex?.bySetName?.[setNameKey] || '').trim();
      if (!expansionId) return;
      counts.set(expansionId, (counts.get(expansionId) || 0) + Math.max(cards.length, 5));
    });
  }

  // Phase 2: ProductIndex voting. URL → productIndex is the LOWEST priority —
  // only used as a last-resort fallback when the tracker has no answer.
  cards.forEach((card) => {
    const productId = extractCardmarketProductId(getCardmarketUrlFromCard(card));
    if (!productId) return;

    const expansionId = String(productIndex?.[productId]?.expansionId || '').trim();
    if (!expansionId) return;

    counts.set(expansionId, (counts.get(expansionId) || 0) + 1);
  });

  const highestDirectCount = counts.size ? Math.max(...counts.values()) : 0;

  const highestCount = counts.size ? Math.max(...counts.values()) : 0;
  if ((!counts.size || highestCount < 2) && nameIndex && typeof nameIndex === 'object') {
    cards.forEach((card) => {
      const normalizedNames = extractPreferredCardNames(card);

      normalizedNames.forEach((name) => {
        const expansionIds = Array.isArray(nameIndex?.[name]) ? nameIndex[name] : [];
        expansionIds.forEach((expansionId) => {
          const normalizedExpansionId = String(expansionId || '').trim();
          if (!normalizedExpansionId) return;
          counts.set(normalizedExpansionId, (counts.get(normalizedExpansionId) || 0) + 1);
        });
      });
    });
  }

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

export function resolveCardmarketEntryForCardFromSetPayload(card = {}, setPayload = {}, { sourceCards = [] } = {}) {
  const normalizedCardNames = extractPreferredCardNames(card);

  const cards = Array.isArray(setPayload?.cards) ? setPayload.cards : [];
  if (!cards.length) return null;

  // 1. Collector-number-first: try to resolve by collectorNumber across the full set
  const collectorMatched = cards.filter((entry) => entryCollectorMatchesCard(entry, card));
  if (collectorMatched.length === 1 && normalizedCardNames.length) {
    // Single collector match — but verify name matches to avoid cross-name collisions
    // (e.g. card "Arkani #2" should not match entry "Blastoise #2")
    if (entryMatchesAnyCardName(collectorMatched[0], normalizedCardNames)) {
      return collectorMatched[0];
    }
    // Name mismatch: fall through to name-based resolution
  } else if (collectorMatched.length === 1 && !normalizedCardNames.length) {
    return collectorMatched[0];
  }

  // 2. Name-based candidate pool (original primary, now fallback when collector is ambiguous or absent)
  if (!normalizedCardNames.length) return null;

  const candidatePool = cards.filter((entry) => entryMatchesAnyCardName(entry, normalizedCardNames));
  if (!candidatePool.length) return null;
  if (candidatePool.length === 1) return candidatePool[0];

  // 3. Collector disambiguation within name pool (for cases where full-set collector was ambiguous)
  if (collectorMatched.length > 1) {
    const nameFilteredCollectors = collectorMatched.filter((entry) => entryMatchesAnyCardName(entry, normalizedCardNames));
    if (nameFilteredCollectors.length === 1) return nameFilteredCollectors[0];
  }

  const hintMatched = resolveByCardHints(card, candidatePool);
  if (hintMatched) return hintMatched;

  const rarityMatched = resolveByRarityPriceProfile(card, candidatePool);
  if (rarityMatched) return rarityMatched;

  if (!Array.isArray(sourceCards) || sourceCards.length < 2) {
    return candidatePool[0];
  }

  const candidateBaseNames = Array.from(new Set(
    candidatePool
      .map((entry) => normalizeMatcherText(extractEntryBaseName(entry?.name || '')))
      .filter(Boolean)
  ));

  const matchingSourceCards = sourceCards.filter((sourceCard) => {
    const sourceNames = extractPreferredCardNames(sourceCard);
    return sourceNames.some((sourceName) => (
      normalizedCardNames.includes(sourceName)
      || candidateBaseNames.some((baseName) => namesLooselyOverlap(sourceName, baseName))
    ));
  });
  if (!matchingSourceCards.length) return candidatePool[0];

  const sourceOccurrenceIndex = Math.max(0, matchingSourceCards.findIndex((sourceCard) => sourceCard === card));
  return candidatePool[Math.min(sourceOccurrenceIndex, candidatePool.length - 1)] || candidatePool[0];
}

function normalizeNonEmptyMetacardId(value) {
  if (value == null) return null;
  const normalized = String(value).trim();
  if (!normalized) return null;
  const numeric = Number(normalized);
  if (Number.isFinite(numeric)) {
    if (numeric <= 0) return null;
    return String(numeric);
  }
  return normalized;
}

// Picks the index of the entry with the smallest cardmarketProductId from a
// metacardId group. When two entries share a metacardId, only the smallest id
// counts as the "canonical" candidate for that group. Among the resulting
// groups, the smallest id overall wins. This gives a stable, order-independent
// result regardless of how the set payload lists its cards — previously the
// function took the first match in array order, which could be any id.
function pickSmallestIdPerMetacardGroup(candidateIndices, entries) {
  if (!Array.isArray(candidateIndices) || candidateIndices.length === 0) return -1;
  if (candidateIndices.length === 1) return candidateIndices[0];

  const grouped = new Map();
  for (let k = 0; k < candidateIndices.length; k += 1) {
    const i = candidateIndices[k];
    const entry = entries[i];
    const mcId = normalizeNonEmptyMetacardId(entry?.metacardId);
    // Entries ohne metacardId bilden jeweils ihre eigene Gruppe — sie sind
    // nicht zusammenführbar, weil wir sonst zwei unrelated Karten kollabieren.
    const key = mcId !== null ? `mc:${mcId}` : `nomc:${k}`;
    const productId = Number(entry?.cardmarketProductId) || Infinity;
    const existing = grouped.get(key);
    if (existing === undefined || productId < existing.productId) {
      grouped.set(key, { index: i, productId });
    }
  }

  let bestIndex = -1;
  let bestProductId = Infinity;
  for (const { index, productId } of grouped.values()) {
    if (productId < bestProductId) {
      bestIndex = index;
      bestProductId = productId;
    }
  }
  return bestIndex;
}

export function buildSetCardAssignmentMap(sourceCards = [], setPayload = {}) {
  const payloadCards = Array.isArray(setPayload?.cards) ? setPayload.cards : [];
  if (!payloadCards.length || !Array.isArray(sourceCards) || !sourceCards.length) {
    return new Map();
  }

  const availableEntries = [...payloadCards];
  const result = new Map();

  for (const card of sourceCards) {
    const normalizedCardNames = extractPreferredCardNames(card);
    if (!normalizedCardNames.length) continue;

    // 1. Collector-number-first: try to match by collectorNumber before name
    let matchIndex = -1;
    const cardCollectorKey = normalizeCollectorKey(
      card?.collectorNumber || card?.number || card?.vera_number || card?.tcgdex_number || ''
    );
    if (cardCollectorKey) {
      // Collect all collector-key matches
      const keyMatches = [];
      for (let i = 0; i < availableEntries.length; i += 1) {
        const entry = availableEntries[i];
        const entryKey = normalizeCollectorKey(
          entry?.collectorNumber || entry?.number || entry?.cardNumber || ''
        );
        if (entryKey && entryKey === cardCollectorKey) {
          keyMatches.push(i);
        }
      }

      if (keyMatches.length === 1) {
        matchIndex = keyMatches[0];
      } else if (keyMatches.length > 1) {
        // Tiebreak: prefer entries whose name matches the card, then the
        // smallest cardmarketProductId per metacardId group.
        const nameMatches = keyMatches.filter((i) => entryMatchesAnyCardName(availableEntries[i], normalizedCardNames));
        if (nameMatches.length > 0) {
          matchIndex = pickSmallestIdPerMetacardGroup(nameMatches, availableEntries);
        }
        // If no name match among collector candidates, fall through to name-based matching
      }
    }

    // 2. Fallback: name-based match
    if (matchIndex < 0) {
      const nameMatches = [];
      for (let i = 0; i < availableEntries.length; i += 1) {
        if (entryMatchesAnyCardName(availableEntries[i], normalizedCardNames)) {
          nameMatches.push(i);
        }
      }
      if (nameMatches.length > 0) {
        matchIndex = pickSmallestIdPerMetacardGroup(nameMatches, availableEntries);
      }
    }

    if (matchIndex < 0) continue;

    const [assigned] = availableEntries.splice(matchIndex, 1);
    if (!assigned) continue;
    result.set(card, assigned);

    const sourceMetacardId = normalizeNonEmptyMetacardId(
      card?.metacardId
      ?? card?.metaCardId
      ?? card?.cardmarketMetacardId
    );
    if (!sourceMetacardId) continue;

    for (let i = availableEntries.length - 1; i >= 0; i--) {
      const entryMetacardId = normalizeNonEmptyMetacardId(availableEntries[i]?.metacardId);
      if (entryMetacardId && entryMetacardId === sourceMetacardId) {
        availableEntries.splice(i, 1);
      }
    }
  }

  return result;
}

function toFinitePrice(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
}

function formatEuroPrice(value) {
  const numeric = toFinitePrice(value);
  return numeric == null ? '' : `${numeric.toFixed(2).replace('.', ',')} €`;
}

export function formatCardmarketEntryLabel(entry = {}) {
  const prices = entry?.prices || {};
  return formatEuroPrice(
    prices.trend
      ?? prices.avg
      ?? prices.avg1
      ?? prices.avg7
      ?? prices.avg30
      ?? prices.suggested
      ?? prices.low
  );
}

export function formatCardmarketEntryTitle(entry = {}) {
  const prices = entry?.prices || {};
  const parts = [];

  const trend = formatEuroPrice(prices.trend);
  const avg = formatEuroPrice(prices.avg ?? prices.avg30 ?? prices.avg7 ?? prices.avg1);
  const low = formatEuroPrice(prices.low);

  if (trend) parts.push(`Trend ${trend}`);
  if (avg) parts.push(`AVG ${avg}`);
  if (low) parts.push(`Low ${low}`);

  return parts.length ? `Cardmarket: ${parts.join(' · ')}` : 'Cardmarket-Produktseite';
}

export async function promoteCardmarketUrlsForCards(cards = [], {
  productIndex = null,
  setPayload = null,
  nameIndex = null,
  trackerSetIndex = null,
  loadProductIndex = null,
  loadNameIndex = null,
  loadTrackerSetIndex = null,
  loadSetPayload = null,
  resolveSetById = null,
  currentSetId = '',
  setRecord = null,
  proxyUrl = null,
  signal,
  forceRefresh = false,
} = {}) {
  if (!Array.isArray(cards) || !cards.length) return Array.isArray(cards) ? cards : [];

  const needsPromotion = cards.some((card) => isGeneratedCardmarketSearchUrl(getCardmarketUrlFromCard(card)));
  const hasDuplicateSourceNames = (() => {
    const counts = new Map();
    cards.forEach((card) => {
      const preferred = extractPreferredCardNames(card)[0] || '';
      if (!preferred) return;
      counts.set(preferred, (counts.get(preferred) || 0) + 1);
    });
    return Array.from(counts.values()).some((count) => count > 1);
  })();

  // Resolve the setCode for the Cardmarket image URL up front so that the
  // image URL can be published on every card (including those that don't need
  // URL promotion), giving the resolver-matrix a cardmarket source value.
  // Trust order: explicit setRecord.ptcgoCode > tracker.byPtcgoCode[ptcgoCode] verification > card.ptcgoCode.
  // The setCode is the upper-cased ptcgoCode (Cardmarket uses the same short code in product image paths).
  const setCodeFromRecord = String(setRecord?.ptcgoCode || setRecord?.code || '').trim();
  const cardLevelSetCode = String(cards[0]?.ptcgoCode || '').trim();
  const fallbackPtcgoCode = setCodeFromRecord || cardLevelSetCode;
  const trackerPtcgoCodes = trackerSetIndex && typeof trackerSetIndex === 'object'
    ? (trackerSetIndex.byPtcgoCode || {})
    : null;
  const resolvedSetCode = fallbackPtcgoCode && (
    !trackerPtcgoCodes
    || Object.prototype.hasOwnProperty.call(trackerPtcgoCodes, fallbackPtcgoCode.toLowerCase())
    || Object.prototype.hasOwnProperty.call(trackerPtcgoCodes, fallbackPtcgoCode)
  ) ? fallbackPtcgoCode : '';

  if (!needsPromotion && !hasDuplicateSourceNames) {
    // Even when the URL is unchanged we still want to publish cardmarket image metadata
    // for already-aligned cards so the resolver-matrix has a cardmarket source value available.
    if (!resolvedSetCode) return cards;
    let mutated = false;
    const enriched = cards.map((card) => {
      if (!card?.cardmarketProductId) return card;
      const cardmarketImageUrl = buildCardmarketImageUrl({
        cardmarketProductId: card.cardmarketProductId,
        categoryId: card.cardmarketCategoryId,
        setCode: resolvedSetCode
      });
      if (!cardmarketImageUrl || card.cardmarketImageUrl === cardmarketImageUrl) return card;
      mutated = true;
      return {
        ...card,
        cardmarketImageUrl,
        cardmarketSetCode: resolvedSetCode
      };
    });
    return mutated ? enriched : cards;
  }

  let resolvedProductIndex = productIndex;
  let resolvedNameIndex = nameIndex;
  let resolvedTrackerSetIndex = trackerSetIndex;
  let resolvedSetPayload = setPayload;

  if (!resolvedSetPayload) {
    if (!resolvedProductIndex && typeof loadProductIndex === 'function') {
      resolvedProductIndex = await loadProductIndex({ signal, forceRefresh });
    }
    if (!resolvedNameIndex && typeof loadNameIndex === 'function') {
      resolvedNameIndex = await loadNameIndex({ signal, forceRefresh });
    }
    if (!resolvedTrackerSetIndex && typeof loadTrackerSetIndex === 'function') {
      resolvedTrackerSetIndex = await loadTrackerSetIndex({ signal, forceRefresh });
    }

    const expansionId = inferCardmarketExpansionIdFromCards(cards, resolvedProductIndex || {}, {
      nameIndex: resolvedNameIndex,
      trackerSetIndex: resolvedTrackerSetIndex,
      resolveSetById,
      currentSetId,
    });
    if (!expansionId || typeof loadSetPayload !== 'function') return cards;
    resolvedSetPayload = await loadSetPayload(expansionId, { signal, forceRefresh });
  }

  if (!resolvedSetPayload) return cards;

  const assignmentMap = buildSetCardAssignmentMap(cards, resolvedSetPayload);

  return cards.map((card) => {
    const currentUrl = getCardmarketUrlFromCard(card);
    const isSearchFallback = isGeneratedCardmarketSearchUrl(currentUrl);
    const shouldReconcileDirectUrl = !isSearchFallback && hasDuplicateSourceNames;
    if (!isSearchFallback && !shouldReconcileDirectUrl) {
      // Publish cardmarket image metadata on already-aligned cards so the
      // resolver-matrix has a cardmarket source value available.
      if (card?.cardmarketProductId && resolvedSetCode) {
        const cardmarketImageUrl = buildCardmarketImageUrl({
          cardmarketProductId: card.cardmarketProductId,
          categoryId: card.cardmarketCategoryId,
          setCode: resolvedSetCode
        });
        if (cardmarketImageUrl && card.cardmarketImageUrl !== cardmarketImageUrl) {
          return {
            ...card,
            cardmarketImageUrl,
            cardmarketSetCode: resolvedSetCode
          };
        }
      }
      return card;
    }

    const matchedEntry = assignmentMap.get(card) ?? null;
    const directUrl = buildCardmarketProductUrl(matchedEntry?.cardmarketProductId);

    // If matching failed for a generated URL, remove the stale URL rather than keeping the wrong one
    if (!directUrl) {
      if (isSearchFallback) {
        const cleaned = { ...card };
        delete cleaned.cardmarketUrl;
        delete cleaned.vera_cardmarket_url;
        delete cleaned.tcgdex_cardmarket_url;
        return cleaned;
      }
      return card;
    }

    const currentProductId = extractCardmarketProductId(currentUrl);
    const matchedProductId = String(matchedEntry?.cardmarketProductId || '').trim();
    if (currentProductId && matchedProductId && currentProductId === matchedProductId) {
      // Card is already aligned with the matched entry. Still publish cardmarket image
      // metadata so the resolver-matrix has a cardmarket source value.
      if (card?.cardmarketProductId && resolvedSetCode && !card.cardmarketImageUrl) {
        const cardmarketImageUrl = buildCardmarketImageUrl({
          cardmarketProductId: card.cardmarketProductId,
          categoryId: card.cardmarketCategoryId,
          setCode: resolvedSetCode
        });
        if (cardmarketImageUrl) {
          return {
            ...card,
            cardmarketImageUrl,
            cardmarketSetCode: resolvedSetCode
          };
        }
      }
      return card;
    }

    const matchedCategoryId = matchedEntry?.categoryId != null && /^\d+$/.test(String(matchedEntry.categoryId))
      ? Number(matchedEntry.categoryId)
      : null;
    const cardmarketImageUrl = buildCardmarketImageUrl({
      cardmarketProductId: matchedEntry?.cardmarketProductId,
      categoryId: matchedCategoryId,
      setCode: resolvedSetCode
    });

    return {
      ...card,
      cardmarketUrl: directUrl,
      vera_cardmarket_url: directUrl,
      tcgdex_cardmarket_url: directUrl,
      cardmarketProductId: Number(matchedEntry?.cardmarketProductId || 0) || null,
      cardmarketCategoryId: matchedCategoryId,
      cardmarketSetCode: resolvedSetCode || '',
      cardmarketImageUrl,
      cardmarketResolvedName: String(matchedEntry?.name || '').trim(),
    };
  });
}
