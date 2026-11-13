#!/usr/bin/env node
// Reparaturwerkzeug (Spec §6): liest manuell gespeicherte Cardmarket-Suchseiten (Seitenquelltext, nie
// automatisch geladen) und traegt Produkt-IDs mit Kartennummern in sources/cardmarket/custom-sets/<expansionId>.json
// ein. Danach laeuft die echte Zuordnung (fillCardmarketIds) fuer die betroffenen v3-Sets im Speicher (nichts
// wird nach api/v3 geschrieben) und zeigt Vorher/Nachher.
//
//   node scripts/api/cardmarket/import-html.mjs <seite.html …> [--dry-run] [--force] [--set <setId>]
//
// HTML-Eingaben liegen in .local/cardmarket-html/ (gitignored, nie committen). Parsing portiert aus
// scripts/cardmarket/custom-sets/generate-custom-set.mjs (dort unveraendert).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { fillCardmarketIds, primaryCardmarketId } from '../merge/cardmarket-ids.mjs';
import { buildCatalog, loadCardmarketCatalog } from '../sources/cardmarket-catalog.mjs';

const naturalCompare = (a, b) => String(a).localeCompare(String(b), undefined, { numeric: true });

// ---------- HTML ----------

function expansionIdOf(html) {
  const fromUrl = html.match(/[?&]idExpansion=(\d+)/);
  if (fromUrl) return Number(fromUrl[1]);
  // Fallback: ausgewaehlte Option der Expansions-Auswahl (Expansions-IDs haben >= 4 Stellen, Kategorien nicht)
  const selected = [...html.matchAll(/<option\s+value="(\d+)"[^>]*\bselected="selected"/gi)].map((m) => Number(m[1])).filter((n) => n >= 1000);
  return selected.length ? Math.max(...selected) : null;
}

function setNameOf(html) {
  const m = html.match(/<title>([^<]+?)\s+Singles?\s*\|[^<]*<\/title>/i);
  return m ? m[1].trim() : null;
}

function parseBlock(block) {
  const img = block.match(/data-echo="https:\/\/product-images\.s3\.cardmarket\.com\/\d+\/\w+\/(\d+)\/\d+\.(?:jpg|png)"/i);
  if (!img) return null;
  const href = block.match(/href="\/[^"]*\/Products\/Singles\/[^"]+\/([^"]+)"/i);
  if (!href) return null;
  // <Name>[-V<n>]-<Setcode><Nummer>[<Buchstabe>], z. B. "Magneton-V2-SVP159"
  const slug = href[1].match(/^(.+?)(?:-V(\d+))?(-[A-Z]+)(\d+)([a-z]?)$/);
  if (!slug) return null;
  const h2 = block.match(/<h2[^>]*>[\s\S]*?<\/h2>/i);
  if (!h2) return null;
  const paren = h2[0].match(/\(([A-Z]+(?:en)?[ ]?[A-Z]?\s*\d+[a-z]?)\)/i);
  if (!paren) return null;
  // "SK 1" -> "1", "SK H1" -> "H1", "AQ 50a" -> "50a", "SVP 001" -> "1"
  const number = paren[1].trim().replace(/^[A-Z]+(?:en)?\s*/, '').replace(/^0+/, '') || '0';
  return { productId: Number(img[1]), name: slug[1], version: slug[2] ? Number(slug[2]) : 1, number };
}

/**
 * Parst eine oder mehrere gespeicherte Suchseiten (HTML-Strings).
 * -> { expansionId, name, cards: [{ productId, collectorNumber }] } (Produkte einmalig, natuerlich sortiert).
 * Version V2+ im Link ergibt das Suffix "V<n>" ("146V2"); V1/ohne Version behaelt die Basisnummer.
 */
