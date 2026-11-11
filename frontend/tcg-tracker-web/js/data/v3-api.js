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

export function resolveV3Bases({ href = globalThis.location?.href, config = CONFIG } = {}) {
  const apis = config?.APIS || {};
  let v3 = apis.V3_BASE ? withSlash(apis.V3_BASE) : '';
  let registry = apis.REGISTRY_BASE ? withSlash(apis.REGISTRY_BASE) : '';
  if (!v3 || !registry) {
    if (!href) throw new Error('v3 API: cannot resolve base URL without location');
    const dir = appDirectoryUrl(href);
    if (!v3) v3 = new URL('../../api/v3/', dir).href;
    if (!registry) registry = new URL('../../api/registry/', dir).href;
  }
  return { v3, registry };
}

function fetchCached(url, { signal, fetchImpl } = {}) {
  if (cache.has(url)) return cache.get(url);
  const doFetch = fetchImpl || ((u, o) => fetch(u, o));
  const promise = (async () => {
    const response = await doFetch(url, { signal });
    if (!response.ok) throw new Error(`v3 API error ${response.status}: ${url}`);
    return response.json();
  })();
  cache.set(url, promise);
  promise.catch(() => {
    if (cache.get(url) === promise) cache.delete(url);
  });
  return promise;
}

function load(kind, file, opts = {}) {
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
