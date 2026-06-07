import test from 'node:test';
import assert from 'node:assert/strict';

import {
  isGeneratedCardmarketSearchUrl,
  isGeneratedCardmarketProductUrl,
  isGeneratedCardmarketUrl,
  isCardmarketProductUrl,
  applyReverseHoloQueryParam,
} from '../js/data/cardmarket-url-utils.js';

// ── isGeneratedCardmarketSearchUrl ──────────────────────────────────

test('isGeneratedCardmarketSearchUrl detects legacy search URLs', () => {
  assert.equal(
    isGeneratedCardmarketSearchUrl(
      'https://www.cardmarket.com/de/Pokemon/Products/Search?searchString=Pikachu'
    ),
    true
  );
});

test('isGeneratedCardmarketSearchUrl is case-insensitive', () => {
  assert.equal(
    isGeneratedCardmarketSearchUrl(
      'https://www.cardmarket.com/de/Pokemon/Products/Search?searchstring=Pikachu'
    ),
    true
  );
});

test('isGeneratedCardmarketSearchUrl returns false for direct product URLs', () => {
  assert.equal(
    isGeneratedCardmarketSearchUrl(
      'https://www.cardmarket.com/de/Pokemon/Products?idProduct=719442'
    ),
    false
  );
});

test('isGeneratedCardmarketSearchUrl returns false for non-cardmarket URLs', () => {
  assert.equal(isGeneratedCardmarketSearchUrl('https://example.com'), false);
});

test('isGeneratedCardmarketSearchUrl returns false for empty input', () => {
  assert.equal(isGeneratedCardmarketSearchUrl(''), false);
  assert.equal(isGeneratedCardmarketSearchUrl(null), false);
  assert.equal(isGeneratedCardmarketSearchUrl(undefined), false);
});

// ── isGeneratedCardmarketProductUrl ─────────────────────────────────

test('isGeneratedCardmarketProductUrl detects direct product URLs', () => {
  assert.equal(
    isGeneratedCardmarketProductUrl(
      'https://www.cardmarket.com/de/Pokemon/Products?idProduct=719442'
    ),
    true
  );
});

test('isGeneratedCardmarketProductUrl is case-insensitive', () => {
  assert.equal(
    isGeneratedCardmarketProductUrl(
      'https://www.cardmarket.com/DE/Pokemon/Products?idproduct=123'
    ),
    true
  );
});

test('isGeneratedCardmarketProductUrl returns false for search URLs', () => {
  assert.equal(
    isGeneratedCardmarketProductUrl(
      'https://www.cardmarket.com/de/Pokemon/Products/Search?searchString=Pikachu'
    ),
    false
  );
});

test('isGeneratedCardmarketProductUrl returns false for non-cardmarket URLs', () => {
  assert.equal(isGeneratedCardmarketProductUrl('https://example.com'), false);
});

test('isGeneratedCardmarketProductUrl returns false for empty input', () => {
  assert.equal(isGeneratedCardmarketProductUrl(''), false);
});

// ── isGeneratedCardmarketUrl (combined) ─────────────────────────────

test('isGeneratedCardmarketUrl detects search URLs', () => {
  assert.equal(
    isGeneratedCardmarketUrl(
      'https://www.cardmarket.com/de/Pokemon/Products/Search?searchString=Pikachu'
    ),
    true
  );
});

test('isGeneratedCardmarketUrl detects direct product URLs', () => {
  assert.equal(
    isGeneratedCardmarketUrl(
      'https://www.cardmarket.com/de/Pokemon/Products?idProduct=719442'
    ),
    true
  );
});

test('isGeneratedCardmarketUrl returns false for external URLs', () => {
  assert.equal(isGeneratedCardmarketUrl('https://example.com'), false);
});

test('isGeneratedCardmarketUrl returns false for empty input', () => {
  assert.equal(isGeneratedCardmarketUrl(''), false);
});

// ── isCardmarketProductUrl ────────────────────────────────────────