export function parseCardmarketHtml(...pages) {
  let expansionId = null;
  let name = null;
  const seen = new Set();
  const cards = [];
  for (const html of pages) {
    expansionId ??= expansionIdOf(html);
    name ??= setNameOf(html);
    const blocks = html.match(/<a\s+href="[^"]*"\s+class="card text-center w-100 galleryBox">[\s\S]*?<\/a>\s*<\/div>/g) ?? [];
    for (const block of blocks) {
      const c = parseBlock(block);
      if (!c || seen.has(c.productId)) continue;
      seen.add(c.productId);
      cards.push({ productId: c.productId, collectorNumber: c.version > 1 ? `${c.number}V${c.version}` : c.number });
    }
  }
  if (expansionId === null) throw new Error('Expansion nicht erkannt (kein idExpansion in der Seite)');
  cards.sort((a, b) => naturalCompare(a.collectorNumber, b.collectorNumber) || a.productId - b.productId);
  return { expansionId, name, cards };
}

// ---------- Merge ----------

/**
 * Fuehrt geparste Eintraege in ein bestehendes custom-set ein. Bestehende Eintraege (Reihenfolge, lot) bleiben;
 * neue Produkte werden angehaengt. Widerspruechige Nummern werden gemeldet und nur mit force ersetzt.
 * -> { set, added, unchanged, conflicts: [{ productId, existing, incoming }], replaced }
 */
export function mergeCustomSet(existing, parsed, { force = false } = {}) {
  const set = {
    expansionId: parsed.expansionId,
    name: existing?.name ?? parsed.name ?? String(parsed.expansionId),
    cards: (existing?.cards ?? []).map((c) => ({ ...c })),
  };
  const byId = new Map(set.cards.map((c) => [c.productId, c]));
  const added = [];
  const conflicts = [];
  const replaced = [];
  let unchanged = 0;
  for (const c of parsed.cards) {
    const have = byId.get(c.productId);
    if (!have) {
      const entry = { productId: c.productId, collectorNumber: c.collectorNumber };
      set.cards.push(entry);
      byId.set(c.productId, entry);
      added.push(entry);
    } else if (String(have.collectorNumber) === c.collectorNumber) {
      unchanged++;
    } else {
      conflicts.push({ productId: c.productId, existing: String(have.collectorNumber), incoming: c.collectorNumber });
      if (force) { have.collectorNumber = c.collectorNumber; replaced.push(c.productId); }
    }
  }
  return { set, added, unchanged, conflicts, replaced };
}

// ---------- Vorher/Nachher ----------

// Veroeffentlichte Karten enthalten schon Zuordnungsergebnisse; fuer einen fairen Neulauf werden sie auf den
// TCGdex-Stand zurueckgesetzt (Quelle ausser 'tcgdex' -> Original aus cardmarketTcgdex oder leer, Varianten-IDs
// ohne TCGdex-Beleg entfallen).
function resetToTcgdex(card) {
  const c = JSON.parse(JSON.stringify(card));
  const source = c.ids?.cardmarketSource;
  if (source && source !== 'tcgdex') {
    const original = Array.isArray(c.ids.cardmarketTcgdex) ? c.ids.cardmarketTcgdex : [];
    c.ids.cardmarket = [...original];
    delete c.ids.cardmarketSource;
    delete c.ids.cardmarketTcgdex;
    if (Array.isArray(c.variants)) c.variants = c.variants.map((v) => (typeof v?.cardmarketId === 'number' && !original.includes(v.cardmarketId) ? (({ cardmarketId, ...rest }) => rest)(v) : v));
  }
  return c;
}

function assign({ setList, publishedCards, products, customSets, overrides }) {
  const catalog = buildCatalog(products, customSets);
  const cardsBySet = new Map(setList.map((s) => [s.id, (publishedCards.get(s.id) ?? []).map(resetToTcgdex)]));
  fillCardmarketIds({
    sets: setList.map((s) => JSON.parse(JSON.stringify(s))), cardsBySet, overrides,
    knownExpansions: catalog.expansions,
    productExpansion: (id) => catalog.byId.get(id)?.expansionId ?? null,
    loadExpansion: (id) => catalog.loadExpansion(id),
    previous: null,
  });
  return cardsBySet;
}

