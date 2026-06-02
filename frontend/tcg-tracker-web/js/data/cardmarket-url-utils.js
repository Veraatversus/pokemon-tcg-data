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
