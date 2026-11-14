#!/usr/bin/env node
// Reparaturwerkzeug (Spec §6): liest Kartenlisten von Cardmarket-Setseiten (nie automatisch geladen) und traegt
// Produkt-IDs mit Kartennummern in sources/cardmarket/custom-sets/<expansionId>.json ein. Danach laeuft die echte
// Zuordnung (fillCardmarketIds) fuer die betroffenen v3-Sets im Speicher (nichts wird nach api/v3 geschrieben) und
// zeigt Vorher/Nachher.
//
//   node scripts/api/cardmarket/import-html.mjs <liste.json|seite.html …> [--dry-run] [--force] [--set <setId>]
//   node scripts/api/cardmarket/import-html.mjs --snippet
//
// Eingabe bevorzugt JSON: --snippet gibt ein Skript fuer die Browser-Konsole aus, das auf der geoeffneten
// Setseite die Kartenliste in die Zwischenablage kopiert (Format: parseCardmarketJson). Gespeicherter
// Seitenquelltext (.html) geht weiterhin. Eingaben liegen in .local/cardmarket-html/ (gitignored, nie committen).
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
  const img = block.match(/(?:data-echo|src)="https:\/\/product-images\.s3\.cardmarket\.com\/\d+\/\w+\/(\d+)\/\d+\.(?:jpg|png)"/i);
  if (!img) return null;
  const href = block.match(/href="\/[^"]*\/Products\/Singles\/[^"]+\/([^"?]+)[^"]*"/i);
  if (!href) return null;
  const h2 = block.match(/<h2[^>]*>([\s\S]*?)<\/h2>/i);
  if (!h2) return null;
  return entryOf({ productId: Number(img[1]), version: versionOfSlug(href[1]), label: h2[1].replace(/<[^>]*>/g, ' ') });
}

// Version aus dem Produktlink: "Magneton-V2-SVP159", "Snivy-V2", "Zoroark-V2-OS" -> 2; ohne -V<n> -> 1.
export function versionOfSlug(slug) {
  const m = String(slug).match(/-V(\d+)(?=-|$)/);
  return m ? Number(m[1]) : 1;
}

// Nummer aus Ueberschrift oder Klammerinhalt: "Serpifeu (BW 01)" / "BW 01" -> "1", "SK H1" -> "H1",
// "AQ 50a" -> "50a", "SVP 001" -> "1". null ohne erkennbare Nummer.
export function numberOfLabel(label) {
  const text = String(label ?? '').replace(/\s+/g, ' ').trim();
  const inParens = [...text.matchAll(/\(([^()]*)\)/g)].map((m) => m[1]).reverse();
  for (const candidate of [...inParens, text]) {
    const c = candidate.trim();
    const m = c.match(/^([A-Z]+(?:en)?[ ]?[A-Z]?\s*\d+[a-z]?)$/i);
    if (m) return m[1].trim().replace(/^[A-Z]+(?:en)?\s*/, '').replace(/^0+/, '') || '0';
    // Setcode mit Ziffer und Kit-Kuerzel: "TK6 1N" -> "1N" (Trainer-Kit-Paare, siehe setSuffix im custom-set)
    const kit = c.match(/^[A-Z]+\d+\s+(\d+[A-Z]?)$/i);
    if (kit) return kit[1].replace(/^0+(?=\d)/, '');
  }
  return null;
}

function entryOf({ productId, version, label }) {
  // Online-Code-Karten sind keine Sammelkarten ("Online Code Card (Theme Deck) (TK6)" sähe sonst wie Nummer 6 aus)
  if (/\bcode\s*card\b/i.test(String(label ?? ''))) return null;
  const number = numberOfLabel(label);
  if (!Number.isInteger(productId) || productId <= 0 || number === null) return null;
  return { productId, version: Number.isInteger(version) && version > 0 ? version : 1, number };
}

// Versionsregel: Ein Suffix "V<n>" bekommt nur ein Produkt, dessen Nummer auch ein Produkt mit kleinerer Version
// traegt ("146" + "146V2"). Allein stehende Versionen behalten die Basisnummer (BW-Promos: Victory Cup V1/V2/V3 =
// BW 29/30/31). Fehlt ein Teil der Liste, faellt das beim Merge als Widerspruch zu bestehenden Eintraegen auf;
// JSON mit total prueft zusaetzlich die Vollstaendigkeit.
function collectorNumbers(entries) {
  const minVersion = new Map();
  for (const e of entries) minVersion.set(e.number, Math.min(minVersion.get(e.number) ?? Infinity, e.version));
  return entries.map((e) => ({ productId: e.productId, collectorNumber: e.version > minVersion.get(e.number) ? `${e.number}V${e.version}` : e.number }));
}

