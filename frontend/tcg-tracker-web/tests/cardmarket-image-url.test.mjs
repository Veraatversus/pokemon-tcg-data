import test from 'node:test';
import assert from 'node:assert/strict';

import { buildCardmarketImageUrl } from '../js/data/cardmarket-ui-helpers.js';
import { buildCardmarketImageUrl as buildCardmarketImageUrlData } from '../js/data/cardmarket-data.js';
import { buildCardmarketImageUrl as buildCardmarketImageUrlLib } from '../../../scripts/cardmarket/lib/cardmarket-ui-helpers.mjs';
import { isLocalDevEnvironment } from '../js/core/dev-environment.js';

// Tests that exercise the dev-only proxy branch need a fake `location` whose
// hostname is a loopback address. Save and restore the real value to keep
// other tests in this file deterministic.
function withDevLocation(fn) {
  const realLocation = globalThis.location;
  Object.defineProperty(globalThis, 'location', {
    value: { hostname: 'localhost' },
    configurable: true,
    writable: true
  });
  try {
    return fn();
  } finally {
    Object.defineProperty(globalThis, 'location', {
      value: realLocation,
      configurable: true,
      writable: true
    });
  }
}

test('buildCardmarketImageUrl returns the expected S3 URL for valid inputs', () => {
  assert.equal(
    buildCardmarketImageUrl({ cardmarketProductId: 886394, categoryId: 51, setCode: 'cri' }),
    'https://product-images.s3.cardmarket.com/51/CRI/886394/886394.jpg'
  );
});

test('buildCardmarketImageUrl upper-cases the setCode', () => {
  assert.equal(
    buildCardmarketImageUrl({ cardmarketProductId: 886394, categoryId: 51, setCode: 'cri' }),
    buildCardmarketImageUrl({ cardmarketProductId: 886394, categoryId: 51, setCode: 'CRI' })
  );
});

test('buildCardmarketImageUrl returns empty string when cardmarketProductId is missing or invalid', () => {
  assert.equal(buildCardmarketImageUrl({ categoryId: 51, setCode: 'CRI' }), '');
  assert.equal(buildCardmarketImageUrl({ cardmarketProductId: '', categoryId: 51, setCode: 'CRI' }), '');
  assert.equal(buildCardmarketImageUrl({ cardmarketProductId: 'abc', categoryId: 51, setCode: 'CRI' }), '');
  assert.equal(buildCardmarketImageUrl({ cardmarketProductId: null, categoryId: 51, setCode: 'CRI' }), '');
});

test('buildCardmarketImageUrl returns empty string when categoryId is missing or invalid', () => {
  assert.equal(buildCardmarketImageUrl({ cardmarketProductId: 886394, setCode: 'CRI' }), '');
  assert.equal(buildCardmarketImageUrl({ cardmarketProductId: 886394, categoryId: '', setCode: 'CRI' }), '');
  assert.equal(buildCardmarketImageUrl({ cardmarketProductId: 886394, categoryId: 'pokemon', setCode: 'CRI' }), '');
});

test('buildCardmarketImageUrl returns empty string when setCode is missing or empty', () => {
  assert.equal(buildCardmarketImageUrl({ cardmarketProductId: 886394, categoryId: 51 }), '');
  assert.equal(buildCardmarketImageUrl({ cardmarketProductId: 886394, categoryId: 51, setCode: '' }), '');
  assert.equal(buildCardmarketImageUrl({ cardmarketProductId: 886394, categoryId: 51, setCode: '   ' }), '');
});

test('buildCardmarketImageUrl accepts numeric or string productId/categoryId and coerces to digits', () => {
  assert.equal(
    buildCardmarketImageUrl({ cardmarketProductId: '886394', categoryId: '51', setCode: 'cri' }),
    'https://product-images.s3.cardmarket.com/51/CRI/886394/886394.jpg'
  );
});

test('buildCardmarketImageUrl returns empty string for empty / undefined options object', () => {
  assert.equal(buildCardmarketImageUrl(), '');
  assert.equal(buildCardmarketImageUrl({}), '');
});

