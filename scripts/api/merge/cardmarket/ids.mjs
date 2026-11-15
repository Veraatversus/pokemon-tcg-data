// IDs einer Karte und Suchlink: Blatt, von Stufen und Report gemeinsam genutzt.

// Suchseite der Expansion auf Cardmarket, nach Nummer sortiert (null ohne Expansion).
export function cardmarketSearchUrl(expansionId) {
  if (!Number.isInteger(expansionId)) return null;
  return `https://www.cardmarket.com/en/Pokemon/Products/Search?searchMode=v2&idCategory=51&idExpansion=${expansionId}&sortBy=collectorsnumber_asc&perSite=100&site=1`;
}

// Primaere Cardmarket-ID einer Karte (gleiche Regel im Frontend), je erste Variante mit cardmarketId:
// ungestempelt und nicht Jumbo (size "jumbo"), sonst nicht Jumbo, sonst ungestempelt, sonst irgendeine,
// sonst ids.cardmarket[0]. Karten nur mit Jumbo-Variante behalten deren ID.
export function primaryCardmarketId(card) {
  const variants = (card?.variants ?? []).filter((v) => typeof v?.cardmarketId === 'number');
  const stamped = (v) => (Array.isArray(v.stamp) ? v.stamp.length > 0 : Boolean(v.stamp));
  const jumbo = (v) => v.size === 'jumbo';
  const id = (variants.find((v) => !stamped(v) && !jumbo(v)) ?? variants.find((v) => !jumbo(v))
    ?? variants.find((v) => !stamped(v)) ?? variants[0])?.cardmarketId ?? card?.ids?.cardmarket?.[0];
  return typeof id === 'number' ? id : undefined;
}

export const tcgdexIds = (card) => (Array.isArray(card.ids?.cardmarket) ? card.ids.cardmarket : []);
