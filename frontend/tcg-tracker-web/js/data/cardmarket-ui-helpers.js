import {
  buildCardmarketProductUrl,
  isGeneratedCardmarketSearchUrl,
  isGeneratedCardmarketUrl,
  resolveCardmarketProductId,
} from './cardmarket-url-utils.js';
import { isLocalDevEnvironment } from '../core/dev-environment.js';

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

export { buildCardmarketProductUrl, isGeneratedCardmarketSearchUrl, isGeneratedCardmarketUrl };

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
export function buildCardmarketImageUrl({ cardmarketProductId, categoryId, setCode, proxyUrl } = {}) {
  const productId = String(cardmarketProductId || '').trim();
  const category = String(categoryId ?? '').trim();
  const code = String(setCode || '').trim().toUpperCase();
  if (!/^\d+$/.test(productId)) return '';
  if (!/^\d+$/.test(category)) return '';
  if (!code) return '';
  const proxyBase = String(proxyUrl || '').trim().replace(/\/$/, '');
  if (proxyBase && isLocalDevEnvironment()) {
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

// Namensschluessel fuer den Matcher: exakter Vergleich, Suffixe (ex, EX, GX, V, VMAX, VSTAR, BREAK, LEGEND,
// Prime, LV.X, Radiant, Mega/M, ★, δ ...) bleiben Teil des Namens. Zeichen ohne Buchstaben werden zu Woertern,
// damit sie nicht beim Normalisieren verschwinden ("Umbreon ★" != "Umbreon").
const NAME_SYMBOL_WORDS = [
  [/♀|&female;/g, ' F '],
  [/♂|&male;/g, ' M '],
  [/★/g, ' star '],
  [/δ/g, ' delta '],
  [/α/g, ' alpha '],
  [/β/g, ' beta '],
  [/γ/g, ' gamma '],
  [/Ω/g, ' omega '],
];

function toNameKey(value = '') {
  let text = String(value || '');
  for (const [pattern, word] of NAME_SYMBOL_WORDS) text = text.replace(pattern, word);
  return normalizeMatcherText(text)
    .replace(/\bdelta(?: delta)+\b/g, 'delta')
    .replace(/^basic (.+ energy)$/, '$1');
}

// Kurze Klammerzusaetze ("Unown [J]", Cardmarket "Nidoran [F]", "[4]") gehoeren zum Namen.
const SHORT_BRACKET = /\[([^\]|]{1,2})\]/g;

/** Namensschluessel einer Karte (vera_name/tcgdex_name/name). */
export function normalizeCardNameKey(name = '') {
  return toNameKey(String(name || '').replace(SHORT_BRACKET, ' $1 '));
}

/**
 * Namensschluessel eines Cardmarket-Produkts: nur die Attacken-Klammer "[Attacke | Attacke]" faellt weg,
 * ausserdem die Stufe "Lv.40" (Karten-Namen fuehren sie nicht). "Gold Star" = ★, "Delta Species" = δ,
 * "MVenusaur EX" = "M Venusaur-EX", "Basic Grass Energy" = "Grass Energy", "&female;"/"&male;" = ♀/♂.
 */
export function normalizeCardmarketProductNameKey(name = '') {
  return toNameKey(String(name || '')
    .replace(SHORT_BRACKET, ' $1 ')
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/\bLv\.?\s*\d+\b/gi, ' ')
    .replace(/\bGold Star\b/gi, ' star ')
    .replace(/\bDelta Species\b/gi, ' delta ')
    .replace(/\bM(?=[A-Z][a-z])/g, 'M '));
}

const productNameKeyCache = new WeakMap();
function productNameKey(entry) {
  if (!entry || typeof entry !== 'object') return normalizeCardmarketProductNameKey('');
  if (!productNameKeyCache.has(entry)) productNameKeyCache.set(entry, normalizeCardmarketProductNameKey(entry.name));
  return productNameKeyCache.get(entry);
}

function extractPreferredCardNames(card = {}) {
  return Array.from(new Set(
    [card?.vera_name, card?.tcgdex_name, card?.name]
      .map((value) => normalizeCardNameKey(value))
      .filter(Boolean)
  ));
}

