// Centralised dev/prod environment detection for opt-in debugging features.
//
// `isLocalDevEnvironment()` returns true only when the app is served from a
// loopback / private-network address. Production builds on GitHub Pages
// (veraatversus.github.io / *.github.io) and any other public host are
// always treated as production.
//
// Use this to gate debug-only functionality that:
//
//   - depends on infra not available in production (e.g. local dev proxies)
//   - would expose data the user does not expect publicly
//   - is meant to help development but should not appear in shipping UIs
//
// When the function returns false, callers should:
//   - hide related settings UI
//   - skip related code paths entirely
//   - ignore related user-settings keys
//
// Tests can monkey-patch `globalThis.location` to simulate environments.

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);
const PRIVATE_HOST_PATTERNS = [
  /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/,
  /^192\.168\.\d{1,3}\.\d{1,3}$/,
  /^172\.(1[6-9]|2[0-9]|3[01])\.\d{1,3}\.\d{1,3}$/
];

export function isLocalDevEnvironment() {
  if (typeof globalThis === 'undefined' || !globalThis.location) return false;
  const host = String(globalThis.location.hostname || '').toLowerCase();
  if (!host) return false;
  if (LOOPBACK_HOSTS.has(host)) return true;
  return PRIVATE_HOST_PATTERNS.some((re) => re.test(host));
}
