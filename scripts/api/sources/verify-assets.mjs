// Prueft inkrementell, ob assets.tcgdex.net die Set-Logos und -Symbole aus dem Assets-Index
// wirklich ausliefert, und fuehrt das Ergebnis in sources/tcgdex/assets-verified.json.
// `ok` wird nie erneut geprueft, `missing` nach recheckMissingDays, Unbekanntes einmal.
// Netzwerkfehler/Timeouts aendern nichts: ein bekannter Status bleibt, Unbekanntes bleibt unbekannt.
// Kartenbilder aus dem Index werden nicht einzeln geprueft (Last im Workflow; Fallback im Frontend). Fuer Sets, die
// der Index noch nicht fuehrt, je Sprache erst eine Stichprobe (erste/letzte Karte); besteht eine davon, jede Karte
// einzeln (cardImageCandidates in images.mjs). Dazu Scrydex fuer Karten ohne jedes Bild (scrydexCandidates).
// CLI: node scripts/api/sources/verify-assets.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setAssetCandidates, cardSampleCandidates, cardImageCandidates, scrydexCandidates, SCRYDEX_BASE } from '../merge/images.mjs';
import { loadTcgdexDatabase } from '../tcgdex/load-database.mjs';
import { toJson } from '../registry/registry-io.mjs';

const DAY_MS = 86400000;
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';

// HTTP-Status -> 'ok' | 'missing' | null (voruebergehend, nichts aendern).
// 401/403 (Sperre, Bot-Schutz), 408/429 und 5xx sagen nichts ueber das Asset aus.
const TRANSIENT_4XX = new Set([401, 403, 408, 429]);
export function classifyStatus(status) {
  if (typeof status !== 'number') return null;
  if (status >= 200 && status < 300) return 'ok';
  if (status >= 400 && status < 500 && !TRANSIENT_4XX.has(status)) return 'missing';
  return null;
}