const overrideSetExpansions = (overrides) => Object.fromEntries(Object.entries(overrides ?? {}).filter(([k, v]) => !k.startsWith('_') && !k.includes('/') && Number.isInteger(v)));

/**
 * Laeuft die Zuordnung fuer die Sets der Expansion zweimal im Speicher (ohne bzw. mit dem neuen custom-set).
 * sets: v3-Sets; publishedCards: Map setId -> Karten (api/v3/cards); products: Katalogzeilen;
 * customSetsBefore: [custom-set]; customSetAfter: das zusammengefuehrte custom-set der Expansion.
 * -> { expansionId, sets: [{ setId, before, after, closed, remaining, conflicts }] }
 */
export function previewImport({ expansionId, sets, publishedCards, products, customSetsBefore, customSetAfter, overrides = {}, setIds = [] }) {
  const mapped = overrideSetExpansions(overrides);
  const affected = sets.filter((s) => setIds.includes(s.id) || (mapped[s.id] ?? s.ids?.cardmarket) === expansionId);
  const others = (customSetsBefore ?? []).filter((c) => c.expansionId !== expansionId);
  const mine = (customSetsBefore ?? []).filter((c) => c.expansionId === expansionId);
  const args = { setList: affected, publishedCards, products, overrides };
  const before = assign({ ...args, customSets: [...others, ...mine] });
  const after = assign({ ...args, customSets: [...others, customSetAfter] });
  const numbers = new Map((customSetAfter.cards ?? []).map((c) => [c.productId, c.collectorNumber]));
  const missing = (list) => list.filter((c) => (primaryCardmarketId(c) ?? null) === null).length;
  const out = affected.map((s) => {
    const b = before.get(s.id);
    const a = after.get(s.id);
    const beforeId = new Map(b.map((c) => [c.cardId, primaryCardmarketId(c) ?? null]));
    const closed = [];
    const remaining = [];
    const conflicts = [];
    for (const c of a) {
      const was = beforeId.get(c.cardId);
      const now = primaryCardmarketId(c) ?? null;
      const key = `${s.id}/${c.cardId}`;
      if (now === null) remaining.push({ cardKey: key, name: c.name, number: c.number });
      else if (was === null) closed.push({ cardKey: key, name: c.name, number: c.number, productId: now, collectorNumber: numbers.get(now) ?? null });
      else if (was !== now) conflicts.push({ cardKey: key, name: c.name, before: was, after: now });
    }
    return { setId: s.id, before: { cards: b.length, missing: missing(b) }, after: { cards: a.length, missing: missing(a) }, closed, remaining, conflicts };
  });
  return { expansionId, sets: out };
}

export function formatSummary(preview) {
  const lines = [`Vorher/Nachher fuer Expansion ${preview.expansionId} (im Speicher, nichts nach api/v3 geschrieben)`];
  if (!preview.sets.length) lines.push('  Kein v3-Set mit dieser Expansion gefunden (--set <setId> erzwingt ein Set).');
  for (const s of preview.sets) {
    lines.push(`  Set ${s.setId}: ${s.before.missing} -> ${s.after.missing} offene Luecken von ${s.after.cards} Karten`);
    lines.push(`    geschlossen (${s.closed.length}):${s.closed.map((c) => `\n      ${c.cardKey} ${c.name} -> ${c.productId} (${c.collectorNumber ?? '-'})`).join('')}`);
    lines.push(`    weiter offen (${s.remaining.length}):${s.remaining.map((c) => `\n      ${c.cardKey} ${c.name} (${c.number})`).join('')}`);
    lines.push(`    Widersprueche zur bisherigen Zuordnung (${s.conflicts.length}):${s.conflicts.map((c) => `\n      ${c.cardKey} ${c.name}: ${c.before} -> ${c.after}`).join('')}`);
  }
  return lines.join('\n');
}

// ---------- Ablauf ----------

const readJsonOr = (file, fallback) => { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; } };

/**
 * Liest die HTML-Dateien (je Expansion gruppiert), fuehrt sie mit sources/cardmarket/custom-sets/<id>.json zusammen
 * und schreibt (ausser bei dryRun). -> { merged: [{ expansionId, file, added, unchanged, conflicts, replaced,
 * written, preview }] }
 */
