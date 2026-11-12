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
  if (unnumbered.length > 1) return { ambiguous: true };
  return null;
}

const tcgdexIds = (card) => (Array.isArray(card.ids?.cardmarket) ? card.ids.cardmarket : []);

/**
 * Fuellt ids.cardmarket der Karten in cardsBySet (in place) und liefert den Report.
 * sets: v3-Sets ({ id, ids: { cardmarket } }); loadExpansion(expansionId) -> { cards } | null;
 * subsetExpansion: Map card.id -> Cardmarket-Expansion des TCGdex-Untersets (null = keine eigene).
 */
export function fillCardmarketIds({ sets, cardsBySet, loadExpansion, subsetExpansion = new Map() }) {
  const taken = new Set();
  for (const cards of cardsBySet.values()) for (const c of cards) for (const id of tcgdexIds(c)) taken.add(id);

  const indexes = new Map();
  const indexFor = (expansionId) => {
    if (!indexes.has(expansionId)) {
      const expansion = loadExpansion(expansionId);
      indexes.set(expansionId, expansion ? indexExpansion(expansion) : null);
    }
    return indexes.get(expansionId);
  };

  // 1. Kandidaten je Karte
  const results = new Map(); // card.id -> { setId, card, result }
  const bySet = {};
  for (const set of sets) {
    const cards = cardsBySet.get(set.id) ?? [];
    const expansionId = typeof set.ids?.cardmarket === 'number' ? set.ids.cardmarket : null;
    const row = { expansionId, cards: cards.length, tcgdex: 0, matched: 0, missing: 0, ambiguous: 0 };
    bySet[set.id] = row;
    for (const card of cards) {
      if (tcgdexIds(card).length) { row.tcgdex++; continue; }
      const subset = subsetExpansion.has(card.id);
      const own = subset ? subsetExpansion.get(card.id) : null;
      const exp = typeof own === 'number' ? own : expansionId;
      const index = exp === null ? null : indexFor(exp);
      if (exp !== null && !index) row.expansionFileMissing = true;
      results.set(card.id, { setId: set.id, card, subset, result: index ? matchOne(card, index, taken) : null });
    }
  }

  // 2. Dasselbe Produkt fuer mehrere Karten -> alle mehrdeutig
  const claims = new Map();
  for (const r of results.values()) if (r.result?.id !== undefined) claims.set(r.result.id, (claims.get(r.result.id) ?? 0) + 1);
  for (const r of results.values()) if (r.result?.id !== undefined && claims.get(r.result.id) > 1) r.result = { ambiguous: true };

  // 3. Schreiben und zaehlen
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
  return { totals, bySet };
}
