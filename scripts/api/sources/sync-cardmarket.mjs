// Laedt Cardmarkets Einzelkarten-Produktliste und den Preisguide und pflegt sources/cardmarket/:
// catalog.jsonl (Kategorie 51, nach ID sortiert), expansions.json, meta.json. Der Preisguide wird nie
// committet, sondern nur fuer den Build-Schritt nach .cache/cardmarket/price-guide.json gelegt.
// Ausfallschutz: Netzwerk-/HTTP-/Parse-Fehler ('failed') oder unplausible Daten ('defective') lassen
// sources/cardmarket/ bis auf meta.consecutiveFailures unveraendert und loeschen den Preisguide-Cache;
// der Lauf endet trotzdem mit Exit 0. Defekt sind auch Formatwechsel: < 99 % brauchbare Zeilen (idExpansion bzw.
// idProduct) oder mehr als max(200, 0,5 %) verschwundene Produkt-IDs des committeten Katalogs.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractProductsList, extractPriceGuideList } from './cardmarket-feeds.mjs';

export const SINGLES_URL = 'https://downloads.s3.cardmarket.com/productCatalog/productList/products_singles_6.json';
export const PRICE_GUIDE_URL = 'https://downloads.s3.cardmarket.com/productCatalog/priceGuide/price_guide_6.json';
export const USER_AGENT = 'veraatversus-cardmarket-builder/1.0';
// ~14 MB je Datei; 120 s je Versuch (eine Wiederholung)
export const FETCH_TIMEOUT_MS = 120_000;
export const SINGLES_CATEGORY = 51;
// Produktliste oder Preisguide mit weniger als 80 % der Eintraege des letzten erfolgreichen Laufs gilt als defekt.
export const MIN_RATIO = 0.8;
// Brauchbare Zeilen (Formatwechsel-Schutz): mindestens 99 % der Kategorie-51-Zeilen mit ganzzahliger idExpansion,
// mindestens 99 % der Preiszeilen mit numerischer idProduct.
export const MIN_USABLE_RATIO = 0.99;
// Hoechstens max(200, 0,5 %) der bisher bekannten Produkt-IDs (committeter Katalog) duerfen verschwinden.
export const MAX_VANISHED_ABS = 200;
export const MAX_VANISHED_RATIO = 0.005;

const toId = (v) => { const n = Number(v); return Number.isInteger(n) && n > 0 ? n : null; };

// Anteil brauchbarer Zeilen: { rows, usable }
export function usableSingles(singlesPayload) {
  const rows = extractProductsList(singlesPayload).filter((p) => Number(p?.idCategory) === SINGLES_CATEGORY);
  return { rows: rows.length, usable: rows.filter((p) => toId(p.idProduct) !== null && toId(p.idExpansion) !== null).length };
}

export function usablePrices(priceGuidePayload) {
  const rows = extractPriceGuideList(priceGuidePayload);
  return { rows: rows.length, usable: rows.filter((r) => toId(r?.idProduct) !== null).length };
}

// IDs des committeten Katalogs (leer, wenn es keinen gibt oder er unlesbar ist)
function readCatalogIds(file) {
  if (!fs.existsSync(file)) return [];
  const ids = [];
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    try { const id = toId(JSON.parse(line).id); if (id !== null) ids.push(id); } catch { /* Zeile ignorieren */ }
  }
  return ids;
}

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
    // Fehlender Cache bedeutet immer "heute kein Preisguide" – nie einen veralteten liegen lassen.
    fs.rmSync(priceGuidePath, { force: true });
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
  // Preise = brauchbare Zeilen (numerische idProduct); Grundlage fuer Plausibilitaet und meta.prices
  const pu = usablePrices(priceGuide);
  const prices = pu.usable;
  if (catalog.length === 0) return fail('defective', 'keine Einzelkarten in der Produktliste');
  const su = usableSingles(singles);
  if (su.usable < su.rows * MIN_USABLE_RATIO) {
    return fail('defective', `nur ${su.usable} von ${su.rows} Einzelkarten mit ganzzahliger idExpansion/idProduct (< ${MIN_USABLE_RATIO * 100} %)`);
  }
  if (prev.products > 0 && catalog.length < prev.products * MIN_RATIO) {
    return fail('defective', `Produktliste mit ${catalog.length} statt zuletzt ${prev.products} Einzelkarten (< ${MIN_RATIO * 100} %)`);
  }
  if (prices === 0) return fail('defective', 'Preisguide ohne Eintraege');
  if (pu.usable < pu.rows * MIN_USABLE_RATIO) {
    return fail('defective', `nur ${pu.usable} von ${pu.rows} Preiszeilen mit numerischer idProduct (< ${MIN_USABLE_RATIO * 100} %)`);
  }
  if (prev.prices > 0 && prices < prev.prices * MIN_RATIO) {
    return fail('defective', `Preisguide mit ${prices} statt zuletzt ${prev.prices} Eintraegen (< ${MIN_RATIO * 100} %)`);
  }

  const known = readCatalogIds(catalogFile);
  if (known.length) {
    const current = new Set(catalog.map((p) => p.id));
    const vanished = known.filter((id) => !current.has(id)).length;
    const limit = Math.max(MAX_VANISHED_ABS, known.length * MAX_VANISHED_RATIO);
    if (vanished > limit) {
      return fail('defective', `${vanished} von ${known.length} bekannten Produkt-IDs fehlen (Grenze ${Math.floor(limit)})`);
    }
  }

  const catalogText = serializeCatalog(catalog);
  const catalogChanged = !fs.existsSync(catalogFile) || fs.readFileSync(catalogFile, 'utf8') !== catalogText;
  writeAtomic(priceGuidePath, JSON.stringify(priceGuide));
  if (catalogChanged) writeAtomic(catalogFile, catalogText);
  writeAtomic(path.join(dir, 'expansions.json'), pretty(toExpansions(catalog)));
  const next = {
    singlesCreatedAt: singles?.createdAt ?? null,
    priceGuideCreatedAt: priceGuide?.createdAt ?? null,
    products: catalog.length,
    prices,
    lastSuccess: now().toISOString(),
    consecutiveFailures: 0,
  };
  // Idempotent: gleicher Datenstand wie der letzte Erfolg (z. B. zweiter Lauf am selben Tag) -> meta.json bleibt
  // byte-gleich (lastSuccess = erster Erfolg mit diesem Stand), damit kein Commit nur fuer den Zeitstempel entsteht.
  const unchanged = prev.lastSuccess && prev.consecutiveFailures === 0
    && ['singlesCreatedAt', 'priceGuideCreatedAt', 'products', 'prices'].every((k) => prev[k] === next[k]);
  if (!unchanged) writeAtomic(metaFile, pretty(next));
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