async function mapLimit(items, limit, fn) {
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      await fn(items[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}

export async function verifyAssets({ urls, previous = {}, probe, now = () => new Date(), recheckMissingDays = 7, concurrency = 16 }) {
  const at = now();
  const out = {};
  const todo = [];
  for (const url of new Set(urls)) {
    const prev = previous[url];
    const fresh = prev?.status === 'ok'
      || (prev?.status === 'missing' && at.getTime() - Date.parse(prev.checkedAt) < recheckMissingDays * DAY_MS);
    if (fresh) out[url] = prev;
    else todo.push(url);
  }
  await mapLimit(todo, concurrency, async (url) => {
    let status = null;
    try {
      status = classifyStatus(await probe(url));
    } catch {
      status = null;
    }
    if (status) out[url] = { status, checkedAt: at.toISOString() };
    else if (previous[url]) out[url] = previous[url];
  });
  return out;
}

// Gruppen [webp, png]: png nur pruefen, wenn webp als fehlend feststeht (halbiert die Anfragen).
export async function verifySetAssets({ groups, ...opts }) {
  const first = await verifyAssets({ ...opts, urls: groups.map((g) => g[0]) });
  const rest = groups.filter((g) => first[g[0]]?.status === 'missing').flatMap((g) => g.slice(1));
  const second = rest.length ? await verifyAssets({ ...opts, urls: rest }) : {};
  return { ...first, ...second };
}

// HEAD, bei abgelehntem HEAD (405/501) GET; Netzwerkfehler/Timeout -> null.
export async function httpProbe(url, { timeoutMs = 10000 } = {}) {
  const request = async (method) => {
    const res = await fetch(url, { method, headers: { 'User-Agent': USER_AGENT }, redirect: 'follow', signal: AbortSignal.timeout(timeoutMs) });
    await res.body?.cancel();
    return res.status;
  };
  try {
    const status = await request('HEAD');
    return status === 405 || status === 501 ? await request('GET') : status;
  } catch {
    return null;
  }
}

// Scrydex liefert fehlende Karten mit 200 und Kartenrueckseite aus (immer dieselbe ETag). Die ETag des Platzhalters
// kommt von einer sicher nicht vorhandenen Karte; ein Treffer gilt als 404. Ohne bekannte Platzhalter-ETag (Fehler
// beim Abruf) ist jedes Ergebnis voruebergehend (null), damit kein Platzhalter als 'ok' gespeichert wird.
export async function scrydexPlaceholderEtag({ head = httpHead } = {}) {
  const res = await head(`${SCRYDEX_BASE}/__none__-0/small`);
  return res && res.status >= 200 && res.status < 300 && res.etag ? res.etag : null;
}
export function scrydexStatus(res, placeholderEtag) {
  if (!res || !placeholderEtag) return null;
  if (res.status >= 200 && res.status < 300 && (!res.etag || res.etag === placeholderEtag)) return 404;
  return res.status;
}
export async function httpHead(url, { timeoutMs = 10000 } = {}) {
  try {
    const res = await fetch(url, { method: 'HEAD', headers: { 'User-Agent': USER_AGENT }, redirect: 'follow', signal: AbortSignal.timeout(timeoutMs) });
    await res.body?.cancel();
    return { status: res.status, etag: res.headers.get('etag') };
  } catch {
    return null;
  }
}

// Zuletzt veroeffentlichte Karten (api/v3/cards/*.json), fuer die Scrydex-Kandidaten.
function loadPublishedCards(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort()
    .flatMap((f) => {
      const data = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
      return Array.isArray(data) ? data : data.cards ?? [];
    });
}

// Schreibt sortiert und nur bei Aenderung; liefert true, wenn geschrieben wurde.
export function updateVerifiedFile(file, verified) {
  const content = toJson(verified);
  if (fs.existsSync(file) && fs.readFileSync(file, 'utf8') === content) return false;
  fs.writeFileSync(file, content);
  return true;
}

// Zaehlt je Asset-Gruppe ([webp, png]): ok, wenn eine Variante ok ist; fehlt nur, wenn alle Varianten
// als fehlend verifiziert sind; sonst unbekannt (nicht gezaehlt).
export function countGroups(verified, groups) {
  const counts = { ok: 0, missing: 0 };
  for (const group of groups) {
    const statuses = group.map((u) => verified?.[u]?.status);
    if (statuses.includes('ok')) counts.ok++;
    else if (statuses.every((s) => s === 'missing')) counts.missing++;
  }
  return counts;
}

async function main() {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
  const dir = path.join(repoRoot, 'sources', 'tcgdex');
  const file = path.join(dir, 'assets-verified.json');
  const index = JSON.parse(fs.readFileSync(path.join(dir, 'assets-index.json'), 'utf8'));
  const previous = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};
  const groups = setAssetCandidates(index);
  const excluded = JSON.parse(fs.readFileSync(path.join(repoRoot, 'api', 'mappings', 'excluded-series.json'), 'utf8')).series ?? [];
  const sets = loadTcgdexDatabase(dir, { excludeSerieIds: excluded }).sets;
  const samples = cardSampleCandidates(index, sets);
  const scrydexUrls = scrydexCandidates(loadPublishedCards(path.join(repoRoot, 'api', 'v3', 'cards')));
  const started = Date.now();
  let probes = 0;
  const probe = (url) => {
    probes++;
    return httpProbe(url);
  };
  const sampled = await verifyAssets({ urls: samples.flatMap((s) => s.urls), previous, probe });
  const perCard = cardImageCandidates(index, sets, sampled);
  const placeholder = scrydexUrls.length ? await scrydexPlaceholderEtag() : null;
  const scrydexProbe = async (url) => {
    probes++;
    return scrydexStatus(await httpHead(url), placeholder);
  };
  const verified = {
    ...await verifySetAssets({ groups, previous, probe }),
    ...sampled,
    ...await verifyAssets({ urls: perCard.flatMap((c) => c.urls), previous: { ...previous, ...sampled }, probe }),
    ...await verifyAssets({ urls: scrydexUrls, previous, probe: scrydexProbe, concurrency: 8 }),
  };
  const okCount = (urls) => urls.filter((u) => verified[u]?.status === 'ok').length;
  const cardOk = perCard.map((c) => `${c.lang}/${c.setId} ${okCount(c.urls)}/${c.urls.length}`);
  const written = updateVerifiedFile(file, verified);
  const c = countGroups(verified, groups);
  console.log(`Set-Assets: ${groups.length} Kandidaten, ${probes} Anfragen, ${c.ok} ok, ${c.missing} fehlen; Kartenbilder ohne Index-Eintrag: ${samples.length} Sets/Sprachen geprueft, ${perCard.length} mit Bildern${cardOk.length ? ` (${cardOk.join(', ')})` : ''}; Scrydex: ${okCount(scrydexUrls)}/${scrydexUrls.length} Karten ohne Bild vorhanden${scrydexUrls.length && !placeholder ? ' (Platzhalter unbekannt, nicht geprueft)' : ''} (${((Date.now() - started) / 1000).toFixed(1)} s)${written ? '' : ', unveraendert'}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
