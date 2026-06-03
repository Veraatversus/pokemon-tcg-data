import fs from 'node:fs';

const file = 'frontend/tcg-tracker-web/js/data/cardmarket-ui-helpers.js';
let content = fs.readFileSync(file, 'utf8');

// Fix: When matching fails for a generated URL, remove the stale URL instead of keeping it
const oldCode = `    const matchedEntry = assignmentMap.get(card) || null;
    const directUrl = buildCardmarketProductUrl(matchedEntry?.cardmarketProductId);
    if (!directUrl) return card;`;

const newCode = `    const matchedEntry = assignmentMap.get(card) ?? null;
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

if (content.includes(oldCode)) {
  content = content.replace(oldCode, newCode);
  fs.writeFileSync(file, content);
  console.log('✅ Fix applied: remove stale URL when matching fails');
} else {
  console.log('❌ Pattern not found. Showing relevant section:');
  const lines = content.split('\n');
  lines.forEach((line, i) => {
    if (line.includes('matchedEntry') || line.includes('directUrl') || line.includes('assignmentMap')) {
      console.log(`  Line ${i + 1}: ${line}`);
    }
  });
}
