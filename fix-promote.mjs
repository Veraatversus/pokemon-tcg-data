import fs from 'node:fs';

const file = 'frontend/tcg-tracker-web/js/data/cardmarket-ui-helpers.js';
let content = fs.readFileSync(file, 'utf8');

// Fix 1: When matching fails for a generated URL, remove the stale URL instead of keeping it
const oldReturn = `    const matchedEntry = assignmentMap.get(card) || null;
    const directUrl = buildCardmarketProductUrl(matchedEntry?.cardmarketProductId);
    if (!directUrl) return card;`;

const newReturn = `    const matchedEntry = assignmentMap.get(card) || null;
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
    }`;

if (content.includes(oldReturn)) {
  content = content.replace(oldReturn, newReturn);
  console.log('Fix 1 applied: remove stale URL when matching fails');
} else {
  console.log('Fix 1: Pattern not found (may already be applied)');
}

// Fix 2: Improve matching to use card number (collector number) instead of just names
// The issue: DB cards have German names, payload has English names
// Solution: Match by collector number first, then by name
const oldBlock = `  const availableEntries = [...payloadCards];
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
        for (const i of keyMatches) {
          if (entryMatchesAnyCardName(availableEntries[i], normalizedCardNames)) {
            matchIndex = i;
            break;
          }
        }
      }
    }

    // 2. Fallback: name-based match
    if (matchIndex < 0) {
      matchIndex = availableEntries.findIndex((entry) => entryMatchesAnyCardName(entry, normalizedCardNames));
    }
    if (matchIndex < 0) continue;`;

const newBlock = `  const availableEntries = [...payloadCards];
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
        for (const i of keyMatches) {
          if (entryMatchesAnyCardName(availableEntries[i], normalizedCardNames)) {
            matchIndex = i;
            break;
          }
        }
      }
    }

    // 2. Fallback: name-based match (try both card name and vera_name)
    if (matchIndex < 0) {
      matchIndex = availableEntries.findIndex((entry) => entryMatchesAnyCardName(entry, normalizedCardNames));
    }

    // 3. Fallback: match by card number alone (even if names differ, e.g. German vs English)
    if (matchIndex < 0 && cardCollectorKey) {
      matchIndex = availableEntries.findIndex((entry) => {
        const entryKey = normalizeCollectorKey(entry?.collectorNumber || entry?.number || entry?.cardNumber || '');
        return entryKey && entryKey === cardCollectorKey;
      });
    }

    if (matchIndex < 0) continue;`;

if (content.includes(oldBlock)) {
  content = content.replace(oldBlock, newBlock);
  console.log('Fix 2 applied: improved matching with collector number fallback');
} else {
  console.log('Fix 2: Pattern not found');
}

fs.writeFileSync(file, content);
console.log('Done');
