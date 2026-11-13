// Laedt Cardmarkets Einzelkarten-Produktliste und den Preisguide und pflegt sources/cardmarket/:
// catalog.jsonl (Kategorie 51, nach ID sortiert), expansions.json, meta.json. Der Preisguide wird nie
// committet, sondern nur fuer den Build-Schritt nach .cache/cardmarket/price-guide.json gelegt.
// Ausfallschutz: Netzwerk-/HTTP-/Parse-Fehler ('failed') oder unplausible Daten ('defective') lassen
// sources/cardmarket/ bis auf meta.consecutiveFailures unveraendert; der Lauf endet trotzdem mit Exit 0.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractProductsList, extractPriceGuideList } from './cardmarket-feeds.mjs';

export const SINGLES_URL = 'https://downloads.s3.cardmarket.com/productCatalog/productList/products_singles_6.json';
export const PRICE_GUIDE_URL = 'https://downloads.s3.cardmarket.com/productCatalog/priceGuide/price_guide_6.json';
export const USER_AGENT = 'veraatversus-cardmarket-builder/1.0';
export const FETCH_TIMEOUT_MS = 30_000;
export const SINGLES_CATEGORY = 51;
// Preisguide mit weniger als 80 % der Eintraege des letzten erfolgreichen Laufs gilt als defekt.
export const MIN_PRICE_RATIO = 0.8;

const EMPTY_META = {
  singlesCreatedAt: null,
  priceGuideCreatedAt: null,
  products: 0,
  prices: 0,
  lastSuccess: null,
  consecutiveFailures: 0,
};

export async function defaultFetchJson(url) {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    headers: { 'user-agent': USER_AGENT, accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText} fuer ${url}`);
  return res.json();
}

async function withRetry(fn, url, retryDelayMs) {
  try {
    return await fn(url);
  } catch (e) {
    console.warn(`Cardmarket: ${url} fehlgeschlagen (${e.message}), ein neuer Versuch`);
    if (retryDelayMs > 0) await new Promise((r) => setTimeout(r, retryDelayMs));
    return fn(url);
  }
}

export function toCatalog(singlesPayload) {
  const byId = new Map();
  for (const p of extractProductsList(singlesPayload)) {
    if (Number(p?.idCategory) !== SINGLES_CATEGORY) continue;
    const id = Number(p.idProduct);
    if (!Number.isInteger(id) || id <= 0 || byId.has(id)) continue;
    const collector = String(p.collectorNumber ?? p.number ?? '').trim();
    byId.set(id, {
      id,
      name: String(p.name ?? '').trim(),
      expansionId: Number(p.idExpansion) || null,
      collectorNumber: collector || null,
      metacardId: Number(p.idMetacard) || null,
      dateAdded: p.dateAdded ?? null,
    });
  }
  return [...byId.values()].sort((a, b) => a.id - b.id);
}

// Die Produktliste enthaelt keine Erweiterungsnamen; name bleibt null, bis eine Quelle dafuer existiert.
export function toExpansions(catalog) {
  const counts = new Map();
  for (const p of catalog) {
    if (p.expansionId == null) continue;
    counts.set(p.expansionId, (counts.get(p.expansionId) ?? 0) + 1);
  }
  return [...counts].sort((a, b) => a[0] - b[0]).map(([id, products]) => ({ id, name: null, products }));
}

export function serializeCatalog(catalog) {
  return catalog.map((p) => `${JSON.stringify(p)}\n`).join('');
}

const pretty = (value) => `${JSON.stringify(value, null, 2)}\n`;

function writeAtomic(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, content);
  fs.renameSync(tmp, file);
}

function readMeta(file) {
  if (!fs.existsSync(file)) return { ...EMPTY_META };
  try {
    return { ...EMPTY_META, ...JSON.parse(fs.readFileSync(file, 'utf8')) };
  } catch {
    return { ...EMPTY_META };
  }
}

export async function syncCardmarket({ repoRoot, fetchJson = defaultFetchJson, now = () => new Date(), retryDelayMs = 5_000 }) {
  const dir = path.join(repoRoot, 'sources', 'cardmarket');
  const metaFile = path.join(dir, 'meta.json');
  const catalogFile = path.join(dir, 'catalog.jsonl');
  const priceGuidePath = path.join(repoRoot, '.cache', 'cardmarket', 'price-guide.json');
  const prev = readMeta(metaFile);

  const fail = (status, reason) => {
    console.warn(`Cardmarket ${status}: ${reason} – vorheriger Stand bleibt (Fehlschlaege in Folge: ${prev.consecutiveFailures + 1})`);
    writeAtomic(metaFile, pretty({ ...prev, consecutiveFailures: prev.consecutiveFailures + 1 }));
    return { status, catalogChanged: false, priceGuidePath: null };
  };

  let singles;
  let priceGuide;
  try {
    singles = await withRetry(fetchJson, SINGLES_URL, retryDelayMs);
    priceGuide = await withRetry(fetchJson, PRICE_GUIDE_URL, retryDelayMs);
  } catch (e) {
    return fail('failed', e.message);
  }

  const catalog = toCatalog(singles);
  const prices = extractPriceGuideList(priceGuide).length;
  if (catalog.length === 0) return fail('defective', 'keine Einzelkarten in der Produktliste');
  if (prices === 0) return fail('defective', 'Preisguide ohne Eintraege');
  if (prev.prices > 0 && prices < prev.prices * MIN_PRICE_RATIO) {
    return fail('defective', `Preisguide mit ${prices} statt zuletzt ${prev.prices} Eintraegen (< ${MIN_PRICE_RATIO * 100} %)`);
  }

  const catalogText = serializeCatalog(catalog);
  const catalogChanged = !fs.existsSync(catalogFile) || fs.readFileSync(catalogFile, 'utf8') !== catalogText;
  writeAtomic(priceGuidePath, JSON.stringify(priceGuide));
  if (catalogChanged) writeAtomic(catalogFile, catalogText);
  writeAtomic(path.join(dir, 'expansions.json'), pretty(toExpansions(catalog)));
  writeAtomic(metaFile, pretty({
    singlesCreatedAt: singles?.createdAt ?? null,
    priceGuideCreatedAt: priceGuide?.createdAt ?? null,
    products: catalog.length,
    prices,
    lastSuccess: now().toISOString(),
    consecutiveFailures: 0,
  }));
  console.log(`Cardmarket ok: ${catalog.length} Einzelkarten, ${prices} Preise${catalogChanged ? ', Katalog geaendert' : ''}`);
  return { status: 'ok', catalogChanged, priceGuidePath };
}

async function main() {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
  const res = await syncCardmarket({ repoRoot });
  console.log(JSON.stringify(res));
}

// Ein Cardmarket-Ausfall laesst den Lauf nicht scheitern ('failed'/'defective' enden mit Exit 0);
// nur echte Programmfehler (z. B. Schreibfehler) fuehren zu Exit 1.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
