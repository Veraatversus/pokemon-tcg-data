// Laedt den Cardmarket-Katalog (sources/cardmarket/, Task A1) fuer das Matching im API-Build.
// - catalog.jsonl: eine Zeile pro Pokémon-Single (Kategorie 51), ohne Nummern (der Feed liefert keine).
// - custom-sets/<expansionId>.json: Kartennummern aus Cardmarket-HTML ({ expansionId, name, cards: [{ productId,
//   collectorNumber }] }); die einzige Quelle fuer Nummern auf Cardmarket-Seite.
import fs from 'node:fs';
import path from 'node:path';

const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));

export function parseCatalog(text) {
  const products = [];
  for (const line of String(text ?? '').split('\n')) {
    if (line.trim()) products.push(JSON.parse(line));
  }
  return products;
}

/**
 * products: Katalogzeilen; customSets: [{ expansionId, name, cards }].
 * -> { byId, byExpansion, expansions, customSets, customSetNumbers, missingCustomSetProducts, loadExpansion }
 * customSetNumbers: Produkt-ID -> collectorNumber (nur Produkte im Katalog; Eintraege fuer fehlende Produkte
 * stehen in missingCustomSetProducts). loadExpansion(id) liefert die Expansion im Format, das
 * fillCardmarketIds erwartet ({ expansionId, cards: [{ cardmarketProductId, name, collectorNumber,
 * categoryId: 51, customSet }] }), null fuer unbekannte Expansionen.
 */
export function buildCatalog(products, customSets = []) {
  const byId = new Map();
  const byExpansion = new Map();
  for (const p of products) {
    if (!Number.isInteger(p?.id)) continue;
    byId.set(p.id, p);
    if (!Number.isInteger(p.expansionId)) continue;
    if (!byExpansion.has(p.expansionId)) byExpansion.set(p.expansionId, []);
    byExpansion.get(p.expansionId).push(p);
  }
  const customSetNumbers = new Map();
  const missingCustomSetProducts = [];
  const customSetByExpansion = new Map();
  for (const cs of customSets) {
    customSetByExpansion.set(cs.expansionId, cs);
    for (const { productId, collectorNumber } of cs.cards ?? []) {
      const p = byId.get(productId);
      if (!p) { missingCustomSetProducts.push({ expansionId: cs.expansionId, productId, collectorNumber }); continue; }
      if (p.expansionId !== cs.expansionId) {
        missingCustomSetProducts.push({ expansionId: cs.expansionId, productId, collectorNumber, actualExpansion: p.expansionId });
        continue;
      }
      customSetNumbers.set(productId, String(collectorNumber));
    }
  }
  const payloads = new Map();
  const loadExpansion = (expansionId) => {
    if (!byExpansion.has(expansionId)) return null;
    if (!payloads.has(expansionId)) {
      payloads.set(expansionId, {
        expansionId,
        cards: byExpansion.get(expansionId).map((p) => ({
          cardmarketProductId: p.id,
          name: p.name,
          // Nummern nur aus custom-sets (der Feed hat keine; frueher abgeleitete Nummern waren zirkulaer).
          collectorNumber: customSetNumbers.get(p.id) ?? null,
          categoryId: 51,
          ...(customSetNumbers.has(p.id) ? { customSet: true } : {}),
        })),
      });
    }
    return payloads.get(expansionId);
  };
  return {
    byId, byExpansion, expansions: new Set(byExpansion.keys()), customSets: customSetByExpansion, customSetNumbers, missingCustomSetProducts, loadExpansion,
  };
}

export function loadCardmarketCatalog(dir) {
  const file = path.join(dir, 'catalog.jsonl');
  if (!fs.existsSync(file)) return null;
  const csDir = path.join(dir, 'custom-sets');
  const customSets = fs.existsSync(csDir)
    ? fs.readdirSync(csDir).filter((f) => f.endsWith('.json')).sort().map((f) => readJson(path.join(csDir, f)))
    : [];
  return buildCatalog(parseCatalog(fs.readFileSync(file, 'utf8')), customSets);
}
