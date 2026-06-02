import fs from 'node:fs/promises';
import path from 'node:path';

function normalizeText(value = '') {
  return String(value || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function normalizeCardName(value = '') {
  return normalizeText(String(value || '').split('[')[0].trim());
}

function normalizeCollectorNumber(value = '') {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '');
}

/**
 * Strips leading zeros from each numeric segment of a collector number,
 * producing a canonical key that treats H09 == H9, 009 == 9, A001 == A1.
 */
function normalizeCollectorKey(value = '') {
  const normalized = normalizeCollectorNumber(value);
  if (!normalized) return '';
  return normalized.replace(/0+(\d+)/g, '$1');
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function loadTcgdexHelperSetsByExpansionId({ helpersRootDir } = {}) {
  if (!helpersRootDir) return {};

  const setsDir = path.join(helpersRootDir, 'sets');
  if (!(await fileExists(setsDir))) return {};

  const entries = await fs.readdir(setsDir, { withFileTypes: true });
  const result = {};

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.json')) continue;

    const expansionId = path.basename(entry.name, '.json');
    const fullPath = path.join(setsDir, entry.name);
    const payload = JSON.parse(await fs.readFile(fullPath, 'utf8'));

    if (!Array.isArray(payload?.cards)) continue;
    result[expansionId] = payload;
  }

  return result;
}

function findMatchIndex(helperCard, cards, usedIndexes) {
  if (!helperCard) return -1;

  // 1. Exact cardmarketProductId match (unchanged)
  const helperCardmarketId = Number(helperCard.cardmarketId || 0) || null;
  if (helperCardmarketId !== null) {
    for (let index = 0; index < cards.length; index += 1) {
      if (usedIndexes.has(index)) continue;
      const candidate = cards[index];
      if ((Number(candidate?.cardmarketProductId || 0) || null) === helperCardmarketId) {
        return index;
      }
    }
  }

  const helperNumber = normalizeCollectorNumber(helperCard.number || '');
  const helperKey = normalizeCollectorKey(helperCard.number || '');
  const helperNameEn = normalizeCardName(helperCard?.name?.en || '');
  const helperNameDe = normalizeCardName(helperCard?.name?.de || '');

  // 2. Collector-number-first: try collectorKey match (zero-padding tolerant)
  if (helperKey) {
    const keyMatches = [];
    for (let index = 0; index < cards.length; index += 1) {
      if (usedIndexes.has(index)) continue;
      const candidate = cards[index];
      const candidateKey = normalizeCollectorKey(candidate?.collectorNumber || '');
      if (candidateKey && candidateKey === helperKey) {
        keyMatches.push(index);
      }
    }

    // Single match → definitive
    if (keyMatches.length === 1) return keyMatches[0];

    // Multiple matches → tiebreak with name
    if (keyMatches.length > 1) {
      for (const index of keyMatches) {
        const candidateName = normalizeCardName(cards[index]?.name || '');
        if (candidateName && (candidateName === helperNameEn || candidateName === helperNameDe)) {
          return index;
        }
      }
      // Still ambiguous: return first key match
      return keyMatches[0];
    }
  }

  // 3. Legacy: collectorNumber + name (exact, zero-padding sensitive)
  if (helperNumber) {
    for (let index = 0; index < cards.length; index += 1) {
      if (usedIndexes.has(index)) continue;
      const candidate = cards[index];
      const candidateNumber = normalizeCollectorNumber(candidate?.collectorNumber || '');
      if (!candidateNumber || candidateNumber !== helperNumber) continue;

      const candidateName = normalizeCardName(candidate?.name || '');
      if (!helperNameEn && !helperNameDe) return index;
      if (candidateName && (candidateName === helperNameEn || candidateName === helperNameDe)) {
        return index;
      }
    }
  }

  // 4. Name-only fallback
  if (helperNameEn || helperNameDe) {
    for (let index = 0; index < cards.length; index += 1) {
      if (usedIndexes.has(index)) continue;
      const candidate = cards[index];
      const candidateName = normalizeCardName(candidate?.name || '');
      if (candidateName && (candidateName === helperNameEn || candidateName === helperNameDe)) {
        return index;
      }
    }
  }

  return -1;
}

export function applyTcgdexOrderingToArtifacts({ artifacts, helperSetsByExpansionId = {} } = {}) {
  if (!artifacts?.sets || typeof artifacts.sets !== 'object') {
    return {
      orderedSetCount: 0,
      untouchedSetCount: 0,
      totalMatchedCards: 0,
      totalUnmatchedCards: 0,
      setMetrics: [],
    };
  }

  let orderedSetCount = 0;
  let untouchedSetCount = 0;
  let totalMatchedCards = 0;
  let totalUnmatchedCards = 0;
  const setMetrics = [];

  for (const [expansionId, payload] of Object.entries(artifacts.sets)) {
    const cards = Array.isArray(payload?.cards) ? payload.cards : null;
    if (!cards || cards.length === 0) {
      untouchedSetCount += 1;
      continue;
    }

    const helperSet = helperSetsByExpansionId[String(expansionId)] || null;
    const helperCards = Array.isArray(helperSet?.cards) ? helperSet.cards : [];

    if (helperCards.length === 0) {
      untouchedSetCount += 1;
      continue;
    }

    const usedIndexes = new Set();
    const orderedCards = [];

    for (const helperCard of helperCards) {
      const matchIndex = findMatchIndex(helperCard, cards, usedIndexes);
      if (matchIndex < 0) continue;
      usedIndexes.add(matchIndex);

      const card = cards[matchIndex];
      const enrichedCollectorNumber =
        (card.collectorNumber == null && helperCard.number != null)
          ? String(helperCard.number)
          : card.collectorNumber;
      orderedCards.push(
        enrichedCollectorNumber !== card.collectorNumber
          ? { ...card, collectorNumber: enrichedCollectorNumber }
          : card
      );
    }

    if (orderedCards.length === 0) {
      untouchedSetCount += 1;
      continue;
    }

    for (let index = 0; index < cards.length; index += 1) {
      if (usedIndexes.has(index)) continue;
      orderedCards.push(cards[index]);
    }

    const matchedCardCount = usedIndexes.size;
    const unmatchedCardCount = cards.length - matchedCardCount;
    totalMatchedCards += matchedCardCount;
    totalUnmatchedCards += unmatchedCardCount;
    setMetrics.push({
      expansionId: String(expansionId),
      originalCardCount: cards.length,
      matchedCardCount,
      unmatchedCardCount,
    });

    payload.cards = orderedCards;
    orderedSetCount += 1;
  }

  return {
    orderedSetCount,
    untouchedSetCount,
    totalMatchedCards,
    totalUnmatchedCards,
    setMetrics,
  };
}
