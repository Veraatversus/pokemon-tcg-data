import test from 'node:test';
import assert from 'node:assert/strict';

import { isLocalDevEnvironment } from '../js/core/dev-environment.js';

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
