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
