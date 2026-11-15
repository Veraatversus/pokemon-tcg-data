// Stufe 3c: Stabilitaetsregel (previous = zuletzt veroeffentlichte Ausgabe).
import { tcgdexIds, primaryCardmarketId } from './ids.mjs';

/** -> { stabilityKept, stabilityDropped, stabilityConflicts, stableCards } */
export function applyStability(ctx) {
  const { previous, productExpansion, results, tcgdexBefore, locked, csRejected, expansionDropped, duplicateTcgdexIds, walk, bySet } = ctx;
  // 3c. Stabilitaetsregel (Spec §3.4): previous = zuletzt veroeffentlichte Ausgabe ("<setId>/<cardId>" ->
  // { ids, source, variants }). Eine ueber Stufe 3-4 vergebene primaere ID von gestern bleibt, wenn heute
  // keine Stufe sie liefert oder eine andere Stufe-3/4-ID entsteht. Ausnahmen: Override/custom-set (Stufe
  // 1-2) entscheiden (Karte gesperrt); das Produkt fehlt im Katalog (stabilityDropped); TCGdex selbst
  // liefert heute eine andere ID als gestern (gestern und heute Quelle TCGdex: Upstream-Korrektur gilt).
  // Haelt heute eine andere Karte das Produkt (und hielt es gestern nicht), weicht eine heutige Regel-ID;
  // eine TCGdex-ID dagegen nicht (stabilityConflicts, gestrige ID entfaellt).
  // custom-set: eine gestrige Stufe-2-ID bleibt auch, wenn das custom-set heute nicht entscheidet (neues Produkt mit
  // gleicher Nummer -> mehrdeutig, Kartennummer geaendert). Ein heute anders entscheidendes custom-set sperrt die Karte
  // (locked) und gewinnt; ein verschwundenes Produkt faellt weg (product-gone). Bewusst entfernen: Override null.
  const STABLE_SOURCES = new Set(['tcgdex', 'custom-set', 'matched', 'corrected', 'corrected-expansion', 'ordered', 'energySymbol', 'leftRight']);
  const stabilityKept = [];
  const stabilityDropped = [];
  const stabilityConflicts = [];
  const stableCards = new Set();
  if (previous && productExpansion) {
    const exists = (id) => typeof productExpansion(id) === 'number';
    const variantIds = (card) => (card.variants ?? []).map((v) => v?.cardmarketId).filter((id) => typeof id === 'number');
    const todayOf = (card) => {
      const r = results.get(card.id);
      if (r) return r.result?.id !== undefined ? { id: r.result.id, source: r.result.source ?? 'matched' } : { id: null, source: null };
      const id = primaryCardmarketId(card);
      return id === undefined ? { id: null, source: null } : { id, source: card.ids.cardmarketSource ?? 'tcgdex' };
    };
    const vkey = (v) => JSON.stringify(Object.keys(v).filter((k) => k !== 'cardmarketId' && k !== 'tcgplayerId').sort().map((k) => [k, v[k]]));
    // Gleicher Stand wie gestern: ids.cardmarket und Varianten-IDs (je Variante ohne IDs als Schluessel)
    const sameState = (card, prev) => {
      const r = results.get(card.id);
      const ids = r ? (r.result?.id !== undefined ? [r.result.id] : []) : tcgdexIds(card);
      if (JSON.stringify(ids) !== JSON.stringify(prev.ids ?? [])) return false;
      const was = new Map((prev.variants ?? []).map((v) => [vkey(v), v.cardmarketId ?? null]));
      return (card.variants ?? []).every((v) => !was.has(vkey(v)) || was.get(vkey(v)) === (v.cardmarketId ?? null));
    };
    const candidates = [];
    walk(({ set, card }) => {
      if (locked.has(card.id)) return;
      const key = `${set.id}/${card.cardId}`;
      const raw = previous.get(key);
      const prevSource = raw?.source ?? 'tcgdex';
      if (!raw || !STABLE_SOURCES.has(prevSource)) return;
      // Laut custom-set falsche IDs (Stufe 2) kommen nie zurueck
      const rejected = new Set([...(csRejected.get(card.id) ?? []), ...(expansionDropped.get(card.id) ?? [])]);
      const prev = {
        ...raw,
        ids: (raw.ids ?? []).filter((id) => !rejected.has(id)),
        variants: (raw.variants ?? []).map((v) => (rejected.has(v?.cardmarketId) ? (({ cardmarketId, ...rest }) => rest)(v) : v)),
      };
      const rawPrimary = primaryCardmarketId({ ids: { cardmarket: raw.ids ?? [] }, variants: raw.variants ?? [] });
      if (rejected.has(rawPrimary)) { stabilityDropped.push({ cardKey: key, productId: rawPrimary, source: prevSource, reason: expansionDropped.get(card.id)?.has(rawPrimary) ? 'dropped-mismatch' : 'custom-set' }); return; }
      const productId = primaryCardmarketId({ ids: { cardmarket: prev.ids }, variants: prev.variants });
      if (productId === undefined) return;
      const today = todayOf(card);
      if (sameState(card, prev)) return;
      // Gestrige TCGdex-ID: nur wenn heute gar keine Stufe eine ID liefert und sie heute nicht geteilt ist
      // (sonst gewaenne eine geteilte, falsche TCGdex-ID dauerhaft gegen die heutige Korrektur).
      if (prevSource === 'tcgdex') {
        if (today.id !== null) return;
        // Alle gestrigen IDs (ids.cardmarket und Varianten) pruefen, nicht nur die primaere
        const shared = [productId, ...prev.ids, ...variantIds(prev)].find((id) => duplicateTcgdexIds[id]);
        if (shared !== undefined) { stabilityDropped.push({ cardKey: key, productId: shared, source: prevSource, reason: 'shared-tcgdex-id' }); return; }
      }
      if (!exists(productId)) { stabilityDropped.push({ cardKey: key, productId, source: prevSource, reason: 'product-gone' }); return; }
      candidates.push({ set, card, key, prev, prevSource, productId, today });
    });
    const candidateIds = new Set(candidates.map((c) => c.card.id));
    const holders = new Map(); // Produkt-ID -> [{ card, key, rule }]
    walk(({ set, card }) => {
      if (candidateIds.has(card.id)) return;
      const r = results.get(card.id);
      const ids = r ? (r.result?.id !== undefined ? [r.result.id] : []) : [...tcgdexIds(card), ...variantIds(card)];
      for (const id of new Set(ids)) holders.set(id, [...(holders.get(id) ?? []), { card, key: `${set.id}/${card.cardId}`, rule: Boolean(r) }]);
    });
    for (const c of candidates) {
      const { set, card, key, prev, prevSource, productId, today } = c;
      const others = (holders.get(productId) ?? []).filter((h) => !(previous.get(h.key)?.ids ?? []).includes(productId)
        && !(previous.get(h.key)?.variants ?? []).some((v) => v?.cardmarketId === productId));
      if (others.some((h) => !h.rule)) { stabilityConflicts.push({ cardKey: key, productId, heldBy: others.map((h) => h.key).sort() }); continue; }
      for (const h of others) results.get(h.card.id).result = { ambiguous: true, gaveWay: true };
      const ids = (prev.ids ?? []).filter((id) => Number.isInteger(id) && exists(id));
      if (!ids.includes(productId)) ids.unshift(productId);
      const orig = tcgdexBefore.get(card.id) ?? [];
      const next = { ...card.ids, cardmarket: ids };
      delete next.cardmarketSource;
      delete next.cardmarketTcgdex;
      if (prevSource !== 'tcgdex') next.cardmarketSource = prevSource;
      if (orig.length && (orig.length !== ids.length || orig.some((x, i) => x !== ids[i]))) next.cardmarketTcgdex = orig;
      card.ids = next;
      if (Array.isArray(card.variants)) {
        const prevVariants = new Map((prev.variants ?? []).map((v) => [vkey(v), v.cardmarketId]));
        card.variants = card.variants.map((v) => {
          const k = vkey(v);
          let id = prevVariants.has(k) ? prevVariants.get(k) : v.cardmarketId;
          if (typeof id === 'number' && (!exists(id) || (!prevVariants.has(k) && !ids.includes(id)))) id = undefined;
          const { cardmarketId, ...rest } = v;
          return typeof id === 'number' ? { ...rest, cardmarketId: id } : rest;
        });
        // Varianten passen nicht mehr zur gestrigen Karte -> primaere ID ueber ids.cardmarket erzwingen
        if (primaryCardmarketId(card) !== productId) { card.variants = card.variants.map(({ cardmarketId, ...rest }) => rest); c.variantsReset = true; }
      }
      stableCards.add(card.id);
      const row = bySet[set.id];
      if (results.has(card.id)) results.get(card.id).stable = true;
      else row.tcgdex--;
      row.stabilityKept = (row.stabilityKept ?? 0) + 1;
      stabilityKept.push({
        cardKey: key, productId, source: prevSource, todayId: today.id, todaySource: today.source,
        ...(others.length ? { displaced: others.map((h) => h.key).sort() } : {}), ...(c.variantsReset ? { variantsReset: true } : {}),
      });
    }
  }
  return { stabilityKept, stabilityDropped, stabilityConflicts, stableCards };
}
