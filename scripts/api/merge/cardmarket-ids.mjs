// Traegt Cardmarket-Produkt-IDs fuer Karten nach, denen TCGdex keine liefert (ids.cardmarket leer).
// Quelle: cardmarket/sets/<expansionId>.json (Workflow "Build Cardmarket Data"), nur Pokémon-Singles.
//
// Regeln (kein Raten):
// - Kandidaten: Produkte der Expansion mit gleicher normalisierter Nummer UND gleichem normalisierten Namen.
// - Gibt es keinen, nur per Name: genau EIN Produkt dieses Namens in der ganzen Expansion, und es hat
//   collectorNumber null.
// - Produkte, die eine TCGdex-ID schon belegt, sind keine Kandidaten.
// - Genau ein Kandidat -> ids.cardmarket = [id], ids.cardmarketSource = 'matched'; mehrere -> leer (mehrdeutig).
// - Bekaemen zwei Karten dasselbe Produkt, bleiben beide leer (mehrdeutig).
// - Eine vorhandene TCGdex-ID wird nie ueberschrieben.
// Unterset-Karten (in ein Haupt-Set gemergt) suchen in der Expansion ihres TCGdex-Untersets, sonst in der
// des Haupt-Sets; finden sie dort nichts, bleiben sie leer und stehen in subsetMissing.

const SINGLE_CATEGORY_ID = 51;
const SINGLE_CATEGORY = 'Pokémon Single';

export function normalizeCmNumber(value) {
  if (value === undefined || value === null) return null;
  const s = String(value).trim().toLowerCase();
  if (!s) return null;
  const m = /^([a-z]*)0*(\d+)(.*)$/.exec(s);
  return m ? `${m[1]}${m[2]}${m[3]}` : s;
}

// Klammerzusaetze ([Angriffe], [F], [A]) und Cardmarkets Level-Angabe "Lv.44" (nicht "LV.X") fallen weg,
// "★" entspricht "Gold Star", "Delta Species" ist bei Cardmarket nur ein Zusatz zu "δ".
// Danach ohne Diakritika, klein, nur Buchstaben und Ziffern.
export function normalizeCmName(value) {
  return String(value ?? '')
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/\bLv\.\s*\d+/gi, ' ')
    .replace(/★/g, ' gold star ')
    .replace(/\bdelta species\b/gi, ' ')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, '');
}

const isSingle = (p) => p?.categoryId === SINGLE_CATEGORY_ID || p?.categoryName === SINGLE_CATEGORY;

// Nachsichtiger Namensvergleich, nur fuer die Frage "zeigt diese vorhandene ID auf ein falsches Produkt?"
// (nie zum Finden): Cardmarket schreibt Kurz-Tags in Klammern ("Lucario [GL]", "Growing [G] Energy"),
// Basis-Energien mit "Basic" und Varianten mit Untertitel ("Professor's Research - Professor Oak").
export function cmNameMatches(cmName, cardName) {
  const card = normalizeCmName(cardName);
  if (!card) return false;
  const raw = String(cmName ?? '');
  const forms = [raw, raw.replace(/\[([^\]|]{1,4})\]/g, ' $1 '), raw.replace(/^Basic\s+/i, ''), raw.split(' - ')[0]];
  return forms.some((f) => normalizeCmName(f) === card);
}

// Primaere Cardmarket-ID einer Karte (gleiche Regel im Frontend): erste ungestempelte Variante mit
// cardmarketId, sonst erste Variante mit cardmarketId, sonst ids.cardmarket[0].
export function primaryCardmarketId(card) {
  const variants = (card?.variants ?? []).filter((v) => typeof v?.cardmarketId === 'number');
  const stamped = (v) => (Array.isArray(v.stamp) ? v.stamp.length > 0 : Boolean(v.stamp));
  const id = (variants.find((v) => !stamped(v)) ?? variants[0])?.cardmarketId ?? card?.ids?.cardmarket?.[0];
  return typeof id === 'number' ? id : undefined;
}

function indexExpansion(expansion) {
  const byNumber = new Map();
  const byName = new Map();
  const byId = new Map(); // alle Produkte der Datei, fuer die Pruefung vorhandener IDs
  for (const p of expansion?.cards ?? []) {
    if (typeof p.cardmarketProductId === 'number') byId.set(p.cardmarketProductId, p);
    if (!isSingle(p) || typeof p.cardmarketProductId !== 'number') continue;
    const entry = { id: p.cardmarketProductId, number: normalizeCmNumber(p.collectorNumber), name: normalizeCmName(p.name) };
    if (entry.number) byNumber.set(entry.number, [...(byNumber.get(entry.number) ?? []), entry]);
    byName.set(entry.name, [...(byName.get(entry.name) ?? []), entry]);
  }
  return { byNumber, byName, byId };
}