function entryMatchesAnyCardName(entry = {}, normalizedCardNames = []) {
  if (!Array.isArray(normalizedCardNames) || !normalizedCardNames.length) return false;
  const key = productNameKey(entry);
  return Boolean(key) && normalizedCardNames.includes(key);
}

function normalizeCollectorNumber(value = '') {
  return String(value || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '')
    .trim();
}

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

export function inferCardmarketExpansionIdFromCards(cards = [], productIndex = {}, { nameIndex = null, trackerSetIndex = null, resolveSetById = null, currentSetId = '', v3ExpansionId = '' } = {}) {
  // api/v3 sets.json ids.cardmarket ist massgeblich; Tracker-Index und Abstimmung nur als Fallback.
  const v3Expansion = String(v3ExpansionId ?? '').trim();
  if (/^\d+$/.test(v3Expansion) && Number(v3Expansion) > 0) return v3Expansion;

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
      const normalizedNames = [card?.name, card?.vera_name, card?.tcgdex_name]
        .map((value) => normalizeMatcherText(value))
        .filter(Boolean);

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
    if (entryMatchesAnyCardName(collectorMatched[0], normalizedCardNames)) {
      return collectorMatched[0];
    }
  } else if (collectorMatched.length === 1 && !normalizedCardNames.length) {
    return collectorMatched[0];
  }

  // 2. Name-based candidate pool (fallback when collector is ambiguous or absent)
  if (!normalizedCardNames.length) return null;

  const candidatePool = cards.filter((entry) => entryMatchesAnyCardName(entry, normalizedCardNames));
  if (!candidatePool.length) return null;
  if (candidatePool.length === 1) return candidatePool[0];

  // 3. Collector disambiguation within name pool
  if (collectorMatched.length > 1) {
    const nameFilteredCollectors = collectorMatched.filter((entry) => entryMatchesAnyCardName(entry, normalizedCardNames));
    if (nameFilteredCollectors.length === 1) return nameFilteredCollectors[0];
  }

  if (!Array.isArray(sourceCards) || sourceCards.length < 2) {
    return candidatePool[0];
  }

  const matchingSourceCards = sourceCards.filter((sourceCard) => {
    const sourceNames = extractPreferredCardNames(sourceCard);
    return sourceNames.some((name) => normalizedCardNames.includes(name));
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

function cardCollectorKeyOf(card = {}) {
  return normalizeCollectorKey(card?.collectorNumber || card?.number || card?.vera_number || card?.tcgdex_number || '');
}

function entryCollectorKeyOf(entry = {}) {
  return normalizeCollectorKey(entry?.collectorNumber || entry?.number || entry?.cardNumber || '');
}

/**
 * Ordnet Karten ohne v3-ID Produkten einer Cardmarket-Setdatei zu (Map card -> entry).
 *  0. Karten mit v3-ID belegen ihr Produkt (und nehmen sonst nicht teil) - der Matcher ueberschreibt nie v3.
 *  1. Sammlernummer + exakter Name (Suffixe zaehlen, nur die Attacken-Klammer faellt weg).
 *  2. Exakter Name ohne Nummer (Cardmarket fuehrt collectorNumber oft nicht): nur wenn genau ein Produkt
 *     passt UND genau eine offene Karte dieses Produkt beansprucht. Mehrdeutig -> keine Zuordnung
 *     (lieber kein Link als ein falscher). Produkte mit abweichender Nummer scheiden aus.
 */
export function buildSetCardAssignmentMap(sourceCards = [], setPayload = {}) {
  const payloadCards = Array.isArray(setPayload?.cards) ? setPayload.cards : [];
  if (!payloadCards.length || !Array.isArray(sourceCards) || !sourceCards.length) {
    return new Map();
  }

  const result = new Map();
  const assigned = new Set();
  const isAvailable = (entry) => !assigned.has(entry);
  const assign = (card, entry) => {
    result.set(card, entry);
    assigned.add(entry);
  };

  // 0. v3-IDs
  const entriesById = new Map();
  payloadCards.forEach((entry) => {
    const id = String(entry?.cardmarketProductId ?? '').trim();
    if (id && !entriesById.has(id)) entriesById.set(id, entry);
  });
  const pending = [];
  for (const card of sourceCards) {
    const { productId, source } = resolveCardmarketProductId(card);
    if (source !== 'v3') {
      pending.push(card);
      continue;
    }
    const entry = entriesById.get(productId);
    // Mehrere Karten koennen dieselbe v3-ID tragen (geteilte Produkte): alle bekommen es.
    if (entry) assign(card, entry);
  }

  // 1. Sammlernummer + Name
  const open = [];
  for (const card of pending) {
    const names = extractPreferredCardNames(card);
    if (!names.length) continue;
    const collectorKey = cardCollectorKeyOf(card);
    if (collectorKey) {
      const byNumber = [];
      payloadCards.forEach((entry, index) => {
        if (isAvailable(entry) && entryCollectorKeyOf(entry) === collectorKey && entryMatchesAnyCardName(entry, names)) {
          byNumber.push(index);
        }
      });
      if (byNumber.length) {
        // Gleiche Nummer + gleicher Name mehrfach (Stempel-/Sonderdrucke): kleinste ID je metacard-Gruppe.
        assign(card, payloadCards[pickSmallestIdPerMetacardGroup(byNumber, payloadCards)]);
        continue;
      }
    }
    open.push({ card, names, collectorKey });
  }

  // 2. Eindeutiger Name
  const claims = new Map();
  open.forEach((item) => {
    item.candidates = payloadCards.filter((entry) => {
      if (!isAvailable(entry) || !entryMatchesAnyCardName(entry, item.names)) return false;
      const entryKey = entryCollectorKeyOf(entry);
      return !entryKey || !item.collectorKey || entryKey === item.collectorKey;
    });
    item.candidates.forEach((entry) => claims.set(entry, (claims.get(entry) || 0) + 1));
  });
  open.forEach(({ card, candidates }) => {
    if (candidates.length === 1 && claims.get(candidates[0]) === 1) assign(card, candidates[0]);
  });

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
  signal,
  forceRefresh = false,
} = {}) {
  if (!Array.isArray(cards) || !cards.length) return Array.isArray(cards) ? cards : [];

  // v3-Produkt-IDs sind massgeblich und werden nie vom Matcher ueberschrieben.
  const hasV3ProductId = (card) => resolveCardmarketProductId(card).source === 'v3';
  const needsPromotion = cards.some((card) => !hasV3ProductId(card) && isGeneratedCardmarketUrl(getCardmarketUrlFromCard(card)));
  const hasDuplicateSourceNames = (() => {
    const counts = new Map();
    cards.forEach((card) => {
      const preferred = extractPreferredCardNames(card)[0] || '';
      if (!preferred) return;
      counts.set(preferred, (counts.get(preferred) || 0) + 1);
    });
    return Array.from(counts.values()).some((count) => count > 1);
  })();

  if (!needsPromotion && !hasDuplicateSourceNames) return cards;

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
    const isGeneratedUrl = !hasV3ProductId(card) && isGeneratedCardmarketUrl(currentUrl);
    const shouldReconcileDirectUrl = !isGeneratedUrl && !hasV3ProductId(card) && hasDuplicateSourceNames;
    if (!isGeneratedUrl && !shouldReconcileDirectUrl) return card;

    const matchedEntry = assignmentMap.get(card) ?? null;
    const directUrl = buildCardmarketProductUrl(matchedEntry?.cardmarketProductId);

    // If matching failed for a generated URL, remove the stale URL rather than keeping the wrong one
    if (!directUrl) {
      if (isGeneratedUrl) {
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
    // Karte zeigt schon auf den getroffenen Eintrag.
    if (currentProductId && matchedProductId && currentProductId === matchedProductId) return card;

    return {
      ...card,
      cardmarketUrl: directUrl,
      vera_cardmarket_url: directUrl,
      tcgdex_cardmarket_url: directUrl,
      // Herkunft Matcher: eigenes Feld, cardmarketProductId bleibt v3-IDs vorbehalten.
      cardmarketMatchedProductId: Number(matchedEntry?.cardmarketProductId || 0) || null,
      cardmarketResolvedName: String(matchedEntry?.name || '').trim(),
    };
  });
}
