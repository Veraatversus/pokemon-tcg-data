// Expansionspruefung: Set-Ebene (Expansion ableiten) und Karten-Ebene (IDs, deren Produkt anders heisst).
import { matchOne } from './index-expansion.mjs';
import { cmNameMatches } from './names.mjs';
import { tcgdexIds } from './ids.mjs';

/** Stufe 0: Expansion je Set pruefen, notfalls aus den Karten ableiten. -> { expansionMismatch, refExpansion, setsWithoutExpansion } */
export function deriveSetExpansions(ctx) {
  const { sets, cardsBySet, setOverrides, validExpansion, overrideReport, productExpansion, locked, previous, productOf } = ctx;
  const expansionMismatch = {
    totals: { checked: 0, ok: 0, foreignNameOk: 0, corrected: 0, dropped: 0, droppedShared: 0, keptMismatch: 0, noSetExpansion: 0, unknownProduct: 0 },
    sets: [], cards: [], foreignNameOkBySet: {},
  };
  // Reihenfolge (Spec §3.1): Zuordnungsdatei ("<setId>": expansionId) -> ids.cardmarket aus TCGdex/pokemontcg,
  // wenn im Katalog -> Mehrheit (>= 80 %) der Karten-IDs. Unklar -> null und setsWithoutExpansion.
  const refExpansion = new Map(); // set.id -> gepruefte Expansion | null
  const setsWithoutExpansion = [];
  for (const set of sets) {
    const raw = set.ids?.cardmarket;
    const forced = setOverrides.get(set.id);
    if (forced !== undefined) {
      if (validExpansion(forced)) {
        if (forced !== raw) set.ids = { ...set.ids, cardmarket: forced, cardmarketSetSource: 'override', ...(raw != null ? { cardmarketTcgdexSet: raw } : {}) };
        refExpansion.set(set.id, forced);
        continue;
      }
      overrideReport.warnings.push(`${set.id}: Expansion ${forced} nicht im Cardmarket-Katalog, ignoriert`);
      overrideReport.problems.push({ kind: 'missing-expansion', key: set.id, expansionId: forced });
    }
    if (validExpansion(raw) || !productExpansion) {
      refExpansion.set(set.id, validExpansion(raw) ? raw : null);
      continue;
    }
    const counts = new Map();
    let withIds = 0;
    const from = { tcgdex: 0, previous: 0 };
    for (const card of cardsBySet.get(set.id) ?? []) {
      // Karten-IDs: heutige TCGdex-IDs, sonst die zuletzt veroeffentlichten (previous; z. B. pt-Sets ohne TCGdex-IDs)
      const todayIds = locked.has(card.id) ? [] : tcgdexIds(card);
      const ids = todayIds.length || locked.has(card.id) ? todayIds : (previous?.get(`${set.id}/${card.cardId}`)?.ids ?? []);
      if (!ids.length) continue;
      withIds++;
      from[todayIds.length ? 'tcgdex' : 'previous']++;
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
    // Herkunft der Evidenz: heutige TCGdex-IDs, veroeffentlichte IDs (previous) oder beides
    const evidenceSource = !withIds ? null : !from.previous ? 'tcgdex' : !from.tcgdex ? 'previous' : 'mixed';
    if (best && best[1] >= 0.8 * withIds && (!second || second[1] < best[1])) {
      set.ids = { ...set.ids, cardmarket: best[0], cardmarketSetSource: 'derived', ...(raw != null ? { cardmarketTcgdexSet: raw } : {}) };
      refExpansion.set(set.id, best[0]);
      expansionMismatch.sets.push({ setId: set.id, oldId: raw ?? null, newId: best[0], reason: 'derived', evidence, evidenceSource });
    } else {
      refExpansion.set(set.id, null);
      if (raw != null) expansionMismatch.sets.push({ setId: set.id, oldId: raw, newId: null, reason: 'invalid-kept', evidence, evidenceSource });
      setsWithoutExpansion.push({ setId: set.id, tcgdexExpansion: raw ?? null, evidence, evidenceSource, cards: (cardsBySet.get(set.id) ?? []).length });
    }
  }
  return { expansionMismatch, refExpansion, setsWithoutExpansion };
}

/** Stufe 1b: IDs, deren Produkt anders heisst als die Karte (korrigieren, entfernen oder melden). */
export function checkExpansion(ctx) {
  const { productExpansion, expansionMismatch, walk, locked, refExpansion, validExpansion, productOf, cardsBySet, taken, heldByNamesake, expansionDropped } = ctx;
  if (productExpansion) {
    const T = expansionMismatch.totals;
    const report = (card, oldId, oldExpansion, newId, reason) => expansionMismatch.cards.push({ cardKey: card.id, oldId, oldExpansion, newId, reason });
    const flagged = []; // { card, index, bad: [{ id, expansion, foreign }] }
    walk(({ set, card, exp, index }) => {
      if (locked.has(card.id)) return;
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
        else if (heldByNamesake(b.id, card)) {
          // Geteilte TCGdex-ID, deren Produkt namentlich zu einer anderen Karte passt (Trainer-Kit-Paare, pl2-2
          // "Bastiodon GL" -> "Frost Rotom" von pl2-RT2): fuer diese Karte sicher falsch.
          dropped.add(b.id); T.dropped++; T.droppedShared++; report(card, b.id, b.expansion, null, 'dropped-shared-mismatch');
        } else { T.keptMismatch++; report(card, b.id, b.expansion, null, 'kept-mismatch'); }
      }
      if (!replaced.size && !dropped.size) continue;
      if (dropped.size) expansionDropped.set(card.id, new Set([...(expansionDropped.get(card.id) ?? []), ...dropped]));
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
}
