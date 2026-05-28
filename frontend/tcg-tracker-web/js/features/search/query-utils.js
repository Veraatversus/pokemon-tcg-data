import { normalizeCardNumber } from '../../core/utils.js?v=20260427-wave3-central-v1';

const SEARCH_NOISE_TOKENS = new Set([
  'karte', 'karten', 'kartennummer', 'kartennr', 'nummer', 'nr', 'no', 'num',
  'pokemon', 'pokemontcg', 'tcg', 'set', 'im', 'in', 'von', 'die', 'der', 'das'
]);

export function normalizeSearchText(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

export function sanitizeSearchToken(token) {
  return normalizeSearchText(token).replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, '');
}

export function extractMeaningfulNameTokens(tokens = []) {
  return tokens
    .map((token) => sanitizeSearchToken(token))
    .filter((token) => token && token.length >= 2)
    .filter((token) => !SEARCH_NOISE_TOKENS.has(token));
}

export function normalizeCardNumberForSearch(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return '';
  const withoutTotal = raw.split('/')[0];
  return normalizeCardNumber(withoutTotal).toLowerCase();
}

export function cardNumberMatchesQuery(cardNumber, queryNumber) {
  const normalizedCard = normalizeCardNumberForSearch(cardNumber);
  const normalizedQuery = normalizeCardNumberForSearch(queryNumber);
  if (!normalizedCard || !normalizedQuery) return false;
  if (normalizedCard === normalizedQuery) return true;

  const cardDigits = (normalizedCard.match(/\d+/) || [''])[0];
  const queryDigits = (normalizedQuery.match(/\d+/) || [''])[0];
  return Boolean(queryDigits && cardDigits === queryDigits);
}

export function collectSearchStrings(values = []) {
  const seen = new Set();
  const result = [];

  const visit = (value) => {
    if (value == null) return;
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (typeof value === 'object') {
      Object.values(value).forEach(visit);
      return;
    }

    const raw = String(value || '').trim();
    if (!raw || /^https?:\/\//i.test(raw)) return;
    const normalized = normalizeSearchText(raw).replace(/\s+/g, ' ').trim();
    if (!normalized || seen.has(normalized)) return;
    seen.add(normalized);
    result.push(normalized);
  };

  values.forEach(visit);
  return result;
}

export function matchesTokensInValues(tokens = [], values = []) {
  if (!tokens.length) return false;
  return tokens.every((token) => values.some((value) => value.includes(token)));
}

export function parseStructuredSearchQuery(rawQuery, availableSets = []) {
  const trimmedQuery = String(rawQuery || '').trim();
  if (!trimmedQuery) return null;

  const normalizedQuery = trimmedQuery.replace(/^\(+|\)+$/g, '').trim();
  if (!normalizedQuery) return null;

  const parts = normalizedQuery.split(/\s+/).filter(Boolean);
  if (!parts.length) return null;

  const requestedCode = parts[0].toLowerCase();
  const matchingSet = availableSets.find((set) =>
    (set?.ptcgoCode && String(set.ptcgoCode).toLowerCase() === requestedCode) ||
    String(set?.setId || '').toLowerCase() === requestedCode
  );
  if (!matchingSet) return null;

  const remaining = parts.slice(1);
  let cardNumber = '';
  const nameTokens = [];
  for (const part of remaining) {
    const token = sanitizeSearchToken(part);
    if (!token) continue;
    if (!cardNumber && /^[a-z._-]*\d+[a-z._-]*$/.test(token)) {
      cardNumber = normalizeCardNumberForSearch(token);
    } else {
      nameTokens.push(token);
    }
  }
  const meaningfulNameTokens = extractMeaningfulNameTokens(nameTokens);
  return {
    set: matchingSet,
    setId: String(matchingSet.setId),
    cardNumber,
    namePart: meaningfulNameTokens.length ? meaningfulNameTokens : null
  };
}

export function parseMixedQuery(rawQuery) {
  const normalized = normalizeSearchText(rawQuery).trim();
  if (!normalized) return null;

  const parts = normalized
    .split(/\s+/)
    .map((part) => sanitizeSearchToken(part))
    .filter(Boolean);
  if (parts.length < 2) return null;

  const hasSetLikeMarker = parts.some((token) => token === 'set' || token === 'series' || token === 'serie');
  if (hasSetLikeMarker) return null;

  const numberTokens = parts.filter((p) => /^[a-z._-]*\d+[a-z._-]*$/.test(p));
  const nameTokensRaw = parts.filter((p) => !/^[a-z._-]*\d+[a-z._-]*$/.test(p));
  const nameTokens = extractMeaningfulNameTokens(nameTokensRaw);

  if (!nameTokens.length || !numberTokens.length) return null;

  return {
    cardNumber: normalizeCardNumberForSearch(numberTokens[0]),
    nameTokens
  };
}