test('isCardmarketProductUrl recognises idProduct-style URLs', () => {
  assert.equal(
    isCardmarketProductUrl('https://www.cardmarket.com/de/Pokemon/Products?idProduct=719442'),
    true
  );
});

test('isCardmarketProductUrl recognises Singles slug URLs', () => {
  assert.equal(
    isCardmarketProductUrl('https://www.cardmarket.com/de/Pokemon/Products/Singles/Skyridge/Alakazam-V2-SK2'),
    true
  );
});

test('isCardmarketProductUrl rejects search URLs', () => {
  assert.equal(
    isCardmarketProductUrl('https://www.cardmarket.com/de/Pokemon/Products/Search?searchString=Pikachu'),
    false
  );
});

test('isCardmarketProductUrl rejects non-cardmarket URLs', () => {
  assert.equal(isCardmarketProductUrl('https://example.com/foo'), false);
});

test('isCardmarketProductUrl returns false for empty input', () => {
  assert.equal(isCardmarketProductUrl(''), false);
  assert.equal(isCardmarketProductUrl(null), false);
  assert.equal(isCardmarketProductUrl(undefined), false);
});

// ── applyReverseHoloQueryParam ────────────────────────────────────

test('applyReverseHoloQueryParam appends suffix to idProduct URL when isReverseHolo', () => {
  assert.equal(
    applyReverseHoloQueryParam('https://www.cardmarket.com/de/Pokemon/Products?idProduct=719442', true),
    'https://www.cardmarket.com/de/Pokemon/Products?idProduct=719442&isReverseHolo=Y'
  );
});

test('applyReverseHoloQueryParam appends suffix to Singles slug URL when isReverseHolo', () => {
  assert.equal(
    applyReverseHoloQueryParam('https://www.cardmarket.com/de/Pokemon/Products/Singles/Skyridge/Alakazam-V2-SK2', true),
    'https://www.cardmarket.com/de/Pokemon/Products/Singles/Skyridge/Alakazam-V2-SK2?isReverseHolo=Y'
  );
});

test('applyReverseHoloQueryParam uses & when URL already has a query', () => {
  assert.equal(
    applyReverseHoloQueryParam('https://www.cardmarket.com/de/Pokemon/Products?idProduct=719442&foo=bar', true),
    'https://www.cardmarket.com/de/Pokemon/Products?idProduct=719442&foo=bar&isReverseHolo=Y'
  );
});

test('applyReverseHoloQueryParam leaves URL unchanged when isReverseHolo is false', () => {
  assert.equal(
    applyReverseHoloQueryParam('https://www.cardmarket.com/de/Pokemon/Products/Singles/Skyridge/Alakazam-V2-SK2', false),
    'https://www.cardmarket.com/de/Pokemon/Products/Singles/Skyridge/Alakazam-V2-SK2'
  );
});

test('applyReverseHoloQueryParam leaves search URLs unchanged (suffix would be ignored anyway)', () => {
  assert.equal(
    applyReverseHoloQueryParam('https://www.cardmarket.com/de/Pokemon/Products/Search?searchString=Pikachu', true),
    'https://www.cardmarket.com/de/Pokemon/Products/Search?searchString=Pikachu'
  );
});

test('applyReverseHoloQueryParam leaves non-cardmarket URLs unchanged', () => {
  assert.equal(
    applyReverseHoloQueryParam('https://example.com/foo?bar=baz', true),
    'https://example.com/foo?bar=baz'
  );
});

test('applyReverseHoloQueryParam returns empty string for empty input', () => {
  assert.equal(applyReverseHoloQueryParam('', true), '');
  assert.equal(applyReverseHoloQueryParam(null, true), '');
  assert.equal(applyReverseHoloQueryParam(undefined, true), '');
});

test('applyReverseHoloQueryParam preserves trailing-slash URLs', () => {
  assert.equal(
    applyReverseHoloQueryParam('https://www.cardmarket.com/de/Pokemon/Products/Singles/Skyridge/Alakazam-V2-SK2/', true),
    'https://www.cardmarket.com/de/Pokemon/Products/Singles/Skyridge/Alakazam-V2-SK2/?isReverseHolo=Y'
  );
});
