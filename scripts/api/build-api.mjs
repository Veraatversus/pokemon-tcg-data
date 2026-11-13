// Baut die statische v3-API (api/v3/) und die eingefrorene Registry (api/registry/).
// CLI: node scripts/api/build-api.mjs [--tcgdex-only] [--out <dir>]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadPokemontcg } from './sources/load-pokemontcg.mjs';
import { loadTcgdexDatabase } from './tcgdex/load-database.mjs';
import { runMatching } from './match/run-matching.mjs';
import {
  buildRegistry, assertFrozen, registryChanges, RegistryFrozenError, RegistryInvariantError,
} from './registry/build-registry.mjs';
import { readRegistry, writeRegistry, toJson, toCompactJson, assertSafeSetId } from './registry/registry-io.mjs';
import { learnTables } from './merge/learn-tables.mjs';
import { loadLegals } from './merge/legalities.mjs';
import { mergeCard } from './merge/merge-card.mjs';
import { mergeSet } from './merge/merge-set.mjs';
import { fillCardmarketIds, primaryCardmarketId, previousFromCards } from './merge/cardmarket-ids.mjs';
import { writePriceFiles } from './merge/cardmarket-prices.mjs';
import { loadCardmarketCatalog } from './sources/cardmarket-catalog.mjs';
import { setAssetCandidates } from './merge/images.mjs';
import { countGroups } from './sources/verify-assets.mjs';
import { sortLocalIds } from './lib/local-ids.mjs';

const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const readJsonOr = (p, fallback) => (fs.existsSync(p) ? readJson(p) : fallback);
const short = (commit) => (commit ? String(commit).slice(0, 8) : undefined);
const STATUSES = ['matched', 'primary_only', 'tcgdex_only'];

export class BuildValidationError extends Error {
  constructor(violations, heading = 'Pflichtfelder fehlen') {
    super(`${heading} (${violations.length}):\n  ${violations.slice(0, 50).join('\n  ')}`);
    this.name = 'BuildValidationError';
    this.violations = violations;
  }
}

export class BuildParseError extends Error {
  constructor(errors) {
    super(`TCGdex-Parse-Fehler (${errors.length}):\n  ${errors.slice(0, 20).map((e) => `${e.file}: ${e.message}`).join('\n  ')}`);
    this.name = 'BuildParseError';
    this.errors = errors;
  }
}

const filled = (v) => typeof v === 'string' && v.trim() !== '';

export function requiredFieldViolations({ sets, cardsBySet }) {
  const out = [];
  for (const s of sets) {
    for (const f of ['id', 'name']) if (!filled(s[f])) out.push(`Set ${s.id ?? '?'}: ${f} fehlt`);
  }
  for (const cards of cardsBySet.values()) {
    for (const c of cards) {
      for (const f of ['id', 'setId', 'cardId', 'name', 'number']) if (!filled(c[f])) out.push(`Karte ${c.id ?? '?'}: ${f} fehlt`);
    }
  }
  return out;
}

function writeIfChanged(file, content) {
  if (fs.existsSync(file) && fs.readFileSync(file, 'utf8') === content) return;
  fs.writeFileSync(file, content);
}

