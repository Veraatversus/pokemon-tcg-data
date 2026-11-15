// Stufe 3: geteilte TCGdex-IDs (Besitzer, Doppelpruefung) und strenge Korrektur je Karte.
import { strictMatch } from './index-expansion.mjs';
import { cmNameMatches } from './names.mjs';
import { tcgdexIds } from './ids.mjs';

/** Wer haelt welche TCGdex-ID? -> { owners, taken, duplicateTcgdexIds, sharedId, isShared, cardById, heldByNamesake } */
export function indexSharedIds(ctx) {
  const { cardsBySet, productOf } = ctx;
  const owners = new Map(); // TCGdex-Produkt-ID -> card.id[]
  for (const cards of cardsBySet.values()) {
    for (const c of cards) for (const id of new Set(tcgdexIds(c))) owners.set(id, [...(owners.get(id) ?? []), c.id]);
  }
  const taken = new Set(owners.keys());
  const duplicateTcgdexIds = {};
  for (const [id, cardIds] of owners) if (cardIds.length > 1) duplicateTcgdexIds[id] = [...cardIds].sort();

  const sharedId = (id) => (owners.get(id)?.length ?? 0) > 1;
  const isShared = (card) => tcgdexIds(card).some(sharedId);
  const cardById = new Map();
  for (const cards of cardsBySet.values()) for (const c of cards) cardById.set(c.id, c);
  // Geteilte ID, deren Produkt laut Name einer ANDEREN Karte gehoert (die eigene passt nicht, siehe Expansionspruefung).
  const heldByNamesake = (id, card) => {
    if (!sharedId(id)) return false;
    const name = productOf(id)?.name;
    return Boolean(name) && owners.get(id).some((k) => k !== card.id && cmNameMatches(name, cardById.get(k)?.name));
  };
  return { owners, taken, duplicateTcgdexIds, sharedId, isShared, cardById, heldByNamesake };
}

/** Korrigiert geteilte TCGdex-IDs ueber den strengen Pfad. -> { dup } */
export function correctSharedIds(ctx) {
  const { walk, locked, owners, taken, bySet, duplicateTcgdexIds, sharedId, isShared } = ctx;
  const corrections = new Map(); // card.id -> { setId, card, id }
  const dup = { ids: Object.keys(duplicateTcgdexIds).length, cards: 0, corrected: 0, kept: 0 };
  walk(({ set, card, index }) => {
    if (locked.has(card.id) || !tcgdexIds(card).length || !isShared(card)) return;
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
  return { dup };
}
