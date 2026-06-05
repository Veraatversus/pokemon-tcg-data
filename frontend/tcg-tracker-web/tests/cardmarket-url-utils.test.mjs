import test from 'node:test';
import assert from 'node:assert/strict';

import {
  isGeneratedCardmarketSearchUrl,
  isGeneratedCardmarketProductUrl,
  isGeneratedCardmarketUrl,
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