export function runBuild({
  repoRoot, tcgdexOnly = false, outDir = 'api/v3', registryDir = 'api/registry', writeRegistry: doWriteRegistry = true, previousDir = null,
}) {
  const p = (...parts) => path.join(repoRoot, ...parts);
  const db = loadTcgdexDatabase(p('sources', 'tcgdex'));
  if (db.errors.length) throw new BuildParseError(db.errors);
  const tdById = new Map(db.sets.map((s) => [s.id, s]));

  let ptSets = [];
  let ptCardsBySet = new Map();
  let setResult = { pairs: [] };
  let cardResults = new Map();
  if (!tcgdexOnly) {
    ({ sets: ptSets, cardsBySet: ptCardsBySet } = loadPokemontcg(p('sources', 'pokemontcg')));
    ({ setResult, cardResults } = runMatching({
      ptSets, ptCardsBySet, tcgdexSets: db.sets,
      setMap: readJson(p('api', 'mappings', 'set-map.json')),
      cardMap: readJson(p('api', 'mappings', 'card-map.json')),
    }));
  }

  const registryAbs = path.resolve(repoRoot, registryDir);
  const previous = readRegistry(registryAbs);
  if (tcgdexOnly && !previous) throw new Error(`--tcgdex-only braucht eine vorhandene Registry (${registryAbs})`);
  const registry = buildRegistry({
    ptSets, ptCardsBySet, tcgdexSets: db.sets, setPairs: setResult.pairs, cardResults,
    subsetMerge: readJson(p('api', 'mappings', 'subset-merge.json')),
    canonicalKeyOverrides: readJson(p('api', 'mappings', 'canonical-keys.json')),
    legacySetAliases: readJsonOr(p('api', 'mappings', 'legacy-set-aliases.json'), {}),
    previous,
  });
  for (const id of Object.keys(registry.sets)) assertSafeSetId(id);
  if (previous) assertFrozen(previous, registry);
  const changes = registryChanges(previous, registry);

  // Ableitungstabellen aus sicher gematchten Paaren
  const ptById = new Map();
  for (const cards of ptCardsBySet.values()) for (const c of cards) ptById.set(c.id, c);
  const tdCard = (setId, localId) => tdById.get(setId)?.cards.find((c) => c.localId === localId);
  const pairs = [];
  for (const res of cardResults.values()) {
    for (const m of res.matched ?? []) {
      if (m.suspicious) continue;
      const ptCard = ptById.get(m.ptId);
      for (const r of m.tcgdex) {
        const td = tdCard(r.setId, r.localId);
        if (ptCard && td) pairs.push({ ptCard, tcgdexCard: td });
      }
    }
  }
  const tables = learnTables(pairs);
  const legals = loadLegals(p('sources', 'tcgdex', 'meta', 'legals.ts'));
  const assetsIndex = readJsonOr(p('sources', 'tcgdex', 'assets-index.json'), {});
  // Pruefstand der Set-Logos/-Symbole (verify-assets.mjs); fehlt die Datei, wird alles ausgegeben.
  const assetsVerified = readJsonOr(p('sources', 'tcgdex', 'assets-verified.json'), {});
  const assets = countGroups(assetsVerified, setAssetCandidates(assetsIndex));
  const sources = readJson(p('sources', 'SOURCES.json'));
  const sourceCommits = { pokemontcg: short(sources.pokemontcg?.commit), tcgdex: short(sources.tcgdex?.commit) };
  const ptSetById = new Map(ptSets.map((s) => [s.id, s]));
  const tdIndex = new Map(db.sets.map((s) => [s.id, new Map(s.cards.map((c) => [c.localId, c]))]));

  const sets = [];
  const cardsBySet = new Map();
  const skippedNoSource = [];
  const subsetExpansion = new Map(); // Unterset-Karte -> Cardmarket-Expansion ihres TCGdex-Untersets
  const lostSource = [];
  const matchStatus = Object.fromEntries(STATUSES.map((s) => [s, 0]));
  for (const setId of Object.keys(registry.sets).sort(cmp)) {
    const registrySet = registry.sets[setId];
    const tcgdexSet = registrySet.tcgdex ? tdById.get(registrySet.tcgdex) ?? null : null;
    const cards = [];
    for (const [cardId, rc] of Object.entries(registry.cards[setId] ?? {})) {
      const ptCard = rc.pokemontcg ? ptById.get(rc.pokemontcg) ?? null : null;
      const tcgdexCards = (rc.tcgdex ?? []).map((r) => {
        const c = tdIndex.get(r.set)?.get(r.localId);
        if (!c) throw new Error(`TCGdex-Karte ${r.set}/${r.localId} fehlt (Registry ${setId}/${cardId})`);
        return { ...c, set: tdById.get(r.set) };
      });
      if (!ptCard && !tcgdexCards.length) {
        // Ohne pokemontcg-Quelle (--tcgdex-only) ist eine reine pt-Karte erwartbar; im Vollbuild
        // heisst das: Quelle verschwunden -> Abbruch statt stillem Auslassen.
        if (!tcgdexOnly) {
          const refs = (rc.tcgdex ?? []).map((r) => `${r.set}/${r.localId}`).join(', ') || '-';
          lostSource.push(`${setId}/${cardId} (pokemontcg ${rc.pokemontcg ?? '-'}, tcgdex ${refs})`);
        }
        skippedNoSource.push(`${setId}/${cardId}`);
        continue;
      }
      const card = mergeCard({
        canonicalSetId: setId, canonicalCardId: cardId, registryCard: rc, ptCard, tcgdexCards, tcgdexSet,
        tables, legals, assetsIndex, sourceCommits,
      });
      matchStatus[card.matchStatus]++;
      const primarySet = tcgdexCards[0]?.set;
      if (primarySet && tcgdexSet && primarySet.id !== tcgdexSet.id) subsetExpansion.set(card.id, primarySet.cardmarketId ?? null);
      cards.push(card);
    }
    cards.sort((a, b) => sortLocalIds(a.cardId, b.cardId) || cmp(a.cardId, b.cardId));
    cardsBySet.set(setId, cards);
    sets.push(mergeSet({
      canonicalSetId: setId, registrySet,
      ptSet: registrySet.pokemontcg ? ptSetById.get(registrySet.pokemontcg) ?? null : null,
      tcgdexSet, cardCount: cards.length, assetsIndex, assetsVerified,
    }));
  }
  // Cardmarket-IDs (Spec §3): Katalog sources/cardmarket/catalog.jsonl + custom-sets (Nummern), Zuordnungsdatei
  // api/mappings/cardmarket-overrides.json ("<setId>/<cardId>": id | null, "<setId>": expansionId) und
  // Stabilitaetsregel gegen die zuletzt veroeffentlichten Karten (previousDir, Standard <outDir>/cards).
  // Ohne Katalog entfallen Pruefung und Lueckenregeln (TCGdex-IDs bleiben wie geliefert).
  const catalog = loadCardmarketCatalog(p('sources', 'cardmarket'));
  const previousAbs = path.resolve(repoRoot, previousDir ?? path.join(outDir, 'cards'));
  const previousCm = new Map();
  if (fs.existsSync(previousAbs)) {
    for (const f of fs.readdirSync(previousAbs).filter((x) => x.endsWith('.json')).sort()) previousFromCards(readJson(path.join(previousAbs, f)), previousCm);
  }
  const cardmarketIds = fillCardmarketIds({
    sets, cardsBySet, subsetExpansion,
    overrides: readJsonOr(p('api', 'mappings', 'cardmarket-overrides.json'), {}),
    knownExpansions: catalog ? catalog.expansions : null,
    productExpansion: catalog ? (id) => catalog.byId.get(id)?.expansionId ?? null : null,
    loadExpansion: (id) => (catalog && Number.isInteger(id) ? catalog.loadExpansion(id) : null),
    previous: catalog ? previousCm : null,
  });
  cardmarketIds.customSets.missingProducts = catalog?.missingCustomSetProducts ?? [];
  sets.sort((a, b) => cmp(a.releaseDate ?? '9999', b.releaseDate ?? '9999') || cmp(a.id, b.id));

  if (lostSource.length) {
    throw new BuildValidationError(lostSource, 'Registry-Karten ohne Quelle (weder pokemontcg- noch TCGdex-Karte; siehe scripts/api/README.md, Registry-Drift beheben)');
  }
  const violations = requiredFieldViolations({ sets, cardsBySet });
  if (violations.length) throw new BuildValidationError(violations);

  // Warnung (kein Abbruch): Karten ohne Bild. Eine Karte nur mit DE-Bild (i18n.de.images) ist darstellbar und zaehlt nicht.
  const missingImages = { total: 0, bySet: {} };
  for (const [setId, cards] of cardsBySet) {
    const n = cards.filter((c) => !filled(c.images?.small) && !filled(c.i18n?.de?.images?.small)).length;
    if (n) missingImages.bySet[setId] = n;
    missingImages.total += n;
  }

  const cardTotal = [...cardsBySet.values()].reduce((n, c) => n + c.length, 0);
  const searchIndex = [];
  for (const [setId, cards] of [...cardsBySet].sort((a, b) => cmp(a[0], b[0]))) {
    for (const c of cards) {
      const entry = { setId, cardId: c.cardId, number: c.number, name: c.name };
      // cm: primaere Cardmarket-Produkt-ID, gleiche Regel wie im Frontend (ungestempelte Variante zuerst).
      const cm = primaryCardmarketId(c);
      if (typeof cm === 'number') entry.cm = cm;
      const optional = {
        nameDe: c.i18n?.de?.name, img: c.images?.small, imgDe: c.i18n?.de?.images?.small,
        types: c.types, rarity: c.rarity, artist: c.artist, supertype: c.supertype,
      };
      for (const [k, v] of Object.entries(optional)) if (Array.isArray(v) ? v.length : filled(v)) entry[k] = v;
      searchIndex.push(entry);
    }
  }
  const meta = {
    apiVersion: 3,
    languages: ['en', 'de'],
    counts: { sets: sets.length, cards: cardTotal, ...matchStatus },
    warnings: { missingImages },
    sources: {
      pokemontcg: tcgdexOnly ? null : { commit: sources.pokemontcg?.commit ?? null },
      tcgdex: { commit: sources.tcgdex?.commit ?? null, fetchedAt: sources.tcgdex?.fetchedAt ?? null },
    },
  };

  const outAbs = path.resolve(repoRoot, outDir);
  const cardsDir = path.join(outAbs, 'cards');
  fs.mkdirSync(cardsDir, { recursive: true });
  const wanted = new Set();
  for (const [setId, cards] of cardsBySet) {
    wanted.add(`${setId}.json`);
    writeIfChanged(path.join(cardsDir, `${setId}.json`), toCompactJson(cards));
  }
  for (const f of fs.readdirSync(cardsDir)) {
    if (f.endsWith('.json') && !wanted.has(f)) fs.rmSync(path.join(cardsDir, f));
  }
  writeIfChanged(path.join(outAbs, 'sets.json'), toJson(sets));
  writeIfChanged(path.join(outAbs, 'search-index.json'), toCompactJson(searchIndex));
  writeIfChanged(path.join(outAbs, 'meta.json'), toJson(meta));
  // Gelernte Tabellen deterministisch ablegen, damit Aenderungen im Diff sichtbar werden.
  fs.mkdirSync(path.join(outAbs, 'reports'), { recursive: true });
  writeIfChanged(path.join(outAbs, 'reports', 'learned-tables.json'), toJson(tables));
  writeIfChanged(path.join(outAbs, 'reports', 'cardmarket-ids.json'), toJson(cardmarketIds));
  // Preise (Spec §2.3): nur mit Preisguide von heute (.cache, schreibt sync-cardmarket nur bei Erfolg);
  // sonst bleiben api/v3/prices und prices/meta.json wie veroeffentlicht.
  const priceGuideFile = p('.cache', 'cardmarket', 'price-guide.json');
  let priceGuide = null;
  try { if (fs.existsSync(priceGuideFile)) priceGuide = readJson(priceGuideFile); } catch { priceGuide = null; } // unlesbar = kein Preisguide
  const prices = writePriceFiles({ outDir: outAbs, cardsBySet, primaryCardmarketId, priceGuide });
  if (doWriteRegistry && !tcgdexOnly) writeRegistry(registryAbs, registry);

  return {
    prices,
    sets: sets.length, cards: cardTotal, matchStatus, cardmarketIds: { ...cardmarketIds.totals, rules: cardmarketIds.rules, overrideWarnings: cardmarketIds.overrides.warnings, stillMissing: cardmarketIds.stillMissing.length, duplicates: cardmarketIds.duplicates, expansion: { ...cardmarketIds.expansionMismatch.totals, sets: cardmarketIds.expansionMismatch.sets }, setsWithoutExpansion: cardmarketIds.setsWithoutExpansion.length, customSetMissingProducts: cardmarketIds.customSets.missingProducts.length, stabilityDropped: cardmarketIds.stabilityDropped.length, stabilityConflicts: cardmarketIds.stabilityConflicts.length }, registryChanges: changes, skippedNoSource, missingImages, assets,
    tables: Object.fromEntries(Object.entries(tables).map(([k, v]) => [k, Object.keys(v).length])),
    warnings: db.warnings.length,
  };
}

