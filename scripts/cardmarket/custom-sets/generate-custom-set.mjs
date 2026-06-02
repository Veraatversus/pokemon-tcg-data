#!/usr/bin/env node
/**
 * Helper script to generate custom set card arrays from Cardmarket HTML responses.
 *
 * Usage:
 *   node scripts/cardmarket/custom-sets/generate-custom-set.mjs <html-file>
 *
 * The script parses Cardmarket search result HTML and extracts:
 *   - productId from image URLs (data-echo attribute)
 *   - collectorNumber from card titles like "(SVP 001)" or "(SVPen001)"
 *   - version from href URLs like "Magneton-V2-SVP159" → "V2"
 *
 * Version handling:
 *   - Standard version (lowest V number or no V): just the number (e.g. "4")
 *   - Higher versions: number + version suffix (e.g. "4V2", "4V3")
 *
 * Output: A JSON array of { productId, collectorNumber, version } objects.
 */

import { readFileSync } from "node:fs";

const htmlFile = process.argv[2];
if (!htmlFile) {
  console.error("Usage: node generate-custom-set.mjs <html-file>");
  process.exit(1);
}

const html = readFileSync(htmlFile, "utf-8");

// Extract all card gallery box blocks
const cardBlocks = html.match(
  /<a\s+href="[^"]*"\s+class="card text-center w-100 galleryBox">[\s\S]*?<\/a>\s*<\/div>/g
) || [];

const rawCards = [];
const seenProductIds = new Set();

for (const block of cardBlocks) {
  // Extract href path (e.g. "Magneton-V2-SVP159" or "Felori-SVP001")
  const hrefMatch = block.match(
    /href="\/de\/Pokemon\/Products\/Singles\/SV-Black-Star-Promos\/([^"]+)"/
  );
  if (!hrefMatch) continue;
  const hrefPath = hrefMatch[1];

  // Extract productId from image URL
  const imgMatch = block.match(
    /data-echo="https:\/\/product-images\.s3\.cardmarket\.com\/\d+\/\w+\/(\d+)\/\d+\.(?:jpg|png)"/i
  );
  if (!imgMatch) continue;
  const productId = imgMatch[1];

  // Skip duplicates
  if (seenProductIds.has(productId)) continue;
  seenProductIds.add(productId);

  // Extract version from href: "Name-V2-SVP159" → "V2", "Name-SVP001" → null
  const versionMatch = hrefPath.match(/-V(\d+)-SVP/);
  const version = versionMatch ? `V${versionMatch[1]}` : null;

  // Extract collector number from h2 title: "(SVP 001)" or "(SVPen001)" or "(PAL030)"
  const titleMatch = block.match(
    /<h2[^>]*>[\s\S]*?\([A-Z]{2,3}(?:en)?\s*(\d+)\)[\s\S]*?<\/h2>/i
  );

  let collectorNumber = null;
  if (titleMatch) {
    collectorNumber = String(parseInt(titleMatch[1], 10));
  }

  rawCards.push({ productId: Number(productId), collectorNumber, version, hrefPath });
}

// Group by collector number and assign version suffixes
const grouped = new Map();
for (const card of rawCards) {
  const key = card.collectorNumber || `_special_${card.productId}`;
  if (!grouped.has(key)) grouped.set(key, []);
  grouped.get(key).push(card);
}

const result = [];

for (const [cn, cards] of grouped) {
  if (cn.startsWith("_special_")) {
    for (const card of cards) {
      result.push({ productId: card.productId, collectorNumber: null, version: card.version });
    }
    continue;
  }

  // Sort: null version first, then V1, V2, V3...
  cards.sort((a, b) => {
    if (a.version === null && b.version !== null) return -1;
    if (a.version !== null && b.version === null) return 1;
    if (a.version === null && b.version === null) return 0;
    return parseInt(a.version.slice(1)) - parseInt(b.version.slice(1));
  });

  for (let i = 0; i < cards.length; i++) {
    const card = cards[i];
    let finalCN = cn;
    if (cards.length > 1 && i > 0) {
      finalCN = `${cn}${card.version}`;
    }
    result.push({ productId: card.productId, collectorNumber: finalCN, version: card.version });
  }
}

// Sort by numeric collector number, then by version suffix
result.sort((a, b) => {
  const aBase = parseInt(a.collectorNumber);
  const bBase = parseInt(b.collectorNumber);
  if (aBase !== bBase) return aBase - bBase;
  const aSuf = a.collectorNumber.replace(/^\d+/, "") || "";
  const bSuf = b.collectorNumber.replace(/^\d+/, "") || "";
  return aSuf.localeCompare(bSuf);
});

// Output as JSON
console.log(JSON.stringify(result, null, 2));

const withVersion = result.filter(r => r.version);
const standard = result.filter(r => !r.version && r.collectorNumber);
const special = result.filter(r => !r.collectorNumber);
console.error(`\nTotal: ${result.length}`);
console.error(`Standard (no suffix): ${standard.length}`);
console.error(`With version suffix: ${withVersion.length}`);
console.error(`Special (no collector#): ${special.length}`);

// Also output in the .mjs array format
console.log("\n--- MJS format ---\n");
console.log("const CARDS = [");
for (const card of result) {
  if (card.collectorNumber) {
    console.log(`  { productId: ${card.productId}, collectorNumber: "${card.collectorNumber}" },`);
  }
}
console.log("];");
