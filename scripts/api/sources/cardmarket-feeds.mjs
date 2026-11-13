// Reine Helfer fuer die Cardmarket-Downloads (Produktliste, Preisguide). Auch von der eingefrorenen
// Pipeline scripts/cardmarket/lib/build-helpers.mjs genutzt (von dort re-exportiert).

export function extractProductsList(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.products)) return payload.products;
  if (Array.isArray(payload?.productList)) return payload.productList;
  return [];
}

export function extractPriceGuideList(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.priceGuides)) return payload.priceGuides;
  if (Array.isArray(payload?.prices)) return payload.prices;
  return [];
}