// -> { id } | { ambiguous: true } | null
function matchOne(card, index, taken) {
  const name = normalizeCmName(card.name);
  if (!name) return null;
  const number = normalizeCmNumber(card.number);
  const byNumber = (index.byNumber.get(number) ?? []).filter((p) => p.name === name && !taken.has(p.id));
  if (byNumber.length === 1) return { id: byNumber[0].id };
  if (byNumber.length > 1) return { ambiguous: true };
  const sameName = index.byName.get(name) ?? [];
  const unnumbered = sameName.filter((p) => p.number === null && !taken.has(p.id));
  if (sameName.length === 1 && unnumbered.length === 1) return { id: unnumbered[0].id };
  // Unnummerierte Kandidaten, aber der Name ist in der Expansion nicht eindeutig -> mehrdeutig
  if (unnumbered.length && sameName.length > 1) return { ambiguous: true };
  return null;
}

// Strenger Pfad (nur fuer Korrekturen): genau ein Produkt mit gleicher Nummer und gleichem Namen,
// unabhaengig von belegten IDs; nie nur per Name.
function strictMatch(card, index) {
  const name = normalizeCmName(card.name);
  const number = normalizeCmNumber(card.number);
  if (!name || !number) return null;
  const hits = (index.byNumber.get(number) ?? []).filter((p) => p.name === name);
  return hits.length === 1 ? hits[0].id : null;
}

const tcgdexIds = (card) => (Array.isArray(card.ids?.cardmarket) ? card.ids.cardmarket : []);

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
 * Expansionspruefung (nur mit productExpansion(id) -> expansionId aus cardmarket/index/products.json und
 * knownExpansions = Expansionen mit Set-Datei aus cardmarket/index/sets.json; Report expansionMismatch):
 * - Set: ids.cardmarket muss eine bekannte Expansion sein. Sonst wird sie nur abgeleitet, wenn >= 80 % der
 *   Karten mit IDs ein namensgleiches Produkt in genau dieser Expansion haben (ids.cardmarketSetSource
 *   'derived', Original in ids.cardmarketTcgdexSet); sonst bleibt der Wert und wird gemeldet (invalid-kept).
 * - Karte: Eine ID, deren Produktname nicht zum Kartennamen passt (cmNameMatches), wird durch den Treffer
 *   nach den Lueckenregeln in der Expansion der Karte ersetzt (Nummer + Name, sonst eindeutiger Name ohne
 *   Nummer; ids.cardmarketSource 'corrected-expansion', Original in ids.cardmarketTcgdex). Ohne Treffer
 *   wird sie entfernt, wenn das Produkt in einer fremden Expansion liegt (dropped-mismatch: kein Link ist
 *   besser als ein falscher), sonst bleibt sie (kept-mismatch). Namensgleiche Produkte fremder Expansionen
 *   (Stempel-, Ball-Varianten) bleiben. Sets ohne gueltige Expansion werden nur gemeldet (no-set-expansion).
 */
