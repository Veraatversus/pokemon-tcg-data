/**
 * Cardmarket URL Utilities
 *
 * Centralized URL classification for cardmarket links.
 * All other modules should import from here instead of defining their own copies.
 */

/**
 * Detects legacy auto-generated Cardmarket search URLs.
 * Example: https://www.cardmarket.com/de/Pokemon/Products/Search?searchString=...
 */
export function isGeneratedCardmarketSearchUrl(url = '') {
  const value = String(url || '').trim().toLowerCase();
  return value.includes('cardmarket.com') && value.includes('/products/search') && value.includes('searchstring=');
}

/**
 * Detects legacy auto-generated Cardmarket direct product URLs.
 * These were produced by older matching logic and may be incorrect.
 * Example: https://www.cardmarket.com/de/Pokemon/Products?idProduct=719442
 */
export function isGeneratedCardmarketProductUrl(url = '') {
  const value = String(url || '').trim().toLowerCase();
  return value.includes('cardmarket.com') && value.includes('/pokemon/products') && value.includes('idproduct=');
}

/**
 * Detects any auto-generated Cardmarket URL (search or direct product).
 * Use this when both types should be treated as "potentially stale fallback".
 */
export function isGeneratedCardmarketUrl(url = '') {
  return isGeneratedCardmarketSearchUrl(url) || isGeneratedCardmarketProductUrl(url);
}

/**
 * Heuristik, ob `?isReverseHolo=Y` an die URL angehängt werden kann/darf.
 * Cardmarket akzeptiert den Suffix nur auf Produkt-URLs (Singles oder
 * `?idProduct=...`), nicht auf generierten Such-URLs.
 */
export function isCardmarketProductUrl(url = '') {
  const value = String(url || '').trim().toLowerCase();
  if (!value) return false;
  if (!value.includes('cardmarket.com')) return false;
  if (value.includes('/products/search') || value.includes('searchstring=')) return false;
  return value.includes('/pokemon/products') || value.includes('/singles/') || value.includes('idproduct=');
}

/**
 * Hängt `?isReverseHolo=Y` an eine Cardmarket-Produkt-URL an, wenn die
 * Karte als Reverse Holo gesammelt ist. Lässt Such-URLs und fremde URLs
 * unverändert. Suffix wird sauber zusammengeführt (per `&`, falls schon
 * eine Query existiert, per `?` sonst).
 *
 * @param {string} url  Cardmarkt-Produkt-URL.
 * @param {boolean} isReverseHolo  True, wenn die Karte als RH gesammelt ist.
 * @returns {string}  Die URL, ggf. mit angehängtem Query-Parameter.
 */
export function applyReverseHoloQueryParam(url = '', isReverseHolo = false) {
  const value = String(url || '').trim();
  if (!value || !isReverseHolo) return value;
  if (!isCardmarketProductUrl(value)) return value;
  const separator = value.includes('?') ? '&' : '?';
  return `${value}${separator}isReverseHolo=Y`;
}

/**
 * Produkt-URL `https://www.cardmarket.com/<de|en>/Pokemon/Products?idProduct=<id>`;
 * '' wenn die ID keine positive Ganzzahl ist.
 */
export function buildCardmarketProductUrl(productId, { language = 'de' } = {}) {
  const normalizedProductId = normalizeCardmarketProductId(productId);
  if (!normalizedProductId) return '';
  const normalizedLanguage = String(language || 'de').trim().toLowerCase() || 'de';
  return `https://www.cardmarket.com/${encodeURIComponent(normalizedLanguage)}/Pokemon/Products?idProduct=${normalizedProductId}`;
}

/** Ziffern-String einer Cardmarket-Produkt-ID oder ''. */
export function normalizeCardmarketProductId(value) {
  const text = String(value ?? '').trim();
  return /^\d+$/.test(text) && Number(text) > 0 ? String(Number(text)) : '';
}

function legacyCardmarketUrls(card = {}) {
  return [card?.cardmarketUrl, card?.vera_cardmarket_url, card?.tcgdex_cardmarket_url, card?.cardmarket_url, card?.cardmarket?.url]
    .map((value) => String(value || '').trim())
    .filter(Boolean);
}

function productIdFromUrl(url = '') {
  const match = String(url || '').match(/[?&]idProduct=(\d+)/i);
  return match ? normalizeCardmarketProductId(match[1]) : '';
}

/**
 * Einzige Stelle, die entscheidet, welches Cardmarket-Produkt zu einer Karte gehoert
 * (genutzt von Links, Preissuche und Bild-Metadaten):
 *   1. v3-Produkt-ID am Record (`cardmarketProductId`, aus ids.cardmarket[0] bzw. search-index `cm`)
 *   2. Legacy-URL (Sheet) mit `idProduct=`
 *   3. Treffer des Name-/Nummern-Matchers (`matchedEntry`, asynchron vom Aufrufer ermittelt)
 * Kein Treffer -> { productId: '', source: '' }; der Link faellt dann auf eine Such-URL zurueck.
 */
export function resolveCardmarketProductId(card = {}, { matchedEntry = null } = {}) {
  const v3Id = normalizeCardmarketProductId(card?.cardmarketProductId);
  if (v3Id) return { productId: v3Id, source: 'v3' };
  for (const url of legacyCardmarketUrls(card)) {
    const urlId = productIdFromUrl(url);
    if (urlId) return { productId: urlId, source: 'url' };
  }
  const matchedId = normalizeCardmarketProductId(matchedEntry?.cardmarketProductId);
  if (matchedId) return { productId: matchedId, source: 'matcher' };
  return { productId: '', source: '' };
}

/**
 * Cardmarket-Link einer Karte: Produkt-URL in der Kartensprache, sobald eine ID bekannt ist;
 * sonst eine vorhandene (generierte) Such-URL; sonst ''.
 */
export function resolveCardmarketLink(card = {}, { language = 'de', matchedEntry = null } = {}) {
  const { productId } = resolveCardmarketProductId(card, { matchedEntry });
  if (productId) return buildCardmarketProductUrl(productId, { language });
  const urls = legacyCardmarketUrls(card).filter((url) => /^https?:\/\//i.test(url));
  return urls.find((url) => !isGeneratedCardmarketSearchUrl(url)) || urls[0] || '';
}