export function runImport({ files, root, dryRun = false, force = false, setIds = [] }) {
  const byExpansion = new Map();
  for (const file of files) {
    const parsed = parseCardmarketHtml(fs.readFileSync(file, 'utf8'));
    const e = byExpansion.get(parsed.expansionId) ?? { expansionId: parsed.expansionId, name: parsed.name, cards: [] };
    e.name ??= parsed.name;
    e.cards.push(...parsed.cards.filter((c) => !e.cards.some((x) => x.productId === c.productId)));
    byExpansion.set(parsed.expansionId, e);
  }
  const csDir = path.join(root, 'sources', 'cardmarket', 'custom-sets');
  const catalog = loadCardmarketCatalog(path.join(root, 'sources', 'cardmarket'));
  const merged = [];
  for (const parsed of byExpansion.values()) {
    const file = path.join(csDir, `${parsed.expansionId}.json`);
    const existing = readJsonOr(file, null);
    const m = mergeCustomSet(existing, parsed, { force });
    const changed = m.added.length > 0 || m.replaced.length > 0;
    if (changed && !dryRun) {
      fs.mkdirSync(csDir, { recursive: true });
      fs.writeFileSync(file, `${JSON.stringify(m.set, null, 2)}\n`);
    }
    let preview = null;
    const setsFile = path.join(root, 'api', 'v3', 'sets.json');
    if (catalog && fs.existsSync(setsFile)) {
      const sets = readJsonOr(setsFile, []);
      const publishedCards = new Map();
      for (const s of sets) publishedCards.set(s.id, readJsonOr(path.join(root, 'api', 'v3', 'cards', `${s.id}.json`), []));
      preview = previewImport({
        expansionId: parsed.expansionId, sets, publishedCards,
        products: [...catalog.byId.values()], customSetsBefore: [...catalog.customSets.values()], customSetAfter: m.set,
        overrides: readJsonOr(path.join(root, 'api', 'mappings', 'cardmarket-overrides.json'), {}), setIds,
      });
    }
    merged.push({ expansionId: parsed.expansionId, file, added: m.added, unchanged: m.unchanged, conflicts: m.conflicts, replaced: m.replaced, written: changed && !dryRun, preview });
  }
  return { merged };
}

function main() {
  const { values, positionals } = parseArgs({
    options: { 'dry-run': { type: 'boolean' }, force: { type: 'boolean' }, set: { type: 'string', multiple: true }, help: { type: 'boolean', short: 'h' } },
    allowPositionals: true,
  });
  if (values.help || !positionals.length) {
    console.log('Usage: node scripts/api/cardmarket/import-html.mjs <seite.html …> [--dry-run] [--force] [--set <setId>]\nHTML-Dateien liegen in .local/cardmarket-html/ (ignoriert).');
    process.exit(values.help ? 0 : 1);
  }
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
  const { merged } = runImport({ files: positionals, root, dryRun: values['dry-run'], force: values.force, setIds: values.set ?? [] });
  let exit = 0;
  for (const m of merged) {
    console.log(`custom-set ${m.expansionId}: ${m.added.length} neu, ${m.unchanged} unveraendert, ${m.conflicts.length} Widerspruch(e)${m.replaced.length ? `, ${m.replaced.length} ersetzt (--force)` : ''}${m.written ? ` -> ${path.relative(root, m.file)}` : ' (nicht geschrieben)'}`);
    for (const c of m.conflicts) console.log(`  WIDERSPRUCH Produkt ${c.productId}: bisher "${c.existing}", Seite "${c.incoming}"${m.replaced.includes(c.productId) ? ' (ersetzt)' : ' (bleibt; --force ersetzt)'}`);
    if (m.conflicts.length && !values.force) exit = 2;
    console.log(m.preview ? formatSummary(m.preview) : 'Keine Vorschau (Katalog oder api/v3/sets.json fehlt).');
  }
  process.exit(exit);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
