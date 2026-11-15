// Traegt Cardmarket-Produkt-IDs fuer Karten nach, denen TCGdex keine liefert (ids.cardmarket leer).
// Quelle: sources/cardmarket/catalog.jsonl (nur Pokémon-Singles, ohne Nummern) und
// sources/cardmarket/custom-sets/<expansionId>.json (Nummern aus Cardmarket-HTML), geladen ueber
// scripts/api/sources/cardmarket-catalog.mjs. Nummernregeln greifen daher nur in Expansionen mit custom-set.
//
// Stufen je Karte (erste eindeutige gewinnt): 1. Override, 2. custom-set (exakte Nummer inkl. Zusatz),
// 3. TCGdex-ID (Expansions-/Doppelpruefung), 4. Regeln unten, 5. leer. Danach Stabilitaetsregel (previous).
//
// Regeln (kein Raten):
// - Kandidaten: Produkte der Expansion mit gleicher normalisierter Nummer UND gleichem normalisierten Namen.
// - Gibt es keinen, nur per Name: genau EIN Produkt dieses Namens in der ganzen Expansion, und es hat
//   collectorNumber null.
// - Produkte, die eine TCGdex-ID schon belegt, sind keine Kandidaten.
// - Genau ein Kandidat -> ids.cardmarket = [id], ids.cardmarketSource = 'matched'; mehrere -> leer (mehrdeutig).
// - Bekaemen zwei Karten dasselbe Produkt, bleiben beide leer (mehrdeutig).
// - Eine vorhandene TCGdex-ID wird nie ueberschrieben (ausser per Override, s. u.).
// - Produkte mit "[Oversized]" im Namen sind nie Kandidaten (auch nicht fuer Korrekturen).
// - Ohne Treffer: Cardmarkets Energie-Symbole im Namen ("Bubbly [W] Energy" = "Bubbly Water Energy").
// - Danach je (Expansion, Name), wenn alle gleichnamigen Karten noch offen sind und die gleichnamigen
//   Produkte alle ohne collectorNumber und frei sind: zwei Karten mit aufeinanderfolgenden Nummern <->
//   "[Left]"/"[Right]" (leftRight), sonst gleich viele Karten wie identisch benannte Produkte ->
//   aufsteigende Nummer <-> aufsteigende Produkt-ID (ordered). Sonst nichts.
// - Overrides (api/mappings/cardmarket-overrides.json, "<setId>/<cardId>": id | null) gewinnen vor allem.
// Unterset-Karten (in ein Haupt-Set gemergt) suchen in der Expansion ihres TCGdex-Untersets, sonst in der
// des Haupt-Sets; finden sie dort nichts, bleiben sie leer und stehen in subsetMissing.

import { cardmarketSearchUrl, primaryCardmarketId, tcgdexIds } from './cardmarket/ids.mjs';
import { registerSetNumbers } from './cardmarket/numbers.mjs';
import { OVERSIZED } from './cardmarket/names.mjs';
import { isSingle, indexExpansion } from './cardmarket/index-expansion.mjs';
import { deriveSetExpansions, checkExpansion } from './cardmarket/stage-expansion-check.mjs';
import { applyCustomSets } from './cardmarket/stage-custom-set.mjs';
import { indexSharedIds, correctSharedIds } from './cardmarket/stage-shared-ids.mjs';
import { matchRules } from './cardmarket/stage-rules.mjs';
import { applyStability } from './cardmarket/stage-stability.mjs';
import { buildReport } from './cardmarket/report.mjs';

// Alle bisher aus diesem Modul exportierten Namen bleiben hier erreichbar.
export { cardmarketSearchUrl, primaryCardmarketId };
export { normalizeCmNumber, commonNumberPrefix, registerSetNumbers, cardCmNumber, cardCmNumbers, customSetBase } from './cardmarket/numbers.mjs';
export { normalizeCmName, cmEnergyName, cmNameMatches, cmAttackKey, cardAttackKey } from './cardmarket/names.mjs';

