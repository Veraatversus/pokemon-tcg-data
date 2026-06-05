import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const appPath = path.join(__dirname, '..', 'js', 'app.js');

async function readAppSource() {
  return readFile(appPath, 'utf8');
}

test('app runtime keeps advanced tab enabled and defaults advanced detail to top cards', async () => {
  const source = await readAppSource();

  assert.match(source, /\{ id: 'advanced', label: 'Advanced' \}/);
  assert.match(source, /detailMode: 'top'/);
  assert.doesNotMatch(source, /detailMode: 'summary'/);
});

test('app runtime no longer hard-truncates price tab lists', async () => {
  const source = await readAppSource();

  assert.match(source, /const chartRows = bySet\.slice\(\)\.map/);
  assert.match(source, /const watchlistItems = watchlistWorkspace\.items/);
  assert.match(source, /const watchlistVisibleItems = watchlistItems\.slice\(0, watchlistState\.visibleCount\)/);
  assert.match(source, /group\.items[\s\S]*?<ul class="stats-price-drill-list stats-price-scroll-region">/);
  assert.match(source, /const advancedDetailMissingMarkup = `[\s\S]*?activeGroupMissing[\s\S]*?\.slice\(\)/);

  assert.match(source, /stats-price-scroll-region/);
});

test('app runtime exposes optional Cardmarket links and prevents set navigation side effects', async () => {
  const source = await readAppSource();

  assert.match(source, /data-cardmarket-link="1"/);
  assert.match(source, /container\.querySelectorAll\('\[data-cardmarket-link\]'\)/);
  assert.match(source, /event\.stopPropagation\(\)/);
});

test('app runtime renders the card set in the lightbox facts', async () => {
  const source = await readAppSource();

  assert.match(source, /setFact\(dom\.lightboxSet,/);
  assert.match(source, /lightbox-set/);
});

test('app runtime supports dynamic watchlist loading with filters and thumbnails', async () => {
  const source = await readAppSource();

  assert.match(source, /STATS_PRICE_WATCHLIST_BATCH_SIZE\s*=\s*60/);
  assert.match(source, /function normalizeWatchlistFilters\(/);
  assert.match(source, /computeWatchlistWorkspace\(/);
  assert.match(source, /data-watchlist-filter=/);
  assert.match(source, /data-watchlist-filter="variant"/);
  assert.match(source, /reverse-holo-only/);
  assert.match(source, /data-watchlist-reset="1"/);
  assert.match(source, /data-watchlist-scroll-region=/);
  assert.match(source, /data-watchlist-sentinel="1"/);
  assert.match(source, /data-watchlist-load-more=/);
  assert.match(source, /data-watchlist-open-set="1"/);
  assert.match(source, /container\.querySelectorAll\('\[data-watchlist-open-set\]'\)/);
  assert.match(source, /openSearchResultLightbox\(resolved\.card, resolved\.set/);
  assert.match(source, /preserveWatchlistScroll\s*=\s*undefined/);
  assert.match(source, /const effectiveWatchlistScrollSnapshot = preserveWatchlistScroll === false/);
  assert.match(source, /const restoreWatchlistScrollSnapshot = \(snapshot\) => \{/);
  assert.match(source, /window\.requestAnimationFrame\(\(\) => \{/);
  assert.match(source, /scrollTop:\s*Math\.max\(0,\s*Number\(scrollRegion\.scrollTop \|\| 0\)\)/);
  assert.match(source, /preserveWatchlistScroll:\s*false/);
  assert.match(source, /preserveWatchlistScroll:\s*scrollSnapshot/);
  assert.match(source, /let wasNearBottom = scrollRegion\.scrollTop \+ scrollRegion\.clientHeight >= scrollRegion\.scrollHeight - 72/);
  assert.match(source, /autoLoadBudget:\s*0/);
  assert.match(source, /autoLoadInFlight:\s*false/);
  assert.match(source, /scrollRegion\.addEventListener\('wheel',\s*armWatchlistAutoLoad/);
  assert.match(source, /if \(state\.statsPrice\.watchlist\.autoLoadInFlight\) return;/);
  assert.match(source, /state\.statsPrice\.watchlist\.autoLoadBudget = 1;/);
  assert.match(source, /if \(budget > 0 && !watchlist\.autoLoadInFlight\) \{/);
  assert.match(source, /loadMoreWatchlistItems\(\{ source: 'scroll' \}\)/);
  assert.match(source, /if \(nearBottom && !wasNearBottom\) \{/);
  assert.doesNotMatch(source, /new window\.IntersectionObserver\(/);
  assert.match(source, /STATS_PRICE_WATCHLIST_INPUT_DEBOUNCE_MS\s*=\s*520/);
  assert.match(source, /window\.setTimeout\(\(\) => \{/);
  assert.match(source, /stats-price-thumb/);
});

test('loadCardmarketPriceSummary derives currentSetId from card.setId first so the watchlist does not collapse to the active set', async () => {
  const source = await readAppSource();

  // The fix: the card's own setId wins over state.currentSet.setId.
  assert.match(
    source,
    /const\s+cardSetId\s*=\s*String\(card\?\.setId\s*\|\|\s*''\)\.trim\(\);\s*const\s+currentSetId\s*=\s*cardSetId\s*\|\|\s*state\?\.currentSet\?\.setId\s*\|\|\s*''/
  );
});
