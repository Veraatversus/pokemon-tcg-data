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

function indexExpansion(expansion) {
  const byNumber = new Map();
  const byName = new Map();
  for (const p of expansion?.cards ?? []) {
    if (!isSingle(p) || typeof p.cardmarketProductId !== 'number') continue;
    const entry = { id: p.cardmarketProductId, number: normalizeCmNumber(p.collectorNumber), name: normalizeCmName(p.name) };
    if (entry.number) byNumber.set(entry.number, [...(byNumber.get(entry.number) ?? []), entry]);
    byName.set(entry.name, [...(byName.get(entry.name) ?? []), entry]);
  }
  return { byNumber, byName };
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
 * strengen Pfad korrigiert (ids.cardmarketSource 'corrected', Original in ids.cardmarketTcgdex, andere
 * variants[].cardmarketId als der Treffer entfallen, damit Leser auf ids.cardmarket zurueckfallen). Ohne
 * eindeutigen strengen Treffer, bei schon anderweitig belegtem Produkt oder Doppelvergabe bleibt die
 * TCGdex-ID. Nicht doppelte TCGdex-IDs werden nie angefasst.
 */
export function fillCardmarketIds({ sets, cardsBySet, loadExpansion, subsetExpansion = new Map() }) {
  const owners = new Map(); // TCGdex-Produkt-ID -> card.id[]
  for (const cards of cardsBySet.values()) {
    for (const c of cards) for (const id of new Set(tcgdexIds(c))) owners.set(id, [...(owners.get(id) ?? []), c.id]);
  }
  const taken = new Set(owners.keys());
  const duplicateTcgdexIds = {};
  for (const [id, cardIds] of owners) if (cardIds.length > 1) duplicateTcgdexIds[id] = [...cardIds].sort();

  const indexes = new Map();
  const indexFor = (expansionId) => {
    if (!indexes.has(expansionId)) {
      const expansion = loadExpansion(expansionId);
      indexes.set(expansionId, expansion ? indexExpansion(expansion) : null);
    }
    return indexes.get(expansionId);
  };

  const isShared = (card) => tcgdexIds(card).some((id) => owners.get(id).length > 1);

  const bySet = {};
  const walk = (fn) => {
    for (const set of sets) {
      const expansionId = typeof set.ids?.cardmarket === 'number' ? set.ids.cardmarket : null;
      bySet[set.id] ??= { expansionId, cards: (cardsBySet.get(set.id) ?? []).length, tcgdex: 0, matched: 0, missing: 0, ambiguous: 0 };
      for (const card of cardsBySet.get(set.id) ?? []) {
        const subset = subsetExpansion.has(card.id);
        const own = subset ? subsetExpansion.get(card.id) : null;
        const exp = typeof own === 'number' ? own : expansionId;
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
    card.ids = { ...card.ids, cardmarket: [id], cardmarketSource: 'corrected', cardmarketTcgdex: tcgdexIds(card) };
    if (Array.isArray(card.variants)) {
      // Varianten-IDs ausser dem Treffer entfallen (Leser nehmen die erste Varianten-ID vor ids.cardmarket).
      card.variants = card.variants.map((v) => {
        if (v.cardmarketId === undefined || v.cardmarketId === id) return v;
        const { cardmarketId, ...rest } = v;
        return rest;
      });
    }
  }
  dup.kept = dup.cards - dup.corrected;

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
  return { totals, bySet, duplicateTcgdexIds, duplicates: dup };
}