// previous fuer die Stabilitaetsregel aus veroeffentlichten v3-Karten: "<setId>/<cardId>" -> { ids, source, variants }
// (source 'tcgdex', wenn die Karte keine ids.cardmarketSource hat). Nur Karten mit Cardmarket-ID.
export function previousFromCards(cards, into = new Map()) {
  for (const c of cards ?? []) {
    const ids = tcgdexIds(c).filter((id) => Number.isInteger(id));
    const variants = (c.variants ?? []).filter((v) => v && typeof v === 'object');
    if (!ids.length && !variants.some((v) => typeof v.cardmarketId === 'number')) continue;
    into.set(`${c.setId}/${c.cardId}`, { ids, source: c.ids?.cardmarketSource ?? 'tcgdex', variants });
  }
  return into;
}

/**
 * Fuellt ids.cardmarket der Karten in cardsBySet (in place) und liefert den Report.
 * sets: v3-Sets ({ id, ids: { cardmarket } }); loadExpansion(expansionId) -> { cards } | null;
 * subsetExpansion: Map card.id -> Cardmarket-Expansion des TCGdex-Untersets (null = keine eigene).
 *
 * Vorher: TCGdex-IDs, die mehreren Karten zugeordnet sind (duplicateTcgdexIds), werden je Karte ueber den
 * strengen Pfad korrigiert (ids.cardmarketSource 'corrected', Original in ids.cardmarketTcgdex; nur geteilte
 * IDs werden ersetzt bzw. entfernt, nicht geteilte bleiben in ids.cardmarket und an ihrer Variante). Ohne
 * eindeutigen strengen Treffer, bei schon anderweitig belegtem Produkt oder Doppelvergabe bleibt die
 * TCGdex-ID. Nicht doppelte TCGdex-IDs werden aus diesem Grund nicht angefasst.
 *
 * Expansionspruefung (nur mit productExpansion(id) -> expansionId aus dem Katalog und knownExpansions =
 * Expansionen des Katalogs; Report expansionMismatch):
 * - Set: Zuordnungsdatei ("<setId>": expansionId, ids.cardmarketSetSource 'override'), sonst ids.cardmarket,
 *   wenn bekannte Expansion. Sonst (auch bei null) nur abgeleitet, wenn >= 80 % der Karten mit IDs ein
 *   namensgleiches Produkt in genau dieser Expansion haben (ids.cardmarketSetSource 'derived', Original in
 *   ids.cardmarketTcgdexSet); sonst bleibt der Wert (invalid-kept) und das Set steht in setsWithoutExpansion.
 * - Karte: Eine ID, deren Produktname nicht zum Kartennamen passt (cmNameMatches), wird durch den Treffer
 *   nach den Lueckenregeln in der Expansion der Karte ersetzt (Nummer + Name, sonst eindeutiger Name ohne
 *   Nummer; ids.cardmarketSource 'corrected-expansion', Original in ids.cardmarketTcgdex). Ohne Treffer
 *   wird sie entfernt, wenn das Produkt in einer fremden Expansion liegt (dropped-mismatch: kein Link ist
 *   besser als ein falscher), sonst bleibt sie (kept-mismatch). Namensgleiche Produkte fremder Expansionen
 *   (Stempel-, Ball-Varianten) bleiben. Sets ohne gueltige Expansion werden nur gemeldet (no-set-expansion).
 */
