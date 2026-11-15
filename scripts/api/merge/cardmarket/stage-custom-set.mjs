// Stufe 2: custom-set (exakte Nummer inkl. Zusatz) und Wegfall widersprochener TCGdex-IDs.
import { normalizeCmNumber, productsByNumber, cardCmNumbers, customSetBase, csBase } from './numbers.mjs';
import { cmNameMatches } from './names.mjs';
import { tcgdexIds } from './ids.mjs';

/** -> { customSetReport, csLocked, csRejected }; sperrt Treffer-Karten in ctx.locked. */
export function applyCustomSets(ctx) {
  const { sets, cardsBySet, locked, indexFor, overrides, cardOverrideKeys, cardByKey, subsetExpansion, validExpansion } = ctx;
  // Expansion einer Karte: eigene des TCGdex-Untersets (Galerie-Subsets), sonst die des Sets.
  const setExpansionOf = (set) => (typeof set.ids?.cardmarket === 'number' ? set.ids.cardmarket : null);
  const cardExpansion = (set, card) => {
    const own = subsetExpansion.has(card.id) ? subsetExpansion.get(card.id) : null;
    return validExpansion(own) ? own : setExpansionOf(set);
  };

  // 0b. custom-set (Stufe 2): exakte Nummer inkl. Zusatz ("4" ist die normale Karte, "4V2"/"224a"/"H1" nie).
  // Gewinnt vor TCGdex: TCGdex-IDs, die laut custom-set zu einer anderen Basisnummer gehoeren, fallen weg bzw.
  // werden ersetzt (auch an Varianten) - auch bei Karten, fuer die custom-set selbst nichts entscheidet
  // (mehrere Produkte zur Nummer, keine Nummer, Konflikt; Report customSets.dropped). IDs von Drucken derselben
  // Basisnummer ("101V2" bei Karte 101) und unbekannte IDs bleiben hinter dem Treffer. Mehrere Produkte zur
  // Nummer oder dasselbe Produkt fuer mehrere Karten -> custom-set entscheidet nicht (customSets.ambiguous /
  // conflicts). Eine Karte mit Treffer ist danach gesperrt.
  const customSetReport = { applied: 0, changed: 0, ambiguous: [], conflicts: [], nameWarnings: [], dropped: [] };
  const csLocked = new Set();
  const csRejected = new Map(); // card.id -> Set der laut custom-set falschen Produkt-IDs (auch fuer die Stabilitaetsregel)
  const overrideProducts = new Set();
  for (const key of cardOverrideKeys) if (Number.isInteger(overrides[key]) && locked.has(cardByKey.get(key)?.id)) overrideProducts.add(overrides[key]);
  // Nummer eines Produkts laut custom-set (auch mehrfach vergebene: beide Produkte "1" in 1536 sind Drucke von #1)
  const csNumber = (index, id) => {
    const p = index.byId.get(id);
    return p?.customSet ? normalizeCmNumber(p.collectorNumber) : null;
  };
  const isStamped = (v) => (Array.isArray(v.stamp) ? v.stamp.length > 0 : Boolean(v.stamp));
  const normalPrint = (v) => !isStamped(v) && v.size !== 'jumbo';
  const csCards = []; // { set, card, index, hits }
  const csClaims = new Map(); // Produkt-ID -> [eintrag]
  for (const set of sets) {
    for (const card of cardsBySet.get(set.id) ?? []) {
      if (locked.has(card.id)) continue;
      const exp = cardExpansion(set, card);
      const index = exp === null ? null : indexFor(exp);
      if (!index?.customSet.size) continue;
      // Trainer-Kit-Paar in einer Expansion: Nummer + Kit-Kuerzel ("1" im Noivern-Kit -> "1N"); Sets ohne Kuerzel
      // nutzen dieses custom-set nicht (ihre Nummer "1" gehoert keinem Kit eindeutig).
      const kit = index.setSuffix ? index.setSuffix[set.id] : undefined;
      if (index.setSuffix && !kit) continue;
      const hits = kit ? index.customSet.get(normalizeCmNumber(`${card.number}${kit}`)) ?? [] : productsByNumber(index.customSet, card);
      const entry = { set, card, index, hits, kit };
      csCards.push(entry);
      if (hits.length > 1) { customSetReport.ambiguous.push(`${set.id}/${card.cardId}`); continue; }
      if (hits.length) csClaims.set(hits[0].id, [...(csClaims.get(hits[0].id) ?? []), entry]);
    }
  }
  const applied = new Set();
  for (const [productId, claims] of csClaims) {
    if (claims.length > 1 || overrideProducts.has(productId)) {
      customSetReport.conflicts.push({ productId, cards: claims.map(({ set, card }) => `${set.id}/${card.cardId}`), ...(overrideProducts.has(productId) ? { reason: 'override' } : {}) });
      continue;
    }
    const [{ set, card, hits: [hit], index }] = claims;
    const base = csBase(index, hit.number);
    // Gehoert laut custom-set zu einer anderen Basisnummer derselben Expansion -> falsch fuer diese Karte
    const contradicted = (id) => { const n = csNumber(index, id); return id !== productId && n !== null && csBase(index, n) !== base; };
    // Druck derselben Basisnummer mit Zusatz ("149V2" bei Karte 149): Variante, nie die normale Karte
    const suffixed = (id) => { const n = csNumber(index, id); return id !== productId && n !== null && n !== base && csBase(index, n) === base; };
    const original = tcgdexIds(card);
    const rejected = new Set([...original, ...(card.variants ?? []).map((v) => v?.cardmarketId)].filter((id) => typeof id === 'number' && contradicted(id)));
    const kept = original.filter((x) => x !== productId && !rejected.has(x));
    const ids = [productId, ...kept];
    let changed = ids.length !== original.length || ids.some((x, i) => x !== original[i]);
    if (Array.isArray(card.variants)) {
      // Normale Drucke (ungestempelt, nicht Jumbo) mit falscher oder Zusatz-ID -> Treffer; gestempelte/Jumbo-
      // Varianten verlieren eine widersprochene ID und - wenn die Karte einen normalen Druck hat - auch das
      // Basisprodukt (das gehoert dem normalen Druck); Zusatz-IDs derselben Nummer bleiben dort.
      const hasNormal = card.variants.some((v) => v && normalPrint(v));
      card.variants = card.variants.map((v) => {
        const id = v.cardmarketId;
        if (typeof id !== 'number') return v;
        if (normalPrint(v)) {
          if (!(rejected.has(id) || suffixed(id))) return v;
          changed = true;
          return { ...v, cardmarketId: productId };
        }
        if (!rejected.has(id) && !(id === productId && hasNormal)) return v;
        changed = true;
        const { cardmarketId, ...rest } = v;
        return rest;
      });
    }
    card.ids = { ...card.ids, cardmarket: ids, cardmarketSource: 'custom-set', ...(changed && original.length ? { cardmarketTcgdex: original } : {}) };
    if (!cmNameMatches(hit.raw, card.name)) customSetReport.nameWarnings.push({ cardKey: `${set.id}/${card.cardId}`, name: card.name, productId, productName: hit.raw });
    customSetReport.applied++;
    if (changed && original.length) customSetReport.changed++;
    if (rejected.size) csRejected.set(card.id, rejected);
    applied.add(card.id);
    csLocked.add(card.id);
    locked.add(card.id);
  }
  // Karten ohne custom-set-Treffer: widersprochene TCGdex-IDs fallen trotzdem weg (z. B. ecard1-47 mit #12),
  // aber nur, wenn das custom-set die Nummer der Karte ueberhaupt fuehrt (svp-500 fehlt dort; die
  // Lot-Eintraege "224a-f" sind vergebene Nummern und sagen nichts ueber andere Karten).
  const basesOf = new Map();
  for (const { set, card, index, kit } of csCards) {
    if (applied.has(card.id)) continue;
    if (!basesOf.has(index)) basesOf.set(index, new Set([...index.customSet.keys()].map((n) => csBase(index, n))));
    const own = kit ? [normalizeCmNumber(`${card.number}${kit}`)] : cardCmNumbers(card).map(customSetBase);
    const base = own.find((b) => basesOf.get(index).has(b));
    if (base === undefined) continue;
    const contradicted = (id) => { const n = csNumber(index, id); return n !== null && csBase(index, n) !== base; };
    const original = tcgdexIds(card);
    const rejected = new Set([...original, ...(card.variants ?? []).map((v) => v?.cardmarketId)].filter((id) => typeof id === 'number' && contradicted(id)));
    if (!rejected.size) continue;
    csRejected.set(card.id, rejected);
    for (const id of [...rejected].sort((a, b) => a - b)) customSetReport.dropped.push({ cardKey: `${set.id}/${card.cardId}`, productId: id, number: csNumber(index, id) });
    card.ids = { ...card.ids, cardmarket: original.filter((x) => !rejected.has(x)), cardmarketTcgdex: card.ids.cardmarketTcgdex ?? original };
    if (Array.isArray(card.variants)) {
      card.variants = card.variants.map((v) => {
        if (!rejected.has(v?.cardmarketId)) return v;
        const { cardmarketId, ...rest } = v;
        return rest;
      });
    }
  }
  customSetReport.ambiguous.sort();
  return { customSetReport, csLocked, csRejected };
}