const sortCards = (cards) => cards.sort((a, b) => naturalCompare(a.collectorNumber, b.collectorNumber) || a.productId - b.productId);

/**
 * Parst eine oder mehrere gespeicherte Suchseiten (HTML-Strings).
 * -> { expansionId, name, cards: [{ productId, collectorNumber }] } (Produkte einmalig, natuerlich sortiert).
 * Versionen siehe collectorNumbers. stats: { blocks, parsed, skipped } = gefundene Kartenbloecke, gelesene,
 * uebersprungene (Markup unbekannt).
 */
export function parseCardmarketHtml(...pages) {
  let expansionId = null;
  let name = null;
  const seen = new Set();
  const entries = [];
  const stats = { blocks: 0, parsed: 0, skipped: 0 };
  for (const html of pages) {
    expansionId ??= expansionIdOf(html);
    name ??= setNameOf(html);
    const blocks = html.match(/<a\s+href="[^"]*"\s+class="card text-center w-100 galleryBox">[\s\S]*?<\/a>\s*<\/div>/g) ?? [];
    for (const block of blocks) {
      stats.blocks++;
      const c = parseBlock(block);
      if (!c) { stats.skipped++; continue; }
      stats.parsed++;
      if (seen.has(c.productId)) continue;
      seen.add(c.productId);
      entries.push(c);
    }
  }
  if (expansionId === null) throw new Error('Expansion nicht erkannt (kein idExpansion in der Seite)');
  return { expansionId, name, cards: sortCards(collectorNumbers(entries)), stats };
}

/**
 * Parst eine oder mehrere JSON-Listen (je Seite eine, z. B. aus --snippet; eine Datei darf auch ein Array davon sein):
 *   { expansionId, name?, total?, page?, cards: [{ productId, version?, label }] }
 * label = Nummer wie auf Cardmarket ("BW 01") oder ganze Ueberschrift ("Serpifeu (BW 01)"); total = Trefferzahl
 * der Suche. Fehlen Produkte (z. B. Seite 2 vergessen), bricht der Import ab. Ergebnis wie parseCardmarketHtml.
 */
export function parseCardmarketJson(...lists) {
  let expansionId = null;
  let name = null;
  let total = null;
  const seen = new Set();
  const entries = [];
  const stats = { blocks: 0, parsed: 0, skipped: 0 };
  for (const list of lists) {
    if (!list || !Array.isArray(list.cards)) throw new Error('JSON ohne cards-Liste');
    const id = Number(list.expansionId);
    if (!Number.isInteger(id) || id <= 0) throw new Error('Expansion nicht erkannt (expansionId fehlt)');
    if (expansionId !== null && id !== expansionId) throw new Error(`verschiedene Expansionen in einer Datei: ${expansionId} und ${id}`);
    expansionId = id;
    name ??= typeof list.name === 'string' && list.name.trim() ? list.name.trim() : null;
    if (Number.isInteger(list.total) && list.total > 0) total = Math.max(total ?? 0, list.total);
    for (const raw of list.cards) {
      stats.blocks++;
      const c = entryOf({ productId: Number(raw?.productId), version: Number(raw?.version ?? 1), label: raw?.label });
      if (!c) { stats.skipped++; continue; }
      stats.parsed++;
      if (seen.has(c.productId)) continue;
      seen.add(c.productId);
      entries.push(c);
    }
  }
  if (expansionId === null) throw new Error('Expansion nicht erkannt (keine Liste)');
  if (total !== null && seen.size + stats.skipped < total) {
    throw new Error(`unvollstaendig: ${seen.size} von ${total} Produkten (weitere Seiten mit site=2 … auslesen)`);
  }
  return { expansionId, name, cards: sortCards(collectorNumbers(entries)), stats };
}

// Skript fuer die Browser-Konsole (F12 -> Konsole) auf einer Cardmarket-Setseite (nach Nummer sortiert, 100 je Seite).
// copy() ist eine Konsolenfunktion von Chrome/Firefox: die Liste liegt danach in der Zwischenablage und wird als
// .local/cardmarket-html/<expansionId>-<seite>.json gespeichert.
export const BROWSER_SNIPPET = String.raw`copy(JSON.stringify({
  expansionId: +((document.documentElement.innerHTML.match(/idExpansion=(\d+)/) || [])[1] || 0),
  name: document.title.replace(/\s*(Einzelkarten|Singles)?\s*\|.*$/, '').trim(),
  total: +(((document.body.innerText.match(/([\d.]+)\s+(Treffer|Hits|Results)/) || [])[1] || '0').replace(/\./g, '')),
  page: +(new URLSearchParams(location.search).get('site') || 1),
  cards: [...document.querySelectorAll('a.galleryBox')].map((a) => {
    const img = a.querySelector('img');
    const src = (img && (img.getAttribute('data-echo') || img.getAttribute('src'))) || '';
    const slug = a.getAttribute('href').split('?')[0].split('/').pop();
    return {
      productId: +((src.match(/\/(\d+)\/\d+\.(?:jpg|png)/) || [])[1] || 0),
      version: +((slug.match(/-V(\d+)(?=-|$)/) || [])[1] || 1),
      label: a.querySelector('h2').textContent.replace(/\s+/g, ' ').trim(),
    };
  }),
}, null, 1));`;

