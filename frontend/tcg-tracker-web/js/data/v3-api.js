import { CONFIG } from '../core/config.js';

const cache = new Map(); // absolute URL -> Promise<json>

function withSlash(url) {
  const s = String(url || '').trim();
  return s.endsWith('/') ? s : `${s}/`;
}

function appDirectoryUrl(href) {
  const url = new URL(href);
  url.hash = '';
  url.search = '';
  let path = url.pathname;
  if (!path.endsWith('/')) {
    const last = path.slice(path.lastIndexOf('/') + 1);
    // A last segment with a dot is a file (index.html); otherwise a directory without trailing slash.
    path = last.includes('.') ? path.slice(0, path.lastIndexOf('/') + 1) : `${path}/`;
  }
  url.pathname = path;
  return url;
}

// Default bases, relative to the app directory:
// - GitHub Pages (deploy-pages.yml copies the app flat into the site root resp. `dev/`, repo `api/`
//   lands next to it): <appDir>/api/v3/ and <appDir>/api/registry/.
// - Local `npm run start:dev:full` (serves the repo root, app under /frontend/tcg-tracker-web/):
//   ../../api/v3/ and ../../api/registry/.
// `npm run start:dev` serves only the app directory (no api/): set CONFIG.APIS.V3_BASE / REGISTRY_BASE.
const REPO_APP_DIR_SUFFIX = '/frontend/tcg-tracker-web/';

export function resolveV3Bases({ href = globalThis.location?.href, config = CONFIG } = {}) {
  const apis = config?.APIS || {};
  const absolutise = (value) => withSlash(href ? new URL(String(value).trim(), href).href : value);
  let v3 = apis.V3_BASE ? absolutise(apis.V3_BASE) : '';
  let registry = apis.REGISTRY_BASE ? absolutise(apis.REGISTRY_BASE) : '';
  if (!v3 || !registry) {
    if (!href) throw new Error('v3 API: cannot resolve base URL without location');
    const dir = appDirectoryUrl(href);
    const prefix = dir.pathname.endsWith(REPO_APP_DIR_SUFFIX) ? '../../' : './';
    if (!v3) v3 = new URL(`${prefix}api/v3/`, dir).href;
    if (!registry) registry = new URL(`${prefix}api/registry/`, dir).href;
  }
  return { v3, registry };
}

function abortError(signal) {
  return signal.reason ?? new DOMException('The operation was aborted.', 'AbortError');
}

// Never hand a caller signal to the shared fetch; each caller races its own signal instead.
function raceSignal(promise, signal) {
  if (!signal) return promise;
  if (signal.aborted) return Promise.reject(abortError(signal));
  return new Promise((resolve, reject) => {
    const onAbort = () => reject(abortError(signal));
    signal.addEventListener('abort', onAbort, { once: true });
    promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', onAbort));
  });
}

// Cached payloads are shared objects: callers must not mutate them.
function fetchCached(url, { signal, fetchImpl } = {}) {
  let promise = cache.get(url);
  if (!promise) {
    const doFetch = fetchImpl || ((u, o) => fetch(u, o));
    promise = (async () => {
      const response = await doFetch(url);
      if (!response.ok) {
        const err = new Error(`v3 API error ${response.status}: ${url}`);
        err.status = response.status; // fuer isRetryableError (5xx/429 ueber die Ursache des v3-Wrappers)
        throw err;
      }
      return response.json();
    })();
    cache.set(url, promise);
    promise.catch(() => {
      if (cache.get(url) === promise) cache.delete(url);
    });
  }
  return raceSignal(promise, signal);
}

async function load(kind, file, opts = {}) {
  const bases = resolveV3Bases({ href: opts.href ?? globalThis.location?.href, config: opts.config ?? CONFIG });
  return fetchCached(bases[kind] + file, opts);
}

const cardFile = (setId) => `cards/${encodeURIComponent(setId)}.json`;

export const loadV3Sets = (opts) => load('v3', 'sets.json', opts);
export const loadV3Cards = (setId, opts) => load('v3', cardFile(setId), opts);
export const loadV3SearchIndex = (opts) => load('v3', 'search-index.json', opts);
export const loadV3Meta = (opts) => load('v3', 'meta.json', opts);
export const loadRegistrySets = (opts) => load('registry', 'sets.json', opts);
export const loadRegistryCards = (setId, opts) => load('registry', cardFile(setId), opts);

export function resetV3Caches() {
  cache.clear();
}
