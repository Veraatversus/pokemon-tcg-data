import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'cardmarket', 'sets');

const trackerPath = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'cardmarket', 'index', 'tracker.json');
const trackerData = JSON.parse(await fs.readFile(trackerPath, 'utf-8'));
const setIdToName = new Map();

// Build reverse mapping
for (const [name, id] of Object.entries(trackerData.bySetId)) {
  setIdToName.set(String(id), name);
}

const files = await fs.readdir(dir);
const analysis = {
  totalCards: 0,
  cardsWithoutPrice: 0,
  cardsWithPrice: 0,
  bySet: {},
  byCategory: {},
  byExpansionId: {},
};

for (const file of files.filter(f => f.endsWith('.json'))) {
  const filePath = path.join(dir, file);
  const content = JSON.parse(await fs.readFile(filePath, 'utf-8'));
  
  if (!content.cards || !Array.isArray(content.cards)) continue;

  const setId = content.expansionId || 'unknown';
  const setName = setIdToName.get(String(setId)) || `Set ${setId}`;

  if (!analysis.bySet[setName]) {
    analysis.bySet[setName] = {
      id: setId,
      total: 0,
      withPrice: 0,
      withoutPrice: 0,
      cardsWithoutPrice: [],
    };
  }

  if (!analysis.byExpansionId[setId]) {
    analysis.byExpansionId[setId] = {
      name: setName,
      total: 0,
      withPrice: 0,
      withoutPrice: 0,
    };
  }

  for (const card of content.cards) {
    analysis.totalCards++;
    analysis.bySet[setName].total++;
    analysis.byExpansionId[setId].total++;

    const hasPrice = card.prices && (
      card.prices.avg != null ||
      card.prices.low != null ||
      card.prices.trend != null ||
      card.prices.avgHolo != null ||
      card.prices.trendHolo != null
    );

    if (hasPrice) {
      analysis.cardsWithPrice++;
      analysis.bySet[setName].withPrice++;
      analysis.byExpansionId[setId].withPrice++;
    } else {
      analysis.cardsWithoutPrice++;
      analysis.bySet[setName].withoutPrice++;
      analysis.byExpansionId[setId].withoutPrice++;
      
      if (analysis.bySet[setName].cardsWithoutPrice.length < 5) {
        analysis.bySet[setName].cardsWithoutPrice.push({
          name: card.name,
          category: card.categoryName,
          number: card.collectorNumber,
        });
      }
    }

    if (!analysis.byCategory[card.categoryName]) {
      analysis.byCategory[card.categoryName] = { total: 0, withPrice: 0, withoutPrice: 0 };
    }
    analysis.byCategory[card.categoryName].total++;
    if (hasPrice) {
      analysis.byCategory[card.categoryName].withPrice++;
    } else {
      analysis.byCategory[card.categoryName].withoutPrice++;
    }
  }
}

// Calculate percentages
const pricePercentage = ((analysis.cardsWithPrice / analysis.totalCards) * 100).toFixed(1);
const noPricePercentage = ((analysis.cardsWithoutPrice / analysis.totalCards) * 100).toFixed(1);

console.log('\n=== CARDMARKET PRICE COVERAGE ANALYSIS ===\n');
console.log(`GESAMT`);
console.log(`  Karten mit Preis: ${analysis.cardsWithPrice} (${pricePercentage}%)`);
console.log(`  Karten ohne Preis: ${analysis.cardsWithoutPrice} (${noPricePercentage}%)`);
console.log(`  Total: ${analysis.totalCards}\n`);

console.log('=== BY CATEGORY ===\n');
const sortedCategories = Object.entries(analysis.byCategory)
  .sort((a, b) => b[1].withoutPrice - a[1].withoutPrice);

for (const [category, stats] of sortedCategories) {
  const withoutPct = ((stats.withoutPrice / stats.total) * 100).toFixed(1);
  console.log(`${category}`);
  console.log(`  Ohne Preis: ${stats.withoutPrice} / ${stats.total} (${withoutPct}%)`);
}

console.log('\n=== TOP 15 SETS MIT MEISTEN FEHLENDEN PREISEN ===\n');
const sortedSets = Object.values(analysis.bySet)
  .sort((a, b) => b.withoutPrice - a.withoutPrice)
  .slice(0, 15);

for (const set of sortedSets) {
  const withoutPct = ((set.withoutPrice / set.total) * 100).toFixed(1);
  console.log(`${set.id ? setIdToName.get(String(set.id)) || set.id : 'unknown'}`);
  console.log(`  Ohne Preis: ${set.withoutPrice} / ${set.total} (${withoutPct}%)`);
  if (set.cardsWithoutPrice.length > 0) {
    console.log(`  Beispiele:`);
    for (const card of set.cardsWithoutPrice) {
      console.log(`    - ${card.name} (${card.category})`);
    }
  }
}

console.log('\n=== SETS OHNE JEGLICHE PREISE ===\n');
const noPriceSets = Object.values(analysis.bySet)
  .filter(s => s.withPrice === 0)
  .sort((a, b) => b.total - a.total);

if (noPriceSets.length === 0) {
  console.log('Keine');
} else {
  for (const set of noPriceSets) {
    console.log(`${set.id ? setIdToName.get(String(set.id)) || set.id : 'unknown'}: ${set.total} Karten`);
  }
}
