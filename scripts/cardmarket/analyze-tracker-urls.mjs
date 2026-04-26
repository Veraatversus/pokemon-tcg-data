import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const cardsDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'cards', 'en');

// Read cardmarket index
const trackerIndexPath = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'cardmarket', 'index', 'tracker.json');
const trackerIndex = JSON.parse(await fs.readFile(trackerIndexPath, 'utf-8'));

// Read sets names
const setsPath = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'sets', 'de.json');
const setsData = JSON.parse(await fs.readFile(setsPath, 'utf-8'));
const setNames = Object.fromEntries(setsData.map(s => [s.id, s.name]));

// Read cardmarket sets to get expansionIds
const cmDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'cardmarket', 'sets');
const cmSetData = {};

const cmFiles = await fs.readdir(cmDir);
for (const file of cmFiles.filter(f => f.endsWith('.json') && f !== 'meta.json')) {
  const content = JSON.parse(await fs.readFile(path.join(cmDir, file), 'utf-8'));
  if (content.expansionId) {
    cmSetData[content.expansionId] = {
      cardCount: content.cards?.length || 0,
      file,
    };
  }
}

// Read all card JSON files
const cardFiles = await fs.readdir(cardsDir);
const analysis = {
  totalCards: 0,
  cardsWithCardmarketUrl: 0,
  cardsWithoutCardmarketUrl: 0,
  bySet: {},
};

for (const file of cardFiles.filter(f => f.endsWith('.json'))) {
  const setId = file.replace('.json', '');
  const filePath = path.join(cardsDir, file);
  
  try {
    const setData = JSON.parse(await fs.readFile(filePath, 'utf-8'));
    if (!Array.isArray(setData)) continue;

    // Find corresponding Cardmarket expansion ID
    const cmExpansionId = trackerIndex.bySetId[setId];
    
    analysis.bySet[setId] = {
      name: setNames[setId] || setId,
      totalCards: setData.length,
      cardsWithUrl: 0,
      cardsWithoutUrl: 0,
      cardmarketExpansionId: cmExpansionId,
      cardmarketCardCount: cmSetData[cmExpansionId]?.cardCount || 0,
      examplesWithoutUrl: [],
    };

    for (const card of setData) {
      analysis.totalCards++;
      const hasUrl = !!card.cardmarketUrl;
      
      if (hasUrl) {
        analysis.cardsWithCardmarketUrl++;
        analysis.bySet[setId].cardsWithUrl++;
      } else {
        analysis.cardsWithoutCardmarketUrl++;
        analysis.bySet[setId].cardsWithoutUrl++;
        
        if (analysis.bySet[setId].examplesWithoutUrl.length < 3) {
          analysis.bySet[setId].examplesWithoutUrl.push({
            name: card.name,
            number: card.number,
            rarity: card.rarity,
          });
        }
      }
    }
  } catch (e) {
    console.error(`Error reading ${file}:`, e.message);
  }
}

// Sort by number of cards without URL
const sortedSets = Object.values(analysis.bySet)
  .sort((a, b) => b.cardsWithoutUrl - a.cardsWithoutUrl);

console.log('\n=== TRACKER CARDS OHNE CARDMARKET VERKNÜPFUNG ===\n');
console.log(`Karten mit Cardmarket-URL: ${analysis.cardsWithCardmarketUrl.toLocaleString('de-DE')}`);
console.log(`Karten ohne Cardmarket-URL: ${analysis.cardsWithoutCardmarketUrl.toLocaleString('de-DE')}`);
console.log(`Total: ${analysis.totalCards.toLocaleString('de-DE')}\n`);

const pctWithUrl = ((analysis.cardsWithCardmarketUrl / analysis.totalCards) * 100).toFixed(1);
const pctWithoutUrl = ((analysis.cardsWithoutCardmarketUrl / analysis.totalCards) * 100).toFixed(1);
console.log(`Coverage: ${pctWithUrl}% | Fehlend: ${pctWithoutUrl}%\n`);

console.log('=== TOP 20 SETS MIT FEHLENDEN URLS ===\n');

for (const set of sortedSets.slice(0, 20)) {
  if (set.cardsWithoutUrl === 0) continue;
  const pct = ((set.cardsWithoutUrl / set.totalCards) * 100).toFixed(1);
  console.log(`${set.name}`);
  console.log(`  Tracker: ${set.totalCards} Karten`);
  console.log(`  Cardmarket: ${set.cardmarketCardCount} Karten`);
  console.log(`  Ohne URL: ${set.cardsWithoutUrl} (${pct}%)`);
  if (set.examplesWithoutUrl.length > 0) {
    console.log(`  Beispiele:`);
    for (const card of set.examplesWithoutUrl) {
      console.log(`    - ${card.name} (${card.number})`);
    }
  }
  console.log();
}

console.log('\n=== SETS OHNE JEGLICHE URLS ===\n');
const noUrlSets = sortedSets.filter(s => s.cardsWithUrl === 0);
if (noUrlSets.length === 0) {
  console.log('Keine');
} else {
  for (const set of noUrlSets) {
    console.log(`${set.name}: ${set.totalCards} Karten (Cardmarket: ${set.cardmarketCardCount})`);
  }
}
