// Registry: eingefrorene kanonische Set-/Kartenschluessel fuer db_collection (Spec §5.1-5.3).
// Reine Funktionen (Eingaben -> Registry); Datei-I/O liegt in registry-io.mjs.
import { normalizeCardNumber } from '../lib/card-key.mjs';

const TD_PREFIX = 'TCGDEX-';
const norm = normalizeCardNumber;
const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const refKey = (setId, localId) => `${setId}\u0000${localId}`;
const uniqSorted = (values) => [...new Set(values)].sort(cmp);

export class RegistryFrozenError extends Error {
  constructor(changes) {
    super(`Registry-Eintraege wuerden geaendert oder entfernt (${changes.length}):\n  ${changes.join('\n  ')}`);
    this.name = 'RegistryFrozenError';
    this.changes = changes;
  }
}

// Stabiler Vergleich unabhaengig von der Schluesselreihenfolge.
function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort(cmp).map((k) => `${JSON.stringify(k)}:${stable(value[k])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export function assertFrozen(previous, next) {
  const changes = [];
  if (!previous) return;
  for (const [id, set] of Object.entries(previous.sets ?? {})) {
    const now = next.sets?.[id];
    if (!now) changes.push(`Set ${id} entfernt`);
    else if (stable(now) !== stable(set)) changes.push(`Set ${id} geaendert: ${stable(set)} -> ${stable(now)}`);
  }
  for (const [setId, cards] of Object.entries(previous.cards ?? {})) {
    for (const [cardId, card] of Object.entries(cards)) {
      const now = next.cards?.[setId]?.[cardId];
      if (!now) changes.push(`Karte ${setId}/${cardId} entfernt`);
      else if (stable(now) !== stable(card)) changes.push(`Karte ${setId}/${cardId} geaendert: ${stable(card)} -> ${stable(now)}`);
    }
  }
  if (changes.length) throw new RegistryFrozenError(changes);
}

function overrideKey(overrides, ptId) {
  const o = ptId ? overrides?.[ptId] : undefined;
  if (o === undefined || o === null) return null;
  return typeof o === 'string' ? o : o.key;
}

function ptSuffix(ptId, ptSetId) {
  if (ptSetId && ptId.startsWith(`${ptSetId}-`)) return ptId.slice(ptSetId.length + 1);
  const i = ptId.indexOf('-');
  return i >= 0 ? ptId.slice(i + 1) : ptId;
}

// Frische Ableitung der Karten eines Registry-Sets (ohne previous).
function deriveCards(candidates, overrides, setLabel) {
  for (const c of candidates) {
    c.base = c.ptId ? (overrideKey(overrides, c.ptId) ?? norm(c.ptNumber)) : norm(c.refs[0].localId);
  }
  // TCGdex-Union-Karte mit gleichem Schluessel wie genau eine pt-Karte ohne Referenz in diesem
  // TCGdex-Set (Unterset-Karte im Hauptset, Override-Karte) -> eine Karte mit beiden Referenzen.
  const pts = candidates.filter((c) => c.ptId);
  const merged = new Set();
  for (const t of candidates.filter((c) => !c.ptId)) {
    const hits = pts.filter((p) => p.base === t.base);
    if (hits.length !== 1) continue;
    const [p] = hits;
    if (p.refs.some((r) => r.setId === t.refs[0].setId)) continue;
    p.refs.push(t.refs[0]);
    merged.add(t);
  }
  const list = candidates.filter((c) => !merged.has(c));

  const byBase = new Map();
  for (const c of list) {
    if (!byBase.has(c.base)) byBase.set(c.base, []);
    byBase.get(c.base).push(c);
  }
  const bases = new Set(byBase.keys());
  for (const [n, group] of byBase) {
    if (group.length === 1) {
      group[0].id = n;
      continue;
    }
    const suffixes = group.map((c) => (c.ptId ? norm(ptSuffix(c.ptId, c.ptSetId)) : null));
    const taken = new Set();
    group.forEach((c, i) => {
      c.ambiguousLegacyKey = n;
      const s = suffixes[i];
      const unique = s && s !== n && suffixes.filter((x) => x === s).length === 1 && !bases.has(s);
      let id = unique ? s : null;
      if (!id && c.refs.length) id = `${n}_${norm(c.refs[0].localId)}`;
      if (!id || taken.has(id) || bases.has(id)) {
        throw new Error(`Registry ${setLabel}: kein eindeutiger Schluessel fuer kollidierende Nummer ${n} (${c.ptId ?? refKey(c.refs[0]?.setId, c.refs[0]?.localId)})`);
      }
      taken.add(id);
      c.id = id;
    });
  }
  for (const c of list) {
    c.rawTd = uniqSorted(c.refs.map((r) => norm(r.localId)));
    // Variantengruppe (ecard2 50 -> 50a/50b): das alte Frontend fuehrte die TCGdex-Varianten als
    // TCGdex-Union-Karten unter der pt-Set-ID (Referenz-DB: ecard2/50a, 50b, 74a, ...).
    c.rawPt = c.ptId ? [norm(c.ptNumber), ...(c.method === 'variantGroup' ? c.rawTd : [])] : [c.id];
  }
  return list;
}

// Namensraum-Schluessel: ein Schluessel, der die kanonische ID einer anderen Karte ist oder bei
// mehreren Karten vorkommt, ist mehrdeutig und entfaellt (nur bei neuen, nicht eingefrorenen Karten).
function finalizeKeys(entries) {
  const pt = new Map();
  const tdKeys = new Map();
  const ids = new Set(entries.map((e) => e.id));
  const count = (map, k) => map.set(k, (map.get(k) ?? 0) + 1);
  for (const e of entries) {
    for (const k of new Set(e.rawPt)) count(pt, k);
    for (const k of new Set(e.rawTd)) count(tdKeys, k);
  }
  for (const e of entries) {
    if (e.frozen) continue;
    const keepPt = (k) => k === e.id || (!ids.has(k) && pt.get(k) === 1);
    e.card.keys = {
      pokemontcg: uniqSorted(e.rawPt.filter(keepPt)),
      tcgdex: uniqSorted(e.rawTd.filter((k) => tdKeys.get(k) === 1)),
    };
  }
}

function frozenEntry(id, card) {
  return {
    id, frozen: true, card,
    rawPt: [id, ...(card.keys?.pokemontcg ?? [])],
    rawTd: card.keys?.tcgdex ?? [],
  };
}

export function buildRegistry({
  ptSets = [], ptCardsBySet = new Map(), tcgdexSets = [], setPairs = [], cardResults = new Map(),
  subsetMerge = null, canonicalKeyOverrides = {}, previous = null,
}) {
  const pairs = Array.isArray(setPairs) ? setPairs : (setPairs?.pairs ?? []);
  const merges = Array.isArray(subsetMerge) ? subsetMerge : (subsetMerge?.merges ?? []);
  const tdOfPt = new Map(pairs.map((p) => [p.pokemontcgId, p.tcgdexId]));
  const pairedTd = new Set(pairs.map((p) => p.tcgdexId));
  const mainOf = new Map(merges.map((x) => [x.subset, x.main]));

  // previous: Sets ueber pt-ID (auch Unterset/Alias) und TCGdex-ID (auch TCGDEX-Alias) finden.
  const prevByPt = new Map();
  const prevByTd = new Map();
  for (const [id, s] of Object.entries(previous?.sets ?? {})) {
    if (s.pokemontcg) prevByPt.set(s.pokemontcg, id);
    if (s.tcgdex) prevByTd.set(s.tcgdex, id);
    for (const sub of s.mergedSubsets ?? []) prevByPt.set(sub, id);
    for (const a of s.aliases ?? []) {
      if (a.startsWith(TD_PREFIX)) { if (!prevByTd.has(a.slice(TD_PREFIX.length))) prevByTd.set(a.slice(TD_PREFIX.length), id); }
      else if (!prevByPt.has(a)) prevByPt.set(a, id);
    }
  }

  const groups = new Map();
  const group = (id, init) => {
    if (!groups.has(id)) {
      groups.set(id, { id, pokemontcg: null, tcgdex: null, subsets: [], extraTd: new Set(), candidates: [], ...init() });
    }
    return groups.get(id);
  };
  const referenced = new Map(); // refKey -> groupId
  const addCandidate = (g, cand) => {
    for (const r of cand.refs) referenced.set(refKey(r.setId, r.localId), g.id);
    g.candidates.push(cand);
  };

  // 1. pokemontcg-Sets (Hauptset vor Unterset durch Sortierung nach ID)
  for (const set of [...ptSets].sort((a, b) => cmp(a.id, b.id))) {
    const main = mainOf.get(set.id);
    const td = tdOfPt.get(set.id) ?? null;
    const gid = prevByPt.get(set.id) ?? (td && prevByTd.get(td))
      ?? (main ? prevByPt.get(main) ?? main : set.id);
    const g = group(gid, () => (main
      ? { pokemontcg: main, tcgdex: tdOfPt.get(main) ?? null }
      : { pokemontcg: set.id, tcgdex: td }));
    if (main) g.subsets.push({ pt: set.id, td });
    const res = cardResults.get(set.id) ?? {
      matched: [], primaryOnly: (ptCardsBySet.get(set.id) ?? []).map((c) => ({ ptId: c.id, ptNumber: c.number })), tcgdexOnly: [],
    };
    for (const x of res.matched ?? []) {
      addCandidate(g, {
        ptId: x.ptId, ptNumber: x.ptNumber, ptSetId: set.id, method: x.method, refs: x.tcgdex.map((r) => ({ ...r })),
      });
    }
    for (const x of res.primaryOnly ?? []) addCandidate(g, { ptId: x.ptId, ptNumber: x.ptNumber, ptSetId: set.id, refs: [] });
    for (const r of res.tcgdexOnly ?? []) addCandidate(g, { ptId: null, refs: [{ ...r }] });
  }

  // 2. TCGdex-Sets ohne Paar (Pocket, Promos, ... oder alle bei Build ohne pokemontcg)
  for (const set of [...tcgdexSets].sort((a, b) => cmp(a.id, b.id))) {
    if (pairedTd.has(set.id)) continue;
    const cards = set.cards ?? [];
    const free = cards.filter((c) => !referenced.has(refKey(set.id, c.localId)));
    let gid = prevByTd.get(set.id);
    if (!gid) {
      const owners = new Set(cards.filter((c) => !free.includes(c)).map((c) => referenced.get(refKey(set.id, c.localId))));
      if (owners.size && free.length) {
        throw new Error(`Registry: TCGdex-Set ${set.id} ist nur teilweise von ${[...owners].join(', ')} referenziert`);
      }
      if (owners.size > 1) throw new Error(`Registry: TCGdex-Set ${set.id} wird von mehreren Sets referenziert: ${[...owners].join(', ')}`);
      if (owners.size === 1) {
        groups.get([...owners][0]).extraTd.add(set.id);
        continue;
      }
      gid = `${TD_PREFIX}${set.id}`;
    }
    const g = group(gid, () => ({ tcgdex: set.id }));
    for (const c of free) addCandidate(g, { ptId: null, refs: [{ setId: set.id, localId: c.localId }] });
  }

  // 3. Karten je Set ableiten, mit previous zusammenfuehren
  const tdCards = new Map(tcgdexSets.map((s) => [s.id, new Set((s.cards ?? []).map((c) => c.localId))]));
  const drift = [];
  const out = { sets: {}, cards: {} };
  for (const id of [...new Set([...Object.keys(previous?.sets ?? {}), ...groups.keys()])].sort(cmp)) {
    const g = groups.get(id);
    const prevSet = previous?.sets?.[id];
    const prevCards = previous?.cards?.[id] ?? {};
    if (prevSet) out.sets[id] = structuredClone(prevSet);
    else {
      const aliases = new Set();
      if (g.pokemontcg) aliases.add(g.pokemontcg);
      if (g.tcgdex) aliases.add(`${TD_PREFIX}${g.tcgdex}`);
      for (const s of g.subsets) {
        aliases.add(s.pt);
        if (s.td) aliases.add(`${TD_PREFIX}${s.td}`);
      }
      for (const t of g.extraTd) aliases.add(`${TD_PREFIX}${t}`);
      aliases.delete(id);
      out.sets[id] = {
        pokemontcg: g.pokemontcg, tcgdex: g.tcgdex,
        mergedSubsets: uniqSorted(g.subsets.map((s) => s.pt)), aliases: [...aliases].sort(cmp),
      };
    }

    // Abweichung: eingefrorene Referenz existiert in TCGdex nicht mehr
    for (const [cardId, card] of Object.entries(prevCards)) {
      for (const r of card.tcgdex ?? []) {
        if (!tdCards.get(r.set)?.has(r.localId)) drift.push(`Karte ${id}/${cardId}: TCGdex-Referenz ${r.set}/${r.localId} existiert nicht mehr`);
      }
    }

    const entries = Object.entries(prevCards).map(([cid, card]) => frozenEntry(cid, structuredClone(card)));
    if (g) {
      const prevByPtId = new Map();
      const prevByRef = new Map();
      for (const e of entries) {
        if (e.card.pokemontcg) prevByPtId.set(e.card.pokemontcg, e);
        for (const r of e.card.tcgdex ?? []) prevByRef.set(refKey(r.set, r.localId), e);
      }
      // Nur Kandidaten ohne eingefrorenen Eintrag (ueber pt-ID oder TCGdex-Referenz) werden neu abgeleitet.
      const fresh = g.candidates.filter((c) => !((c.ptId && prevByPtId.get(c.ptId))
        || c.refs.some((r) => prevByRef.has(refKey(r.setId, r.localId)))));
      const derived = deriveCards(fresh, canonicalKeyOverrides, id);
      const usedIds = new Set(entries.map((e) => e.id));
      for (const c of derived) {
        let cid = c.id;
        if (usedIds.has(cid) && c.refs.length) cid = `${c.base}_${norm(c.refs[0].localId)}`;
        if (usedIds.has(cid)) throw new Error(`Registry ${id}: neuer Kartenschluessel ${c.id} kollidiert mit eingefrorenem Eintrag`);
        usedIds.add(cid);
        const card = { pokemontcg: c.ptId ?? null, tcgdex: c.refs.map((r) => ({ set: r.setId, localId: r.localId })), keys: null };
        if (c.ambiguousLegacyKey) card.ambiguousLegacyKey = c.ambiguousLegacyKey;
        entries.push({ id: cid, frozen: false, card, rawPt: c.rawPt, rawTd: c.rawTd });
      }
    }
    finalizeKeys(entries);
    out.cards[id] = {};
    for (const e of [...entries].sort((a, b) => cmp(a.id, b.id))) out.cards[id][e.id] = e.card;
  }
  if (drift.length) throw new RegistryFrozenError(drift);
  return out;
}

// --- Aufloesung von db_collection-Schluesseln ------------------------------------------

const indexCache = new WeakMap();

function aliasIndex(registry) {
  let idx = indexCache.get(registry);
  if (idx) return idx;
  idx = new Map();
  const put = (alias, entry) => {
    const k = alias.toLowerCase();
    const prev = idx.get(k);
    if (prev && prev.setId !== entry.setId) idx.set(k, { conflict: true });
    else if (!prev) idx.set(k, entry);
  };
  for (const [id, s] of Object.entries(registry.sets ?? {})) {
    if (id.startsWith(TD_PREFIX)) put(id, { setId: id, ns: 'tcgdex', td: s.tcgdex ?? id.slice(TD_PREFIX.length) });
    else put(id, { setId: id, ns: 'pokemontcg', subset: null });
    if (s.pokemontcg) put(s.pokemontcg, { setId: id, ns: 'pokemontcg', subset: null });
    if (s.tcgdex) put(`${TD_PREFIX}${s.tcgdex}`, { setId: id, ns: 'tcgdex', td: s.tcgdex });
    for (const a of [...(s.mergedSubsets ?? []), ...(s.aliases ?? [])]) {
      if (a.startsWith(TD_PREFIX)) put(a, { setId: id, ns: 'tcgdex', td: a.slice(TD_PREFIX.length) });
      else put(a, { setId: id, ns: 'pokemontcg', subset: a === s.pokemontcg ? null : a });
    }
  }
  indexCache.set(registry, idx);
  return idx;
}

// Karten eines Untersets: pt-ID mit Unterset-Praefix oder Referenz in einem Unterset-TCGdex-Set
// (TCGDEX-Alias ungleich Haupt-TCGdex-Set), in dem auch eine solche Karte liegt.
function subsetCards(set, cards, subset) {
  const all = Object.entries(cards);
  const own = (card) => card.pokemontcg?.startsWith(`${subset}-`);
  const subsetTd = new Set((set.aliases ?? []).filter((a) => a.startsWith(TD_PREFIX))
    .map((a) => a.slice(TD_PREFIX.length)).filter((t) => t !== set.tcgdex));
  const tdSets = new Set(all.filter(([, c]) => own(c))
    .flatMap(([, c]) => (c.tcgdex ?? []).map((r) => r.set)).filter((t) => subsetTd.has(t)));
  return all.filter(([, c]) => own(c) || (c.tcgdex ?? []).some((r) => tdSets.has(r.set)));
}

function lookup(registry, setId, cardId) {
  const entry = aliasIndex(registry).get(String(setId ?? '').trim().toLowerCase());
  if (!entry || entry.conflict) return null;
  const key = norm(cardId);
  if (!key) return null;
  const cards = registry.cards?.[entry.setId] ?? {};
  if (entry.ns === 'tcgdex') {
    const hits = Object.entries(cards).filter(([, c]) => (c.tcgdex ?? [])
      .some((r) => r.set === entry.td && norm(r.localId) === key && (c.keys?.tcgdex ?? []).includes(key)));
    return { entry, key, pool: [], hits: hits.map(([id]) => id) };
  }
  const pool = entry.subset ? subsetCards(registry.sets[entry.setId], cards, entry.subset) : Object.entries(cards);
  const find = (eq) => {
    const canon = pool.filter(([id]) => eq(id, key));
    if (canon.length) return canon;
    return pool.filter(([, c]) => (c.keys?.pokemontcg ?? []).some((k) => eq(k, key)));
  };
  let hits = find((a, b) => a === b);
  if (!hits.length) hits = find((a, b) => a.toLowerCase() === b.toLowerCase());
  return { entry, key, pool, hits: hits.map(([id]) => id) };
}

export function resolveCollectionKey(registry, setId, cardId) {
  const r = lookup(registry, setId, cardId);
  if (!r || r.hits.length !== 1) return null;
  return { setId: r.entry.setId, cardId: r.hits[0] };
}

// Alter mehrdeutiger Schluessel (Spec §5.3): alle Karten, die ihn als ambiguousLegacyKey fuehren.
export function findAmbiguousKey(registry, setId, cardId) {
  const r = lookup(registry, setId, cardId);
  if (!r || r.hits.length || r.entry.ns !== 'pokemontcg') return null;
  const ids = r.pool.filter(([, c]) => c.ambiguousLegacyKey === r.key).map(([id]) => id).sort(cmp);
  return ids.length ? { setId: r.entry.setId, legacyKey: r.key, cardIds: ids } : null;
}