// ---------- Merge ----------

/**
 * Fuehrt geparste Eintraege in ein bestehendes custom-set ein. Bestehende Eintraege (Reihenfolge, lot) bleiben;
 * neue Produkte werden angehaengt. Widerspruechige Nummern werden gemeldet und nur mit force ersetzt.
 * -> { set, added, unchanged, conflicts: [{ productId, existing, incoming }], replaced }
 */
export function mergeCustomSet(existing, parsed, { force = false } = {}) {
  const set = {
    ...(existing ?? {}), // unbekannte Schluessel bleiben erhalten
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
  // Zwei verschiedene (Nicht-Lot-)Produkte mit gleicher Nummer, soweit eines davon neu/ersetzt ist
  const touched = new Set([...added.map((c) => c.productId), ...replaced]);
  const byNumber = new Map();
  for (const c of set.cards) if (!c.lot) byNumber.set(String(c.collectorNumber), [...(byNumber.get(String(c.collectorNumber)) ?? []), c.productId]);
  const duplicateNumbers = [...byNumber].filter(([, ids]) => ids.length > 1 && ids.some((id) => touched.has(id))).map(([collectorNumber, productIds]) => ({ collectorNumber, productIds }));
  return { set, added, unchanged, conflicts, replaced, duplicateNumbers };
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

// Nur eine fehlende Datei ist "leer"; jeder andere Lese-/Parsefehler bricht mit dem Dateinamen ab.
function readJsonOr(file, fallback) {
  let text;
  try { text = fs.readFileSync(file, 'utf8'); } catch (e) {
    if (e.code === 'ENOENT') return fallback;
    throw new Error(`${file} nicht lesbar: ${e.message}`);
  }
  try { return JSON.parse(text); } catch (e) { throw new Error(`${file} ist kein gueltiges JSON (nichts geschrieben): ${e.message}`); }
}

/**
 * Liest die HTML-Dateien (je Expansion gruppiert), fuehrt sie mit sources/cardmarket/custom-sets/<id>.json zusammen
 * und schreibt (ausser bei dryRun). -> { merged: [{ expansionId, file, added, unchanged, conflicts, replaced,
 * written, preview }] }
 */
export function runImport({ files, root, dryRun = false, force = false, setIds = [], setSuffix = {} }) {
  // Alle Seiten einer Expansion werden gemeinsam geparst (Versionsregel und Vollstaendigkeit gelten je Expansion).
  const groups = new Map(); // "<art>:<expansionId>" -> { isJson, inputs: [], files: [] }
  for (const file of files) {
    const isJson = /\.json$/i.test(file);
    let text;
    try { text = fs.readFileSync(file, 'utf8'); } catch (e) { throw new Error(`${isJson ? 'JSON' : 'HTML'}-Datei ${file} nicht lesbar: ${e.message}`); }
    let inputs;
    let expansion;
    if (isJson) {
      let data;
      try { data = JSON.parse(text); } catch (e) { throw new Error(`${file}: kein gueltiges JSON: ${e.message}`); }
      inputs = Array.isArray(data) ? data : [data];
      expansion = inputs[0]?.expansionId;
    } else {
      inputs = [text];
      expansion = expansionIdOf(text);
    }
    if (!Number.isInteger(Number(expansion)) || Number(expansion) <= 0) throw new Error(`${file}: Expansion nicht erkannt`);
    const key = `${isJson ? 'json' : 'html'}:${Number(expansion)}`;
    const g = groups.get(key) ?? { isJson, inputs: [], files: [] };
    g.inputs.push(...inputs);
    g.files.push(file);
    groups.set(key, g);
  }
  const byExpansion = new Map();
  for (const g of groups.values()) {
    const label = g.files.join(', ');
    let parsed;
    try { parsed = g.isJson ? parseCardmarketJson(...g.inputs) : parseCardmarketHtml(...g.inputs); } catch (e) { throw new Error(`${label}: ${e.message}`); }
    const st = parsed.stats;
    if (!parsed.cards.length) throw new Error(`${label}: ${st.blocks} Bloecke gefunden, ${st.parsed} gelesen, ${st.skipped} uebersprungen - keine Karte erkannt (hat sich das Cardmarket-Markup geaendert?)`);
    if (byExpansion.has(parsed.expansionId)) throw new Error(`Expansion ${parsed.expansionId} kommt als HTML und als JSON - bitte nur eine Art je Expansion`);
    byExpansion.set(parsed.expansionId, parsed);
  }
  const csDir = path.join(root, 'sources', 'cardmarket', 'custom-sets');
  const catalog = loadCardmarketCatalog(path.join(root, 'sources', 'cardmarket'));
  const merged = [];
  for (const parsed of byExpansion.values()) {
    const file = path.join(csDir, `${parsed.expansionId}.json`);
    const existing = readJsonOr(file, null);
    const m = mergeCustomSet(existing, parsed, { force });
    // Kit-Kuerzel je v3-Set (--kit TCGDEX-tk-xy-n=N): Trainer-Kit-Paare in einer Expansion ("TK6 1N" / "TK6 1S")
    const suffixBefore = JSON.stringify(m.set.setSuffix ?? null);
    if (Object.keys(setSuffix).length) m.set.setSuffix = { ...(m.set.setSuffix ?? {}), ...setSuffix };
    const changed = m.added.length > 0 || m.replaced.length > 0 || JSON.stringify(m.set.setSuffix ?? null) !== suffixBefore;
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
    merged.push({ expansionId: parsed.expansionId, file, added: m.added, unchanged: m.unchanged, conflicts: m.conflicts, replaced: m.replaced, duplicateNumbers: m.duplicateNumbers, stats: parsed.stats, written: changed && !dryRun, preview });
  }
  return { merged };
}

function main() {
  const { values, positionals } = parseArgs({
    options: { 'dry-run': { type: 'boolean' }, force: { type: 'boolean' }, set: { type: 'string', multiple: true }, kit: { type: 'string', multiple: true }, snippet: { type: 'boolean' }, help: { type: 'boolean', short: 'h' } },
    allowPositionals: true,
  });
  if (values.snippet) {
    console.log(BROWSER_SNIPPET);
    process.exit(0);
  }
  if (values.help || !positionals.length) {
    console.log('Usage: node scripts/api/cardmarket/import-html.mjs <liste.json|seite.html …> [--dry-run] [--force] [--set <setId>] [--kit <setId>=<Kuerzel> …]\n       node scripts/api/cardmarket/import-html.mjs --snippet   (Skript fuer die Browser-Konsole)\nEingaben liegen in .local/cardmarket-html/ (ignoriert).');
    process.exit(values.help ? 0 : 1);
  }
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
  let merged;
  try {
    const setSuffix = {};
    for (const k of values.kit ?? []) {
      const m = /^([^=]+)=([A-Za-z]+)$/.exec(k);
      if (!m) throw new Error(`--kit erwartet <setId>=<Kuerzel>, z. B. TCGDEX-tk-xy-n=N (war: ${k})`);
      setSuffix[m[1]] = m[2].toUpperCase();
    }
    ({ merged } = runImport({ files: positionals, root, dryRun: values['dry-run'], force: values.force, setIds: values.set ?? [], setSuffix }));
  } catch (e) {
    console.error(`Fehler: ${e.message}`);
    process.exit(1);
  }
  let exit = 0;
  for (const m of merged) {
    console.log(`Seiten: ${m.stats.blocks} Bloecke gefunden, ${m.stats.parsed} gelesen, ${m.stats.skipped} uebersprungen`);
    console.log(`custom-set ${m.expansionId}: ${m.added.length} neu, ${m.unchanged} unveraendert, ${m.conflicts.length} Widerspruch(e)${m.replaced.length ? `, ${m.replaced.length} ersetzt (--force)` : ''}${m.written ? ` -> ${path.relative(root, m.file)}` : ' (nicht geschrieben)'}`);
    for (const c of m.conflicts) console.log(`  WIDERSPRUCH Produkt ${c.productId}: bisher "${c.existing}", Seite "${c.incoming}"${m.replaced.includes(c.productId) ? ' (ersetzt)' : ' (bleibt; --force ersetzt)'}`);
    for (const d of m.duplicateNumbers) console.log(`  WARNUNG Nummer "${d.collectorNumber}" gehoert mehreren Produkten: ${d.productIds.join(', ')}`);
    if (m.conflicts.length && !values.force) exit = 2;
    console.log(m.preview ? formatSummary(m.preview) : 'Keine Vorschau (Katalog oder api/v3/sets.json fehlt).');
  }
  process.exit(exit);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
