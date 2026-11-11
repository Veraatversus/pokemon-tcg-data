import { cardMatchKey } from '../lib/card-key.mjs';
import { normalizeName, namesSimilar } from '../lib/names.mjs';
import { sortLocalIds } from '../../cardmarket/tcgdex-helper/generate-tcgdex-helpers.mjs';

const hasName = (v) => typeof v === 'string' && normalizeName(v) !== '';
// Fehlende/leere Namen sind nie aehnlich (namesSimilar('', '') waere true).
const similar = (ptName, tdName) => hasName(ptName) && hasName(tdName) && namesSimilar(ptName, tdName);

const slot = (setId, card) => ({ setId, card, ref: { setId, localId: card.localId } });
const slotKey = (s) => `${s.setId}\u0000${s.card.localId}`;

export function matchCards({ ptCards, tcgdexSet, tcgdexSetsById, cardMap }) {
  const own = tcgdexSet ? (tcgdexSet.cards ?? []).map((c) => slot(tcgdexSet.id, c)) : [];
  const used = new Set();
  const results = new Array(ptCards.length).fill(null); // { slots, method }
  const take = (i, slots, method) => {
    slots.forEach((s) => used.add(slotKey(s)));
    results[i] = { slots, method };
  };
  const free = (s) => !used.has(slotKey(s));
  const pending = () => ptCards.map((_, i) => i).filter((i) => !results[i]);

  const unresolvedAliases = [];
  // 1. Aliase (auch set-uebergreifend)
  for (const [i, card] of ptCards.entries()) {
    const alias = cardMap?.aliases?.[card.number];
    if (!alias) continue;
    const setId = alias.set ?? tcgdexSet?.id;
    const target = setId === tcgdexSet?.id ? tcgdexSet : tcgdexSetsById?.get(setId);
    const cards = target?.cards ?? [];
    const found = cards.find((c) => c.localId === alias.localId)
      ?? cards.find((c) => cardMatchKey(c.localId) === cardMatchKey(alias.localId));
    const unresolved = (reason) => unresolvedAliases.push({
      ptNumber: card.number, target: { setId: setId ?? null, localId: alias.localId }, reason,
    });
    if (!found) unresolved(target ? 'Ziel-Karte nicht gefunden' : 'Ziel-Set nicht gefunden');
    else if (!free(slot(setId, found))) unresolved('Ziel-Karte bereits vergeben');
    else take(i, [slot(setId, found)], 'mapping');
  }

  // 2. Name und Reihenfolge (nur auf Anforderung)
  if (cardMap?.byNamePosition && own.length) {
    const ordered = [...own].sort((a, b) => sortLocalIds(a.card.localId, b.card.localId));
    for (const i of pending()) {
      const hit = ordered.find((s) => free(s) && similar(ptCards[i].name, s.card.name?.en));
      if (hit) take(i, [hit], 'namePosition');
    }
    for (const i of pending()) {
      const hit = ordered[i];
      if (hit && free(hit)) take(i, [hit], 'namePosition');
    }
  }

  // 3. gleicher Nummernschluessel
  const byKey = new Map();
  for (const s of own) {
    const k = cardMatchKey(s.card.localId);
    if (!byKey.has(k)) byKey.set(k, []);
    byKey.get(k).push(s);
  }
  for (const i of pending()) {
    const hit = (byKey.get(cardMatchKey(ptCards[i].number)) ?? []).find(free);
    if (hit) take(i, [hit], 'number');
  }

  // 4. Variantengruppe: pt-Schluessel + genau ein Buchstabe, nur ohne exakten Treffer
  for (const i of pending()) {
    const key = cardMatchKey(ptCards[i].number);
    if (!key) continue;
    const group = own
      .filter((s) => {
        const k = cardMatchKey(s.card.localId);
        return free(s) && k.length === key.length + 1 && k.startsWith(key) && /[a-z]$/.test(k);
      })
      .sort((a, b) => sortLocalIds(a.card.localId, b.card.localId));
    if (group.length) take(i, group, 'variantGroup');
  }

  const matched = [];
  const primaryOnly = [];
  for (const [i, card] of ptCards.entries()) {
    const r = results[i];
    if (!r) {
      primaryOnly.push({ ptId: card.id, ptNumber: card.number });
      continue;
    }
    matched.push({
      ptId: card.id,
      ptNumber: card.number,
      tcgdex: r.slots.map((s) => s.ref),
      method: r.method,
      suspicious: !r.slots.every((s) => similar(card.name, s.card.name?.en)),
    });
  }
  const tcgdexOnly = own
    .filter(free)
    .sort((a, b) => sortLocalIds(a.card.localId, b.card.localId))
    .map((s) => s.ref);
  return { matched, primaryOnly, tcgdexOnly, unresolvedAliases };
}
