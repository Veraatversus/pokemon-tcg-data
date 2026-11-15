// Schreiben, Zaehlen und Report: Treffer in die Karten, Arbeitsliste (stillMissing) und Summen je Set.
import { cardCmNumbers } from './numbers.mjs';
import { normalizeCmName } from './names.mjs';
import { tcgdexIds, cardmarketSearchUrl } from './ids.mjs';

// Versions-Suffix der Custom-Sets (sources/cardmarket/custom-sets): "4V2", "224a" (normalisiert).
const VERSION_SUFFIX = /^\d+(v\d+|[a-z])$/;

// Woerter eines Namens (ohne Klammern) fuer die Kandidatenliste der Arbeitsliste.
const wordsOf = (s) => String(s ?? '').replace(/\[[^\]]*\]/g, ' ').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
  .split(/[^\p{L}\p{N}]+/u).filter((w) => w.length >= 3);

/** Stufe 4: Treffer schreiben und den Report bauen (Rueckgabe von fillCardmarketIds). */
export function buildReport(ctx) {
  const {
    results, overrideReport, orderedRejected, bySet, cardsBySet, indexes, dup, duplicateTcgdexIds, expansionMismatch, setsWithoutExpansion,
    customSetReport, stabilityKept, stabilityDropped, stabilityConflicts,
  } = ctx;
  // 4. Schreiben und zaehlen
  const rules = { energySymbol: 0, leftRight: 0, ordered: 0, orderedRejected: orderedRejected.length, override: overrideReport.applied + overrideReport.removed, oversizeExcluded: 0, versionSuffixSkipped: 0 };
  const push = (row, key, cardId) => { (row[key] ??= []).push(cardId); };
  const open = [];
  for (const entry of results.values()) {
    const { setId, card, subset, result } = entry;
    const row = bySet[setId];
    if (entry.stable) continue;
    if (result?.id !== undefined) {
      const source = result.source ?? 'matched';
      row.matched++;
      if (source !== 'matched') { rules[source]++; row[source] = (row[source] ?? 0) + 1; }
      card.ids = { ...card.ids, cardmarket: [result.id], cardmarketSource: source };
      continue;
    }
    row.missing++;
    if (result?.ambiguous) { row.ambiguous++; push(row, 'ambiguousCards', card.cardId); }
    if (row.expansionId === null && !subset) continue;
    push(row, 'missingCards', card.cardId);
    if (subset) push(row, 'subsetMissing', card.cardId);
    open.push(entry);
  }

  // Arbeitsliste fuer cardmarket-overrides.json: bis zu 5 freie Produkte der Expansion, gleicher Name
  // (auch mit Energie-Symbol) vor gleicher Nummer vor gemeinsamen Woertern.
  const held = new Set();
  for (const cards of cardsBySet.values()) {
    for (const c of cards) {
      for (const id of tcgdexIds(c)) held.add(id);
      for (const v of c.variants ?? []) if (typeof v?.cardmarketId === 'number') held.add(v.cardmarketId);
    }
  }
  // Hinweise je Kandidat: mehrere gleichnamige Produkte ohne Nummer (Sonder-/Oversize-Druck moeglich) oder
  // Produkt-ID weit ausserhalb des Hauptbereichs der Expansion (10.-90. Perzentil, Abstand > Spanne + 100).
  const idRange = new Map();
  const rangeOf = (index) => {
    if (!idRange.has(index)) {
      const ids = index.all.map((p) => p.id).sort((a, b) => a - b);
      const lo = ids[Math.floor(0.1 * (ids.length - 1))];
      const hi = ids[Math.floor(0.9 * (ids.length - 1))];
      const margin = hi - lo + 100;
      idRange.set(index, [lo - margin, hi + margin]);
    }
    return idRange.get(index);
  };
  const hintFor = (p, index) => {
    const hints = [];
    if ((index.byName.get(p.name) ?? []).filter((x) => x.number === null).length > 1) hints.push('same-name-unnumbered');
    const [lo, hi] = rangeOf(index);
    if (p.id < lo || p.id > hi) hints.push('id-outlier');
    return hints.length ? { hint: hints.join(', ') } : {};
  };
  const candidatesFor = (card, index) => {
    if (!index) return [];
    const name = normalizeCmName(card.name);
    const numbers = cardCmNumbers(card);
    const words = new Set(wordsOf(card.name));
    const free = index.all.filter((p) => !held.has(p.id));
    const scored = free.map((p) => {
      let score = (p.name === name || p.energy === name ? 100 : 0) + (p.number !== null && numbers.includes(p.number) ? 50 : 0);
      for (const w of new Set(wordsOf(p.raw))) if (words.has(w)) score += 10;
      return { p, score };
    });
    let pick = scored.filter((x) => x.score > 0);
    if (!pick.length && free.length <= 5) pick = scored;
    return pick.sort((a, b) => b.score - a.score || a.p.id - b.p.id).slice(0, 5).map(({ p }) => ({ productId: p.id, name: p.raw, ...hintFor(p, index) }));
  };
  const stillMissing = open.map(({ setId, card, exp, index }) => ({
    cardKey: `${setId}/${card.cardId}`, name: card.name, deName: card.i18n?.de?.name ?? null, set: setId, expansionId: exp,
    candidates: candidatesFor(card, index),
  }));
  const byExp = new Map();
  for (const m of stillMissing) {
    if (m.expansionId === null) continue;
    const e = byExp.get(m.expansionId) ?? { expansionId: m.expansionId, count: 0, sets: new Set() };
    e.count++;
    e.sets.add(m.set);
    byExp.set(m.expansionId, e);
  }
  const stillMissingByExpansion = [...byExp.values()]
    .sort((a, b) => b.count - a.count || a.expansionId - b.expansionId)
    .map((e) => ({ ...e, sets: [...e.sets].sort() }));

  // Oversize-Produkte und Produkte mit Versions-Suffix ("4V2", "224a"), die keine Karte bekommen hat
  const oversizeExcludedProducts = [];
  const versionSuffixSkippedByExpansion = {};
  for (const [expansionId, index] of indexes) {
    if (!index) continue;
    for (const p of index.oversized) oversizeExcludedProducts.push({ ...p, expansionId });
    const n = index.all.filter((p) => p.number && VERSION_SUFFIX.test(p.number) && !held.has(p.id)).length;
    if (n) versionSuffixSkippedByExpansion[expansionId] = n;
    rules.versionSuffixSkipped += n;
  }
  oversizeExcludedProducts.sort((a, b) => a.productId - b.productId);
  rules.oversizeExcluded = oversizeExcludedProducts.length;

  // Abdeckung und Suchlink je Set (Report cardmarket-ids.json/.md): withId = Karten mit Cardmarket-ID, bySource nach Herkunft.
  for (const row of Object.values(bySet)) {
    const bySource = {};
    for (const k of ['tcgdex', 'customSet', 'override', 'matched', 'stabilityKept']) if (row[k] > 0) bySource[k] = row[k];
    row.coverage = { cards: row.cards, withId: row.cards - row.missing, bySource };
    row.searchUrl = cardmarketSearchUrl(row.expansionId);
  }
  const totals = { cards: 0, tcgdex: 0, matched: 0, missing: 0, ambiguous: 0, override: 0, customSet: 0, stabilityKept: 0 };
  for (const row of Object.values(bySet)) for (const k of Object.keys(totals)) totals[k] += row[k] ?? 0;
  return {
    totals, rules, bySet, duplicateTcgdexIds, duplicates: dup, expansionMismatch, setsWithoutExpansion,
    customSets: customSetReport, stabilityKept, stabilityDropped, stabilityConflicts,
    overrides: overrideReport, orderedRejected, oversizeExcludedProducts, versionSuffixSkippedByExpansion, stillMissing, stillMissingByExpansion,
  };
}