test('frontend cardmarket-data wrapper mirrors the helper behaviour', () => {
  assert.equal(
    buildCardmarketImageUrlData({ cardmarketProductId: 886394, categoryId: 51, setCode: 'cri' }),
    'https://product-images.s3.cardmarket.com/51/CRI/886394/886394.jpg'
  );
  assert.equal(buildCardmarketImageUrlData({ cardmarketProductId: 0, categoryId: 51, setCode: 'CRI' }), '');
});

test('lib cardmarket-ui-helpers exports the same builder for build-time parity', () => {
  assert.equal(
    buildCardmarketImageUrlLib({ cardmarketProductId: 886394, categoryId: 51, setCode: 'cri' }),
    'https://product-images.s3.cardmarket.com/51/CRI/886394/886394.jpg'
  );
  assert.equal(buildCardmarketImageUrlLib({ cardmarketProductId: 886394, categoryId: 51 }), '');
});

test('buildCardmarketImageUrl uses proxyUrl when provided AND running in a local-dev environment', () => {
  withDevLocation(() => {
    assert.equal(
      buildCardmarketImageUrl({ cardmarketProductId: 886394, categoryId: 51, setCode: 'cri', proxyUrl: 'http://localhost:8090' }),
      'http://localhost:8090/cardmarket-image-proxy?productId=886394&categoryId=51&setCode=CRI'
    );
    assert.equal(
      buildCardmarketImageUrl({ cardmarketProductId: 886394, categoryId: 51, setCode: 'cri', proxyUrl: 'http://localhost:8090/' }),
      'http://localhost:8090/cardmarket-image-proxy?productId=886394&categoryId=51&setCode=CRI'
    );
  });
});

test('buildCardmarketImageUrl ignores proxyUrl in production (non-loopback hostname)', () => {
  // Save and force a non-loopback hostname to simulate a production-like
  // environment, then restore.
  const realLocation = globalThis.location;
  Object.defineProperty(globalThis, 'location', {
    value: { hostname: 'veraatversus.github.io' },
    configurable: true,
    writable: true
  });
  try {
    assert.equal(
      buildCardmarketImageUrl({ cardmarketProductId: 886394, categoryId: 51, setCode: 'cri', proxyUrl: 'http://localhost:8090' }),
      'https://product-images.s3.cardmarket.com/51/CRI/886394/886394.jpg'
    );
  } finally {
    Object.defineProperty(globalThis, 'location', {
      value: realLocation,
      configurable: true,
      writable: true
    });
  }
});

test('buildCardmarketImageUrl returns empty when proxyUrl is set but required fields are missing', () => {
  withDevLocation(() => {
    assert.equal(buildCardmarketImageUrl({ proxyUrl: 'http://localhost:8090' }), '');
    assert.equal(buildCardmarketImageUrl({ proxyUrl: 'http://localhost:8090', setCode: 'CRI' }), '');
  });
});

test('isLocalDevEnvironment returns true for loopback and private-network hosts', () => {
  const realLocation = globalThis.location;
  for (const host of ['localhost', '127.0.0.1', '::1', '10.0.0.5', '192.168.1.10', '172.16.0.1']) {
    Object.defineProperty(globalThis, 'location', { value: { hostname: host }, configurable: true, writable: true });
    assert.equal(isLocalDevEnvironment(), true, `expected dev for ${host}`);
  }
  Object.defineProperty(globalThis, 'location', { value: realLocation, configurable: true, writable: true });
});

test('isLocalDevEnvironment returns false for public hosts and missing location', () => {
  const realLocation = globalThis.location;
  for (const host of ['veraatversus.github.io', 'example.com', '127.0.0.1.evil.com', '8.8.8.8']) {
    Object.defineProperty(globalThis, 'location', { value: { hostname: host }, configurable: true, writable: true });
    assert.equal(isLocalDevEnvironment(), false, `expected prod for ${host}`);
  }
  // Missing location
  Object.defineProperty(globalThis, 'location', { value: undefined, configurable: true, writable: true });
  assert.equal(isLocalDevEnvironment(), false);
  Object.defineProperty(globalThis, 'location', { value: realLocation, configurable: true, writable: true });
});
