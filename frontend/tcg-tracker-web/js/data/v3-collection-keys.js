// Browser-Aufloesung alter db_collection-Schluessel (setId, cardId) -> kanonischer Sammlungsschluessel.
// Semantik identisch zu resolveCollectionKey/findAmbiguousKey in scripts/api/registry/build-registry.mjs
// (Paritaetstest: tests/v3-collection-keys-parity.test.mjs). Nicht aus scripts/api importieren.
//
// Karten pro Set werden lazy nachgeladen: `cardsBySet` (Map<setId, Record<cardKey, RegistryCard>>) darf
// nach dem Erzeugen weiter befuellt werden. Ist ein Set per Alias aufloesbar, seine Karten aber noch nicht
// in der Map, werfen resolve()/ambiguous() einen Error mit code 'CARDS_NOT_LOADED' und setId
// (Aufrufer: loadRegistryCards(setId) -> cardsBySet.set(...) und erneut versuchen). Unbekanntes oder
// mehrdeutiges Set / leere Kartennummer -> null, ohne Karten zu benoetigen.
import { normalizeCardNumber as norm } from '../core/utils.js';

const TD_PREFIX = 'TCGDEX-';
const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

function buildAliasIndex(sets) {
  const idx = new Map();
  const put = (alias, entry) => {
    const k = alias.toLowerCase();
    const prev = idx.get(k);
    if (prev && prev.setId !== entry.setId) idx.set(k, { conflict: true });
    else if (!prev) idx.set(k, entry);
  };
  for (const [id, s] of Object.entries(sets ?? {})) {
    if (id.startsWith(TD_PREFIX)) put(id, { setId: id, ns: 'tcgdex', td: s.tcgdex ?? id.slice(TD_PREFIX.length) });
    else put(id, { setId: id, ns: 'pokemontcg', subset: null });
    if (s.pokemontcg) put(s.pokemontcg, { setId: id, ns: 'pokemontcg', subset: null });
    if (s.tcgdex) put(`${TD_PREFIX}${s.tcgdex}`, { setId: id, ns: 'tcgdex', td: s.tcgdex });
    for (const a of [...(s.mergedSubsets ?? []), ...(s.aliases ?? [])]) {
      if (a.startsWith(TD_PREFIX)) put(a, { setId: id, ns: 'tcgdex', td: a.slice(TD_PREFIX.length) });
      else put(a, { setId: id, ns: 'pokemontcg', subset: a === s.pokemontcg ? null : a });
    }
  }
  return idx;
}

function subsetCards(set, cards, subset) {
  const all = Object.entries(cards);
  const own = (card) => card.pokemontcg?.startsWith(`${subset}-`);
  const subsetTd = new Set((set.aliases ?? []).filter((a) => a.startsWith(TD_PREFIX))
    .map((a) => a.slice(TD_PREFIX.length)).filter((t) => t !== set.tcgdex));
  const tdSets = new Set(all.filter(([, c]) => own(c))
    .flatMap(([, c]) => (c.tcgdex ?? []).map((r) => r.set)).filter((t) => subsetTd.has(t)));
  return all.filter(([, c]) => own(c) || (c.tcgdex ?? []).some((r) => tdSets.has(r.set)));
}

function cardsNotLoaded(setId) {
  const err = new Error(`Registry-Karten fuer Set '${setId}' sind noch nicht geladen (loadRegistryCards + cardsBySet.set)`);
  err.code = 'CARDS_NOT_LOADED';
  err.setId = setId;
  return err;
}

export function createCollectionKeyResolver(registrySets, cardsBySet) {
  const sets = registrySets ?? {};
  const idx = buildAliasIndex(sets);

  function lookup(setKey, cardKey) {
    const entry = idx.get(String(setKey ?? '').trim().toLowerCase());
    if (!entry || entry.conflict) return null;
    const key = norm(cardKey);
    if (!key) return null;
    const cards = cardsBySet?.get(entry.setId);
    if (!cards) throw cardsNotLoaded(entry.setId);
    if (entry.ns === 'tcgdex') {
      const find = (eq) => Object.entries(cards).filter(([, c]) => (c.tcgdex ?? []).some((r) => r.set === entry.td
        && eq(norm(r.localId), key) && (c.keys?.tcgdex ?? []).includes(norm(r.localId))));
      let hits = find((a, b) => a === b);
      if (!hits.length) hits = find((a, b) => a.toLowerCase() === b.toLowerCase());
      return { entry, key, pool: [], hits: hits.map(([id]) => id) };
    }
    const pool = entry.subset ? subsetCards(sets[entry.setId], cards, entry.subset) : Object.entries(cards);
    const find = (eq) => {
      const canon = pool.filter(([id]) => eq(id, key));
      if (canon.length) return canon;
      return pool.filter(([, c]) => (c.keys?.pokemontcg ?? []).some((k) => eq(k, key)));
    };
    let hits = find((a, b) => a === b);
    if (!hits.length) hits = find((a, b) => a.toLowerCase() === b.toLowerCase());
    return { entry, key, pool, hits: hits.map(([id]) => id) };
  }

  return {
    resolveSetKey(setKey) {
      const entry = idx.get(String(setKey ?? '').trim().toLowerCase());
      return !entry || entry.conflict ? null : entry.setId;
    },
    resolve(setKey, cardKey) {
      const r = lookup(setKey, cardKey);
      if (!r || r.hits.length !== 1) return null;
      return { setId: r.entry.setId, collectionKey: r.hits[0] };
    },
    ambiguous(setKey, cardKey) {
      const r = lookup(setKey, cardKey);
      if (!r || r.hits.length || r.entry.ns !== 'pokemontcg') return null;
      const ids = r.pool.filter(([, c]) => c.ambiguousLegacyKey === r.key).map(([id]) => id).sort(cmp);
      return ids.length ? { setId: r.entry.setId, legacyKey: r.key, collectionKeys: ids } : null;
    },
    aliasesOf(canonicalSetId) {
      const out = new Set();
      for (const [alias, entry] of idx) if (!entry.conflict && entry.setId === canonicalSetId) out.add(alias);
      const s = sets[canonicalSetId];
      if (!s) return [];
      // Original-Schreibweise statt der kleingeschriebenen Index-Schluessel
      const orig = [canonicalSetId, s.pokemontcg, s.tcgdex ? `${TD_PREFIX}${s.tcgdex}` : null,
        ...(s.mergedSubsets ?? []), ...(s.aliases ?? [])].filter(Boolean);
      return [...new Set(orig.filter((a) => out.has(a.toLowerCase())))];
    },
  };
}
