import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const trackerSetDirs = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'sets');

// Read all tracker sets (de.json, en.json, etc.)
const trackerSetPath = path.join(trackerSetDirs, 'de.json');
const trackerSets = JSON.parse(await fs.readFile(trackerSetPath, 'utf-8'));

// Read cardmarket index
const trackerIndexPath = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'cardmarket', 'index', 'tracker.json');
const trackerIndex = JSON.parse(await fs.readFile(trackerIndexPath, 'utf-8'));

// Read product index
const productIndexPath = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'cardmarket', 'index', 'products.json');
const productIndex = JSON.parse(await fs.readFile(productIndexPath, 'utf-8'));

// Read cardmarket sets directory
const cmDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'cardmarket', 'sets');
const cmFiles = await fs.readdir(cmDir);

// Build set of cardmarket expansion IDs
const cardmarketExpansionIds = new Set();
for (const file of cmFiles.filter(f => f.endsWith('.json') && f !== 'meta.json')) {
  const content = JSON.parse(await fs.readFile(path.join(cmDir, file), 'utf-8'));
  cardmarketExpansionIds.add(content.expansionId);
}

console.log('\n=== TRACKER SETS OHNE CARDMARKET ABDECKUNG ===\n');
const analysis = {
  totalSets: 0,
  setsWithCardmarket: 0,
  setsWithoutCardmarket: 0,
  detailedList: [],
};

for (const set of trackerSets) {
  analysis.totalSets++;
  
  // Try to find in cardmarket index by setId
  const bySetId = Object.entries(trackerIndex.bySetId).find(([_, id]) => id === String(set.id));
  let found = false;

  if (bySetId) {
    const cmExpId = bySetId[1];
    if (cardmarketExpansionIds.has(Number(cmExpId))) {
      analysis.setsWithCardmarket++;
      found = true;
    }
  }

  if (!found) {
    analysis.setsWithoutCardmarket++;
    analysis.detailedList.push({
      setId: set.id,
      name: set.name,
      cardCount: set.cards?.length || 0,
      releasedAt: set.released_at,
    });
  }
}

console.log(`Sets mit Cardmarket: ${analysis.setsWithCardmarket}`);
console.log(`Sets ohne Cardmarket: ${analysis.setsWithoutCardmarket}`);
console.log(`Total: ${analysis.totalSets}\n`);

if (analysis.detailedList.length > 0) {
  console.log('=== LISTE ===\n');
  for (const set of analysis.detailedList.slice(0, 30)) {
    console.log(`${set.setId}: ${set.name}`);
    console.log(`  Karten im Tracker: ${set.cardCount}`);
    console.log(`  Veröffentlicht: ${set.releasedAt}`);
  }
  
  if (analysis.detailedList.length > 30) {
    console.log(`\n... und ${analysis.detailedList.length - 30} weitere\n`);
  }
}