function dirSize(dir) {
  let total = 0;
  let largest = { file: null, size: 0 };
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const f = path.join(d, e.name);
      if (e.isDirectory()) { walk(f); continue; }
      const { size } = fs.statSync(f);
      total += size;
      if (size > largest.size) largest = { file: path.relative(dir, f).split(path.sep).join('/'), size };
    }
  };
  walk(dir);
  return { total, largest };
}

function parseArgs(argv) {
  const opts = { tcgdexOnly: false, outDir: 'api/v3' };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--tcgdex-only') opts.tcgdexOnly = true;
    else if (argv[i] === '--out') {
      opts.outDir = argv[++i];
      if (!opts.outDir) throw new Error('--out erwartet ein Verzeichnis');
    } else throw new Error(`Unbekanntes Argument: ${argv[i]}`);
  }
  return opts;
}

function main() {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
  const started = Date.now();
  try {
    const opts = parseArgs(process.argv.slice(2));
    const r = runBuild({ repoRoot, tcgdexOnly: opts.tcgdexOnly, outDir: opts.outDir });
    const ms = r.matchStatus;
    console.log(`Sets ${r.sets}, Karten ${r.cards} (matched ${ms.matched}, primary_only ${ms.primary_only}, tcgdex_only ${ms.tcgdex_only})`);
    if (r.skippedNoSource.length) console.log(`Ohne Quelle uebersprungen: ${r.skippedNoSource.length} (${r.skippedNoSource.slice(0, 10).join(', ')}${r.skippedNoSource.length > 10 ? ', ...' : ''})`);
    const mi = r.missingImages;
    if (mi.total) {
      console.log(`WARNUNG: ${mi.total} Karten ohne Bild (images fehlt):`);
      for (const [setId, n] of Object.entries(mi.bySet).sort((a, b) => b[1] - a[1] || cmp(a[0], b[0]))) console.log(`  ${setId}: ${n}`);
    }
    if (r.prices) console.log(`Preise: ${r.prices.cardsWithPrice} von ${r.prices.cardsWithId} Karten mit Cardmarket-ID haben einen Preis (Preisguide ${r.prices.priceGuideCreatedAt})`);
    else console.log('Preise: kein Preisguide von heute, api/v3/prices bleibt unveraendert');
    const cm = r.cardmarketIds;
    console.log(`Cardmarket-IDs: ${cm.cards} Karten, ${cm.tcgdex} von TCGdex, ${cm.customSet} aus custom-sets, ${cm.matched} nachgetragen, ${cm.stabilityKept} per Stabilitaetsregel (${cm.stabilityDropped} entfallen, ${cm.stabilityConflicts} Konflikte), ${cm.missing} fehlen (${cm.ambiguous} mehrdeutig); doppelte TCGdex-IDs ${cm.duplicates.ids} (${cm.duplicates.cards} Karten, ${cm.duplicates.corrected} korrigiert, ${cm.duplicates.kept} belassen); Sets ohne Expansion ${cm.setsWithoutExpansion}, custom-set-Produkte nicht im Katalog ${cm.customSetMissingProducts}; Details api/v3/reports/cardmarket-ids.json`);
    const ru = cm.rules;
    console.log(`Cardmarket-Regeln: Energie-Symbol ${ru.energySymbol}, Left/Right ${ru.leftRight}, Reihenfolge ${ru.ordered} (${ru.orderedRejected} abgelehnt), Override ${ru.override}, Oversize ausgeschlossen ${ru.oversizeExcluded}, Versions-Suffix ohne Karte ${ru.versionSuffixSkipped}; Arbeitsliste stillMissing ${cm.stillMissing}`);
    for (const w of cm.overrideWarnings) console.log(`WARNUNG cardmarket-overrides.json: ${w}`);
    const x = cm.expansion;
    console.log(`Cardmarket-Expansionspruefung: ${x.checked} IDs, ${x.corrected} ersetzt, ${x.dropped} entfernt, ${x.keptMismatch} belassen (Name passt nicht), ${x.noSetExpansion} ohne Set-Expansion, ${x.unknownProduct} unbekannt, ${x.foreignNameOk} namensgleich in fremder Expansion; Sets: ${x.sets.map((s) => `${s.setId} ${s.oldId}->${s.newId ?? '-'} (${s.reason})`).join(', ') || '-'}`);
    console.log(`Assets: ${r.assets.ok} ok, ${r.assets.missing} fehlen`);
    console.log(`Gelernte Tabellen: ${Object.entries(r.tables).map(([k, n]) => `${k} ${n}`).join(', ')}`);
    const counts = new Map();
    for (const c of r.registryChanges) {
      const kind = c.endsWith(' neu') ? (c.startsWith('Set ') ? 'Sets neu' : 'Karten neu') : 'Ergaenzungen';
      counts.set(kind, (counts.get(kind) ?? 0) + 1);
    }
    console.log(`Registry-Aenderungen: ${r.registryChanges.length}${counts.size ? ` (${[...counts].map(([k, n]) => `${k} ${n}`).join(', ')})` : ''}${opts.tcgdexOnly ? ' (nicht geschrieben)' : ''}`);
    const size = dirSize(path.resolve(repoRoot, opts.outDir));
    console.log(`Groesse ${opts.outDir}: ${(size.total / 1048576).toFixed(1)} MB, groesste Datei ${size.largest.file} (${(size.largest.size / 1048576).toFixed(2)} MB)`);
    console.log(`Dauer ${((Date.now() - started) / 1000).toFixed(1)} s`);
  } catch (e) {
    const known = [RegistryFrozenError, RegistryInvariantError, BuildValidationError, BuildParseError].some((T) => e instanceof T);
    console.error(`FEHLER: ${known ? e.message : (e.stack ?? e)}`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
