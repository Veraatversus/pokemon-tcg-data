// Preisdateien api/v3/prices/<setId>.json aus dem taeglichen Cardmarket-Preisguide (Spec §2.3, §4).
// Je Karte mit primaerer Cardmarket-ID (primaryCardmarketId) und Preisguide-Eintrag:
//   "<cardId>": { productId, trend, avg1, avg7, avg30, low, trendHolo, avg1Holo, avg7Holo, avg30Holo, lowHolo }
// Nur numerische Felder; Eintraege ohne jeden Preis entfallen. Ohne Preisguide von heute (priceGuide null,
// A1 hat dann keine .cache-Datei geschrieben) bleiben Preisdateien und meta.json unberuehrt.
import fs from 'node:fs';
import path from 'node:path';
import { extractPriceGuideList } from '../sources/cardmarket-feeds.mjs';
import { toCompactJson, toJson, assertSafeSetId } from '../registry/registry-io.mjs';

// Feld der Preisdatei -> Feld des Preisguides (avg/avg-holo werden nicht ausgeliefert)
const FIELDS = {
  trend: 'trend', avg1: 'avg1', avg7: 'avg7', avg30: 'avg30', low: 'low',
  trendHolo: 'trend-holo', avg1Holo: 'avg1-holo', avg7Holo: 'avg7-holo', avg30Holo: 'avg30-holo', lowHolo: 'low-holo',
};

/** -> { files: Map<setId, { cardId: entry }>, meta } */
export function buildPriceFiles({ cardsBySet, priceGuide, primaryCardmarketId, now = () => new Date() }) {
  const byProduct = new Map();
  for (const row of extractPriceGuideList(priceGuide)) if (Number.isInteger(row?.idProduct)) byProduct.set(row.idProduct, row);
  const files = new Map();
  let cardsWithId = 0;
  let cardsWithPrice = 0;
  for (const [setId, cards] of cardsBySet) {
    const entries = {};
    for (const card of cards) {
      const productId = primaryCardmarketId(card);
      if (typeof productId !== 'number') continue;
      cardsWithId++;
      const row = byProduct.get(productId);
      if (!row) continue;
      const entry = { productId };
      for (const [field, source] of Object.entries(FIELDS)) if (typeof row[source] === 'number' && Number.isFinite(row[source])) entry[field] = row[source];
      if (Object.keys(entry).length === 1) continue;
      entries[card.cardId] = entry;
      cardsWithPrice++;
    }
    if (Object.keys(entries).length) files.set(setId, entries);
  }
  return {
    files,
    meta: { generatedAt: now().toISOString(), priceGuideCreatedAt: priceGuide?.createdAt ?? null, cardsWithId, cardsWithPrice },
  };
}

function writeIfChanged(file, content) {
  if (fs.existsSync(file) && fs.readFileSync(file, 'utf8') === content) return false;
  fs.writeFileSync(file, content);
  return true;
}

/**
 * Schreibt <outDir>/prices/*.json und meta.json (outDir absolut). priceGuide null -> nichts anfassen, Rueckgabe null.
 * Preisdateien von Sets ohne Preise fallen weg. Rueckgabe: meta.
 */
export function writePriceFiles({ outDir, cardsBySet, priceGuide, primaryCardmarketId, now }) {
  // Leerer/kaputter Preisguide zaehlt wie keiner (nichts anfassen)
  if (!priceGuide || extractPriceGuideList(priceGuide).length === 0) return null;
  const { files, meta } = buildPriceFiles({ cardsBySet, priceGuide, primaryCardmarketId, now });
  const dir = path.join(outDir, 'prices');
  fs.mkdirSync(dir, { recursive: true });
  let changed = false;
  const wanted = new Set(['meta.json']);
  for (const [setId, entries] of files) {
    assertSafeSetId(setId);
    wanted.add(`${setId}.json`);
    if (writeIfChanged(path.join(dir, `${setId}.json`), toCompactJson(entries))) changed = true;
  }
  for (const f of fs.readdirSync(dir)) if (f.endsWith('.json') && !wanted.has(f)) { fs.rmSync(path.join(dir, f)); changed = true; }
  // generatedAt dient als Cache-Buster (?v=): neu, sobald sich irgendeine Preisdatei oder die Zaehler aendern,
  // sonst bleibt meta.json byte-gleich (kein taeglicher Diff ohne Preisaenderung)
  const metaFile = path.join(dir, 'meta.json');
  let old = null;
  try { old = JSON.parse(fs.readFileSync(metaFile, 'utf8')); } catch { /* neu */ }
  const same = !changed && old && old.priceGuideCreatedAt === meta.priceGuideCreatedAt && old.cardsWithId === meta.cardsWithId && old.cardsWithPrice === meta.cardsWithPrice;
  if (!same) fs.writeFileSync(metaFile, toJson(meta));
  return same ? old : meta;
}