export function fillCardmarketIds({
  sets, cardsBySet, loadExpansion, subsetExpansion = new Map(), knownExpansions = null, productExpansion = null,
}) {
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

  // 0. Set-Ebene: Expansion pruefen, notfalls aus den Karten ableiten
  const expansionMismatch = {
    totals: { checked: 0, ok: 0, foreignNameOk: 0, corrected: 0, dropped: 0, keptMismatch: 0, noSetExpansion: 0, unknownProduct: 0 },
    sets: [], cards: [], foreignNameOkBySet: {},
  };
  const refExpansion = new Map(); // set.id -> gepruefte Expansion | null
  for (const set of sets) {
    const raw = set.ids?.cardmarket;
    if (raw === null || raw === undefined || validExpansion(raw) || !productExpansion) {
      refExpansion.set(set.id, validExpansion(raw) ? raw : null);
      continue;
    }
    const counts = new Map();
    let withIds = 0;
    for (const card of cardsBySet.get(set.id) ?? []) {
      const ids = tcgdexIds(card);
      if (!ids.length) continue;
      withIds++;
      const exps = new Set();
      for (const id of ids) {
        const p = productOf(id);
        if (p?.name && validExpansion(p.expansion) && cmNameMatches(p.name, card.name)) exps.add(p.expansion);
      }
      for (const e of exps) counts.set(e, (counts.get(e) ?? 0) + 1);
    }
    const ranked = [...counts].sort((a, b) => b[1] - a[1] || a[0] - b[0]);
    const [best, second] = ranked;
    const evidence = `${best?.[1] ?? 0}/${withIds}`;
    if (best && best[1] >= 0.8 * withIds && (!second || second[1] < best[1])) {
      set.ids = { ...set.ids, cardmarket: best[0], cardmarketSetSource: 'derived', cardmarketTcgdexSet: raw };
      refExpansion.set(set.id, best[0]);
      expansionMismatch.sets.push({ setId: set.id, oldId: raw, newId: best[0], reason: 'derived', evidence });
    } else {
      refExpansion.set(set.id, null);
      expansionMismatch.sets.push({ setId: set.id, oldId: raw, newId: null, reason: 'invalid-kept', evidence });
    }
  }

  const owners = new Map(); // TCGdex-Produkt-ID -> card.id[]
  for (const cards of cardsBySet.values()) {
    for (const c of cards) for (const id of new Set(tcgdexIds(c))) owners.set(id, [...(owners.get(id) ?? []), c.id]);
  }
  const taken = new Set(owners.keys());
  const duplicateTcgdexIds = {};
  for (const [id, cardIds] of owners) if (cardIds.length > 1) duplicateTcgdexIds[id] = [...cardIds].sort();

  const sharedId = (id) => (owners.get(id)?.length ?? 0) > 1;
  const isShared = (card) => tcgdexIds(card).some(sharedId);

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

  // 1. Geteilte TCGdex-IDs: strenger Treffer je Karte
  const corrections = new Map(); // card.id -> { setId, card, id }
  const dup = { ids: Object.keys(duplicateTcgdexIds).length, cards: 0, corrected: 0, kept: 0 };
  walk(({ set, card, index }) => {
    if (!tcgdexIds(card).length || !isShared(card)) return;
    dup.cards++;
    const id = index ? strictMatch(card, index) : null;
    if (id === null) return;
    // Das Produkt darf keiner anderen Karte per TCGdex gehoeren; ist es schon die einzige ID, bleibt alles.
    if ((owners.get(id) ?? []).some((k) => k !== card.id)) return;
    // Ist der Treffer schon die eigene, nicht geteilte ID, bleibt alles (wie base2-1 mit der geteilten).
    const ids = tcgdexIds(card);
    if (ids.length === 1 && ids[0] === id) return;
    corrections.set(card.id, { setId: set.id, card, id });
  });

  // Korrekturen: dasselbe Produkt fuer mehrere Karten -> keine korrigieren
  const corrClaims = new Map();
  for (const c of corrections.values()) corrClaims.set(c.id, (corrClaims.get(c.id) ?? 0) + 1);
  for (const { setId, card, id } of corrections.values()) {
    if (corrClaims.get(id) > 1) continue;
    dup.corrected++;
    bySet[setId].corrected = (bySet[setId].corrected ?? 0) + 1;
    taken.add(id);
    // Nur geteilte (falsche) IDs fallen weg; eigene, nicht geteilte TCGdex-IDs bleiben hinter dem Treffer.
    const original = tcgdexIds(card);
    const kept = original.filter((x) => x !== id && !sharedId(x));
    card.ids = { ...card.ids, cardmarket: [id, ...kept], cardmarketSource: 'corrected', cardmarketTcgdex: original };
    if (Array.isArray(card.variants)) {
      // Geteilte (falsche) Varianten-ID -> Treffer (Leser nehmen die erste Varianten-ID vor ids.cardmarket);
      // nicht geteilte Varianten-IDs (z. B. gestempelte Drucke) bleiben.
      card.variants = card.variants.map((v) => (v.cardmarketId !== undefined && sharedId(v.cardmarketId) ? { ...v, cardmarketId: id } : v));
    }
  }
  dup.kept = dup.cards - dup.corrected;

  // 1b. Expansionspruefung: IDs, deren Produkt anders heisst als die Karte
  if (productExpansion) {
    const T = expansionMismatch.totals;
    const report = (card, oldId, oldExpansion, newId, reason) => expansionMismatch.cards.push({ cardKey: card.id, oldId, oldExpansion, newId, reason });
    const flagged = []; // { card, index, bad: [{ id, expansion, foreign }] }
    walk(({ set, card, exp, index }) => {
      const accepted = new Set([refExpansion.get(set.id), exp].filter((e) => e !== null && validExpansion(e)));
      const bad = [];
      for (const id of tcgdexIds(card)) {
        T.checked++;
        const p = productOf(id);
        if (!p?.name) { T.unknownProduct++; report(card, id, p?.expansion ?? null, null, 'unknown-product'); continue; }
        if (cmNameMatches(p.name, card.name)) {
          if (accepted.size && !accepted.has(p.expansion)) {
            T.foreignNameOk++;
            const row = (expansionMismatch.foreignNameOkBySet[set.id] ??= {});
            row[p.expansion] = (row[p.expansion] ?? 0) + 1;
          } else T.ok++;
          continue;
        }
        if (!accepted.size) { T.noSetExpansion++; report(card, id, p.expansion, null, 'no-set-expansion'); continue; }
        bad.push({ id, expansion: p.expansion, foreign: !accepted.has(p.expansion) });
      }
      if (bad.length) flagged.push({ card, index, bad });
    });

    // Belegt sind alle IDs, die bei ihrer Karte stimmen; falsch zugeordnete Produkte werden frei.
    const badPairs = new Set(flagged.flatMap(({ card, bad }) => bad.map((b) => `${card.id}|${b.id}`)));
    const held = new Set();
    for (const cards of cardsBySet.values()) for (const c of cards) for (const id of tcgdexIds(c)) if (!badPairs.has(`${c.id}|${id}`)) held.add(id);
    for (const f of flagged) f.newId = (f.index ? matchOne(f.card, f.index, held) : null)?.id ?? null;
    const claimsX = new Map();
    for (const f of flagged) if (f.newId !== null) claimsX.set(f.newId, (claimsX.get(f.newId) ?? 0) + 1);

    for (const f of flagged) {
      const { card, bad } = f;
      const newId = f.newId !== null && claimsX.get(f.newId) === 1 ? f.newId : null;
      const replaced = new Set();
      const dropped = new Set();
      for (const b of bad) {
        if (newId !== null) { replaced.add(b.id); T.corrected++; report(card, b.id, b.expansion, newId, 'corrected-expansion'); }
        else if (b.foreign) { dropped.add(b.id); T.dropped++; report(card, b.id, b.expansion, null, 'dropped-mismatch'); }
        else { T.keptMismatch++; report(card, b.id, b.expansion, null, 'kept-mismatch'); }
      }
      if (!replaced.size && !dropped.size) continue;
      const original = tcgdexIds(card);
      const kept = original.filter((x) => !replaced.has(x) && !dropped.has(x));
      card.ids = {
        ...card.ids,
        cardmarket: [...new Set([...(newId !== null ? [newId] : []), ...kept])],
        ...(newId !== null ? { cardmarketSource: 'corrected-expansion' } : {}),
        cardmarketTcgdex: card.ids.cardmarketTcgdex ?? original,
      };
      if (newId !== null) taken.add(newId);
      if (Array.isArray(card.variants)) {
        card.variants = card.variants.map((v) => {
          if (replaced.has(v.cardmarketId)) return { ...v, cardmarketId: newId };
          if (!dropped.has(v.cardmarketId)) return v;
          const { cardmarketId, ...rest } = v;
          return rest;
        });
      }
    }
  }

  // 2. Luecken: Kandidaten je Karte ohne TCGdex-ID
  const results = new Map(); // card.id -> { setId, card, subset, result }
  walk(({ set, row, card, subset, exp, index }) => {
    if (tcgdexIds(card).length) { row.tcgdex++; return; }
    if (exp !== null && !index) row.expansionFileMissing = true;
    results.set(card.id, { setId: set.id, card, subset, result: index ? matchOne(card, index, taken) : null });
  });

  // 3. Dasselbe Produkt fuer mehrere Karten -> alle mehrdeutig
  const claims = new Map();
  for (const r of results.values()) if (r.result?.id !== undefined) claims.set(r.result.id, (claims.get(r.result.id) ?? 0) + 1);
  for (const r of results.values()) if (r.result?.id !== undefined && claims.get(r.result.id) > 1) r.result = { ambiguous: true };

  // 4. Schreiben und zaehlen
  const push = (row, key, cardId) => { (row[key] ??= []).push(cardId); };
  for (const { setId, card, subset, result } of results.values()) {
    const row = bySet[setId];
    if (result?.id !== undefined) {
      row.matched++;
      card.ids = { ...card.ids, cardmarket: [result.id], cardmarketSource: 'matched' };
      continue;
    }
    row.missing++;
    if (result?.ambiguous) { row.ambiguous++; push(row, 'ambiguousCards', card.cardId); }
    if (row.expansionId === null && !subset) continue;
    push(row, 'missingCards', card.cardId);
    if (subset) push(row, 'subsetMissing', card.cardId);
  }

  const totals = { cards: 0, tcgdex: 0, matched: 0, missing: 0, ambiguous: 0 };
  for (const row of Object.values(bySet)) for (const k of Object.keys(totals)) totals[k] += row[k];
  return { totals, bySet, duplicateTcgdexIds, duplicates: dup, expansionMismatch };
}