export function fillCardmarketIds({
  sets, cardsBySet, loadExpansion, subsetExpansion = new Map(), knownExpansions = null, productExpansion = null, overrides = {}, previous = null,
}) {
  // Vor allen Schritten: TCGdex-IDs je Karte (fuer cardmarketTcgdex bei der Stabilitaetsregel)
  const tcgdexBefore = new Map();
  for (const cards of cardsBySet.values()) {
    registerSetNumbers(cards);
    for (const c of cards) tcgdexBefore.set(c.id, [...tcgdexIds(c)]);
  }
  const indexes = new Map();
  const indexFor = (expansionId) => {
    if (!indexes.has(expansionId)) {
      const expansion = loadExpansion(expansionId);
      indexes.set(expansionId, expansion ? indexExpansion(expansion) : null);
    }
    return indexes.get(expansionId);
  };
  const validExpansion = (e) => typeof e === 'number' && (!knownExpansions || knownExpansions.has(e));
  // -> { expansion, name|null } | null
  const productOf = (id) => {
    const expansion = productExpansion?.(id);
    if (typeof expansion !== 'number') return null;
    return { expansion, name: indexFor(expansion)?.byId.get(id)?.name ?? null };
  };
  const expansionDropped = new Map(); // card.id -> Set der heute per Expansionspruefung entfernten IDs (nie ueber previous zurueck)

  // Overrides zuerst: gewinnen vor TCGdex und allen Regeln; die Karte ist danach fuer alle Schritte gesperrt.
  // Zahl -> ids.cardmarket = [id] (Produkt muss im Produktindex stehen), null -> keine ID; Varianten-IDs
  // fallen weg, damit die primaere ID (primaryCardmarketId) die des Overrides ist.
  // Auffaelligkeiten (fremde Expansion, kein Single, [Oversized], doppelt vergeben, schon per TCGdex bei
  // einer anderen Karte) sind nur Warnungen: der Eintrag ist eine bewusste Entscheidung.
  // problems: strukturierte Fassung der Warnungen, deren Ziel im Katalog fehlt ({ kind: missing-product | missing-expansion, key }).
  const overrideReport = { applied: 0, removed: 0, warnings: [], problems: [] };
  const locked = new Set();
  const cardByKey = new Map();
  const heldBefore = new Map(); // Produkt-ID -> card.id[] (TCGdex-IDs und Varianten vor den Overrides)
  for (const [setId, cards] of cardsBySet) {
    for (const c of cards) {
      cardByKey.set(`${setId}/${c.cardId}`, c);
      const ids = new Set([...tcgdexIds(c), ...(c.variants ?? []).map((v) => v?.cardmarketId).filter((id) => typeof id === 'number')]);
      for (const id of ids) heldBefore.set(id, [...(heldBefore.get(id) ?? []), c.id]);
    }
  }
  const setById = new Map(sets.map((x) => [x.id, x]));
  const overrideKeys = Object.keys(overrides ?? {}).filter((k) => !k.startsWith('_')).sort();
  // "<setId>": expansionId (ohne "/") legt die Cardmarket-Expansion eines Sets fest (Spec §3.1).
  const setOverrides = new Map();
  for (const key of overrideKeys) {
    if (key.includes('/')) continue;
    if (!setById.has(key)) overrideReport.warnings.push(`${key}: Set nicht gefunden, ignoriert`);
    else if (!Number.isInteger(overrides[key])) overrideReport.warnings.push(`${key}: Expansion ${overrides[key]} ist keine Zahl, ignoriert`);
    else setOverrides.set(key, overrides[key]);
  }
  const cardOverrideKeys = overrideKeys.filter((k) => k.includes('/'));
  const keysByProduct = new Map();
  for (const key of cardOverrideKeys) {
    const value = overrides[key];
    if (Number.isInteger(value)) keysByProduct.set(value, [...(keysByProduct.get(value) ?? []), key]);
  }
  for (const key of cardOverrideKeys) {
    const value = overrides[key];
    const c = cardByKey.get(key);
    if (!c) { overrideReport.warnings.push(`${key}: Karte nicht gefunden, ignoriert`); continue; }
    if (value !== null && !(Number.isInteger(value) && typeof productExpansion?.(value) === 'number')) {
      overrideReport.warnings.push(`${key}: Produkt ${value} nicht im Cardmarket-Katalog, ignoriert`);
      overrideReport.problems.push({ kind: 'missing-product', key, productId: value });
      continue;
    }
    if (value !== null) {
      const warn = (why) => overrideReport.warnings.push(`${key}: Produkt ${value} ${why} (Warnung, uebernommen)`);
      const expansion = productExpansion(value);
      const setId = key.slice(0, key.lastIndexOf('/'));
      const setExp = setOverrides.get(setId) ?? setById.get(setId)?.ids?.cardmarket;
      const ownExp = subsetExpansion.get(c.id);
      if (expansion !== setExp && expansion !== ownExp) warn(`liegt in Expansion ${expansion}, nicht in der des Sets (${setExp ?? '-'})`);
      const p = indexFor(expansion)?.byId.get(value);
      if (p && !isSingle(p)) warn(`ist kein Pokémon-Single (Kategorie ${p.categoryId ?? p.categoryName ?? '?'})`);
      if (p && OVERSIZED.test(String(p.name ?? ''))) warn('ist ein [Oversized]-Produkt');
      const keys = keysByProduct.get(value) ?? [];
      if (keys.length > 1) warn(`steht mehrfach in den Overrides (${keys.join(', ')})`);
      const others = (heldBefore.get(value) ?? []).filter((id) => id !== c.id);
      if (others.length) warn(`gehoert per TCGdex schon zu ${others.join(', ')}`);
    }
    const original = tcgdexIds(c);
    c.ids = { ...c.ids, cardmarket: value === null ? [] : [value], cardmarketSource: 'override', ...(original.length ? { cardmarketTcgdex: original } : {}) };
    if (Array.isArray(c.variants)) c.variants = c.variants.map(({ cardmarketId, ...rest }) => rest);
    locked.add(c.id);
    if (value === null) overrideReport.removed++;
    else overrideReport.applied++;
  }

  const ctx = {
    sets, cardsBySet, loadExpansion, subsetExpansion, knownExpansions, productExpansion, overrides, previous, tcgdexBefore, indexes, indexFor,
    validExpansion, productOf, overrideReport, locked, cardByKey, setOverrides, cardOverrideKeys, expansionDropped,
  };
  // 0. Set-Ebene: Expansion pruefen, notfalls aus den Karten ableiten
  Object.assign(ctx, deriveSetExpansions(ctx));
  // 0b. custom-set (Stufe 2)
  Object.assign(ctx, applyCustomSets(ctx));
  Object.assign(ctx, indexSharedIds(ctx));

  const bySet = {};
  const walk = (fn) => {
    for (const set of sets) {
      const expansionId = typeof set.ids?.cardmarket === 'number' ? set.ids.cardmarket : null;
      bySet[set.id] ??= { expansionId, cards: (cardsBySet.get(set.id) ?? []).length, tcgdex: 0, matched: 0, missing: 0, ambiguous: 0 };
      for (const card of cardsBySet.get(set.id) ?? []) {
        const subset = subsetExpansion.has(card.id);
        const own = subset ? subsetExpansion.get(card.id) : null;
        const exp = validExpansion(own) ? own : expansionId;
        fn({ set, row: bySet[set.id], card, subset, exp, index: exp === null ? null : indexFor(exp) });
      }
    }
  };
  ctx.bySet = bySet;
  ctx.walk = walk;

  // 1. Geteilte TCGdex-IDs: strenger Treffer je Karte
  Object.assign(ctx, correctSharedIds(ctx));
  // 1b. Expansionspruefung: IDs, deren Produkt anders heisst als die Karte
  checkExpansion(ctx);
  // 2.-3b. Luecken: Regeln je Karte ohne TCGdex-ID
  Object.assign(ctx, matchRules(ctx));
  // 3c. Stabilitaetsregel
  Object.assign(ctx, applyStability(ctx));
  // 4. Schreiben und zaehlen
  return buildReport(ctx);
}
