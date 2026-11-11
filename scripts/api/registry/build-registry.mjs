// Registry: eingefrorene kanonische Set-/Kartenschluessel fuer db_collection (Spec §5.1-5.3).
// Reine Funktionen (Eingaben -> Registry); Datei-I/O liegt in registry-io.mjs.
//
// Einfrier-Modell: bestehende Werte bleiben unveraendert (jeder alte Schluessel loest weiter auf
// dieselbe Karte auf). Erlaubt sind nur additive Aenderungen: neue Sets/Karten, Aliase,
// mergedSubsets, TCGdex-Referenzen und Schluessel als Obermenge, pokemontcg/tcgdex null -> Wert.
import { normalizeCardNumber } from '../lib/card-key.mjs';

const TD_PREFIX = 'TCGDEX-';
const norm = normalizeCardNumber;
const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const refKey = (setId, localId) => `${setId}\u0000${localId}`;
const uniqSorted = (values) => [...new Set(values)].sort(cmp);
const BLOCKED = Symbol('blocked');

export class RegistryFrozenError extends Error {
  constructor(changes) {
    super(`Registry-Eintraege wuerden geaendert oder entfernt (${changes.length}):\n  ${changes.join('\n  ')}`);
    this.name = 'RegistryFrozenError';
    this.changes = changes;
  }
}

export class RegistryInvariantError extends Error {
  constructor(violations) {
    super(`Registry-Invariante verletzt (${violations.length}):\n  ${violations.join('\n  ')}`);
    this.name = 'RegistryInvariantError';
    this.violations = violations;
  }
}

// --- Invarianten -------------------------------------------------------------------------

// Je Set: jeder pt-Namensraum-Schluessel (kanonische ID + keys.pokemontcg) und jeder keys.tcgdex-
// Schluessel gehoert genau einer Karte; ambiguousLegacyKey ist nie ein pt-Schluessel.
// Global: Set-IDs und Aliase case-insensitiv eindeutig (auch Dateinamen), pt-Karten-IDs und
// TCGdex-Referenzen hoechstens einmal vergeben.
export function registryViolations(registry) {
  const v = [];
  const names = new Map();
  for (const [id, s] of Object.entries(registry.sets ?? {})) {
    for (const name of new Set([id, ...(s.aliases ?? []), ...(s.mergedSubsets ?? [])].map((x) => x.toLowerCase()))) {
      const other = names.get(name);
      if (other !== undefined && other !== id) v.push(`Set-ID/Alias '${name}' (case-insensitiv) in ${other} und ${id}`);
      else names.set(name, id);
    }
  }
  const ptIds = new Map();
  const refs = new Map();
  for (const [setId, cards] of Object.entries(registry.cards ?? {})) {
    const pt = new Map();
    const td = new Map();
    const claim = (map, ns, k, cid) => {
      const o = map.get(k);
      if (o !== undefined && o !== cid) v.push(`${setId}: ${ns}-Schluessel '${k}' bei ${o} und ${cid}`);
      else map.set(k, cid);
    };
    for (const [cid, c] of Object.entries(cards)) {
      claim(pt, 'pokemontcg', cid, cid);
      for (const k of c.keys?.pokemontcg ?? []) claim(pt, 'pokemontcg', k, cid);
      for (const k of c.keys?.tcgdex ?? []) claim(td, 'tcgdex', k, cid);
      if (c.pokemontcg) {
        if (ptIds.has(c.pokemontcg)) v.push(`pokemontcg-Karte ${c.pokemontcg} doppelt: ${ptIds.get(c.pokemontcg)} und ${setId}/${cid}`);
        else ptIds.set(c.pokemontcg, `${setId}/${cid}`);
      }
      for (const r of c.tcgdex ?? []) {
        const k = refKey(r.set, r.localId);
        if (refs.has(k)) v.push(`TCGdex-Karte ${r.set}/${r.localId} doppelt: ${refs.get(k)} und ${setId}/${cid}`);
        else refs.set(k, `${setId}/${cid}`);
      }
    }
    for (const [cid, c] of Object.entries(cards)) {
      if (c.ambiguousLegacyKey && pt.has(c.ambiguousLegacyKey)) {
        v.push(`${setId}: ambiguousLegacyKey '${c.ambiguousLegacyKey}' von ${cid} ist Schluessel von ${pt.get(c.ambiguousLegacyKey)}`);
      }
    }
  }
  return v;
}

export function assertRegistryInvariants(registry) {
  const v = registryViolations(registry);
  if (v.length) throw new RegistryInvariantError(v);
}

// --- Einfrieren ----------------------------------------------------------------------------

const missing = (prev = [], next = []) => {
  const have = new Set(next);
  return prev.filter((x) => !have.has(x));
};
const refStrings = (card) => (card?.tcgdex ?? []).map((r) => `${r.set}/${r.localId}`);
const SET_FIELDS = new Set(['pokemontcg', 'tcgdex', 'mergedSubsets', 'aliases']);
const CARD_FIELDS = new Set(['pokemontcg', 'tcgdex', 'keys', 'ambiguousLegacyKey']);

// Jeder alte Wert muss unveraendert vorhanden sein; Skalare duerfen nur null -> Wert wechseln,
// Listen nur wachsen. Danach muss `next` die Invarianten erfuellen (alte Schluessel eindeutig).
export function assertFrozen(previous, next) {
  if (!previous) return;
  const changes = [];
  const scalar = (label, field, a, b) => {
    if (a !== null && a !== undefined && a !== b) changes.push(`${label}: ${field} ${JSON.stringify(a)} -> ${JSON.stringify(b ?? null)}`);
  };
  const list = (label, field, a, b) => {
    const gone = missing(a, b);
    if (gone.length) changes.push(`${label}: ${field} entfernt: ${gone.join(', ')}`);
  };
  for (const [id, set] of Object.entries(previous.sets ?? {})) {
    const now = next.sets?.[id];
    const label = `Set ${id}`;
    if (!now) { changes.push(`${label} entfernt`); continue; }
    scalar(label, 'pokemontcg', set.pokemontcg, now.pokemontcg);
    scalar(label, 'tcgdex', set.tcgdex, now.tcgdex);
    list(label, 'mergedSubsets', set.mergedSubsets, now.mergedSubsets);
    list(label, 'aliases', set.aliases, now.aliases);
    for (const f of Object.keys(set)) {
      if (!SET_FIELDS.has(f) && JSON.stringify(set[f]) !== JSON.stringify(now[f])) changes.push(`${label}: ${f} geaendert`);
    }
  }
  for (const [setId, cards] of Object.entries(previous.cards ?? {})) {
    for (const [cardId, card] of Object.entries(cards)) {
      const now = next.cards?.[setId]?.[cardId];
      const label = `Karte ${setId}/${cardId}`;
      if (!now) { changes.push(`${label} entfernt`); continue; }
      scalar(label, 'pokemontcg', card.pokemontcg, now.pokemontcg);
      if ((card.ambiguousLegacyKey ?? null) !== (now.ambiguousLegacyKey ?? null)) {
        changes.push(`${label}: ambiguousLegacyKey ${card.ambiguousLegacyKey ?? null} -> ${now.ambiguousLegacyKey ?? null}`);
      }
      list(label, 'tcgdex', refStrings(card), refStrings(now));
      list(label, 'keys.pokemontcg', card.keys?.pokemontcg, now.keys?.pokemontcg);
      list(label, 'keys.tcgdex', card.keys?.tcgdex, now.keys?.tcgdex);
      for (const f of Object.keys(card)) {
        if (!CARD_FIELDS.has(f) && JSON.stringify(card[f]) !== JSON.stringify(now[f])) changes.push(`${label}: ${f} geaendert`);
      }
    }
  }
  if (changes.length) throw new RegistryFrozenError(changes);
  assertRegistryInvariants(next);
}

// Protokoll der additiven Aenderungen gegenueber previous (fuer Build-Ausgabe/Review).
export function registryChanges(previous, next) {
  const out = [];
  for (const [id, set] of Object.entries(next.sets ?? {})) {
    const old = previous?.sets?.[id];
    if (!old) { out.push(`Set ${id} neu`); continue; }
    for (const f of ['pokemontcg', 'tcgdex']) if (old[f] == null && set[f] != null) out.push(`Set ${id}: ${f} ${set[f]}`);
    for (const f of ['mergedSubsets', 'aliases']) {
      const added = missing(set[f], old[f]);
      if (added.length) out.push(`Set ${id}: ${f} + ${added.join(', ')}`);
    }
  }
  for (const [setId, cards] of Object.entries(next.cards ?? {})) {
    for (const [cardId, card] of Object.entries(cards)) {
      const old = previous?.cards?.[setId]?.[cardId];
      const label = `Karte ${setId}/${cardId}`;
      if (!old) { out.push(`${label} neu`); continue; }
      if (old.pokemontcg == null && card.pokemontcg != null) out.push(`${label}: pokemontcg ${card.pokemontcg}`);
      const refs = missing(refStrings(card), refStrings(old));
      if (refs.length) out.push(`${label}: tcgdex + ${refs.join(', ')}`);
      for (const ns of ['pokemontcg', 'tcgdex']) {
        const added = missing(card.keys?.[ns], old.keys?.[ns]);
        if (added.length) out.push(`${label}: keys.${ns} + ${added.join(', ')}`);
      }
    }
  }
  return out;
}

// --- Ableitung -----------------------------------------------------------------------------

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

// Variantengruppe (ecard2 50 -> 50a/50b): das alte Frontend fuehrte die TCGdex-Varianten als
// TCGdex-Union-Karten unter der pt-Set-ID (Referenz-DB: ecard2/50a, 50b, 74a, ...).
const variantKeys = (c) => (c.method === 'variantGroup' ? c.refs.map((r) => norm(r.localId)) : []);

// Fusion nur fuer Unterset-Merges und Overrides: eine TCGdex-Union-Karte mit gleichem Schluessel wie
// genau eine solche pt-Karte (ohne Referenz in diesem TCGdex-Set) wird deren zweite Referenz.
function fuse(candidates, mainPt, overrides) {
  for (const c of candidates) {
    c.base = c.ptId ? (overrideKey(overrides, c.ptId) ?? norm(c.ptNumber)) : norm(c.refs[0].localId);
  }
  const fusable = candidates.filter((c) => c.ptId && (c.ptSetId !== mainPt || overrideKey(overrides, c.ptId) !== null));
  const merged = new Set();
  for (const t of candidates.filter((c) => !c.ptId)) {
    const hits = fusable.filter((p) => p.base === t.base);
    if (hits.length !== 1) continue;
    const [p] = hits;
    if (p.refs.some((r) => r.setId === t.refs[0].setId)) continue;
    p.refs.push(t.refs[0]);
    merged.add(t);
  }
  return candidates.filter((c) => !merged.has(c));
}

// Kanonische IDs fuer neue Karten. `taken`: belegte pt-Namensraum-Schluessel eingefrorener Karten.
function assignIds(list, taken, setLabel) {
  const byBase = new Map();
  for (const c of list) {
    if (!byBase.has(c.base)) byBase.set(c.base, []);
    byBase.get(c.base).push(c);
  }
  const used = new Set(taken);
  for (const n of byBase.keys()) used.add(n);
  const firstLocal = (c) => [...c.refs, ...(c.ownedRefs ?? [])][0]?.localId;
  const pick = (c, n, unique) => {
    const s = c.ptId ? norm(ptSuffix(c.ptId, c.ptSetId)) : null;
    const local = firstLocal(c);
    const options = [
      unique(s) ? s : null,
      local !== undefined ? `${n}_${norm(local)}` : null,
      s && s !== n ? `${n}_${s}` : null,
    ].filter(Boolean);
    const id = options.find((o) => !used.has(o));
    if (!id) throw new Error(`Registry ${setLabel}: kein freier Schluessel fuer ${c.ptId ?? firstLocal(c)} (Nummer ${n})`);
    used.add(id);
    return id;
  };
  for (const [n, group] of byBase) {
    if (group.length === 1 && !taken.has(n)) {
      group[0].id = n;
      continue;
    }
    const suffixes = group.map((c) => (c.ptId ? norm(ptSuffix(c.ptId, c.ptSetId)) : null));
    const unique = (s) => s && s !== n && suffixes.filter((x) => x === s).length <= 1;
    for (const c of group) {
      // Mehrere neue Karten auf N: alter mehrdeutiger Schluessel. N schon eingefroren belegt: nur ausweichen.
      if (group.length > 1 && !taken.has(n)) c.ambiguousLegacyKey = n;
      c.id = pick(c, n, unique);
    }
  }
}

// Schluessel je Namensraum vergeben: eingefrorene bleiben, neue nur wenn frei und eindeutig.
function assignKeys(entries) {
  const ptOwner = new Map();
  const tdOwner = new Map();
  for (const e of entries) {
    ptOwner.set(e.id, e);
    for (const k of e.fixedPt) ptOwner.set(k, e);
    for (const k of e.fixedTd) tdOwner.set(k, e);
  }
  for (const e of entries) {
    const a = e.card.ambiguousLegacyKey;
    if (a && !ptOwner.has(a)) ptOwner.set(a, BLOCKED);
  }
  const claims = (ns) => {
    const m = new Map();
    for (const e of entries) for (const k of new Set(e[ns])) m.set(k, (m.get(k) ?? 0) + 1);
    return m;
  };
  const ptClaims = claims('addPt');
  const tdClaims = claims('addTd');
  for (const e of entries) {
    const keep = (owner, counts) => (k) => {
      const o = owner.get(k);
      return o === e || (o === undefined && counts.get(k) === 1);
    };
    const pt = e.addPt.filter(keep(ptOwner, ptClaims));
    const td = e.addTd.filter(keep(tdOwner, tdClaims));
    e.card.keys = {
      pokemontcg: uniqSorted([...e.fixedPt, ...pt]),
      tcgdex: uniqSorted([...e.fixedTd, ...td]),
    };
  }
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
    if (gid) {
      group(gid, () => ({})).extraTd.add(set.id);
    } else {
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

  // 3. Sets und Karten: eingefrorene Eintraege uebernehmen, additiv ergaenzen, Neues ableiten
  const tdCards = new Map(tcgdexSets.map((s) => [s.id, new Set((s.cards ?? []).map((c) => c.localId))]));
  const drift = [];
  const out = { sets: {}, cards: {} };
  for (const id of [...new Set([...Object.keys(previous?.sets ?? {}), ...groups.keys()])].sort(cmp)) {
    const g = groups.get(id);
    const prevSet = previous?.sets?.[id];
    const prevCards = previous?.cards?.[id] ?? {};

    const fresh = { pokemontcg: g?.pokemontcg ?? null, tcgdex: g?.tcgdex ?? null, mergedSubsets: [], aliases: [] };
    if (g) {
      const aliases = new Set();
      if (g.pokemontcg) aliases.add(g.pokemontcg);
      if (g.tcgdex) aliases.add(`${TD_PREFIX}${g.tcgdex}`);
      for (const s of g.subsets) {
        aliases.add(s.pt);
        if (s.td) aliases.add(`${TD_PREFIX}${s.td}`);
      }
      for (const t of g.extraTd) aliases.add(`${TD_PREFIX}${t}`);
      fresh.mergedSubsets = g.subsets.map((s) => s.pt);
      fresh.aliases = [...aliases];
    }
    const set = prevSet ? structuredClone(prevSet) : {};
    set.pokemontcg = set.pokemontcg ?? fresh.pokemontcg;
    set.tcgdex = set.tcgdex ?? fresh.tcgdex;
    // Abweichender Skalar (eingefroren != frisch): eingefrorener Wert bleibt, frischer wird Alias.
    if (prevSet?.pokemontcg && fresh.pokemontcg && fresh.pokemontcg !== prevSet.pokemontcg) fresh.aliases.push(fresh.pokemontcg);
    set.mergedSubsets = uniqSorted([...(set.mergedSubsets ?? []), ...fresh.mergedSubsets]);
    set.aliases = uniqSorted([...(set.aliases ?? []), ...fresh.aliases]).filter((a) => a !== id);
    out.sets[id] = set;

    // Abweichung: eingefrorene Referenz existiert in TCGdex nicht mehr
    for (const [cardId, card] of Object.entries(prevCards)) {
      for (const r of card.tcgdex ?? []) {
        if (!tdCards.get(r.set)?.has(r.localId)) drift.push(`Karte ${id}/${cardId}: TCGdex-Referenz ${r.set}/${r.localId} existiert nicht mehr`);
      }
    }

    const entries = Object.entries(prevCards).map(([cid, card]) => ({
      id: cid, frozen: true, card: structuredClone(card),
      fixedPt: new Set(card.keys?.pokemontcg ?? []), fixedTd: new Set(card.keys?.tcgdex ?? []), addPt: [], addTd: [],
    }));
    const byPtId = new Map();
    const byRef = new Map();
    for (const e of entries) {
      if (e.card.pokemontcg) byPtId.set(e.card.pokemontcg, e);
      for (const r of e.card.tcgdex ?? []) byRef.set(refKey(r.set, r.localId), e);
    }
    const newCands = [];
    for (const c of g ? fuse(g.candidates, g.pokemontcg, canonicalKeyOverrides) : []) {
      const owned = c.refs.filter((r) => byRef.has(refKey(r.setId, r.localId)));
      const newRefs = c.refs.filter((r) => !byRef.has(refKey(r.setId, r.localId)));
      let target = c.ptId ? byPtId.get(c.ptId) : undefined;
      if (!target && owned.length) {
        const owners = [...new Set(owned.map((r) => byRef.get(refKey(r.setId, r.localId))))];
        if (!c.ptId) target = owners[0];
        else if (owners.length === 1 && owners[0].card.pokemontcg == null) {
          // TCGdex-zuerst eingefrorene Karte bekommt ihr pokemontcg-Gegenstueck (null -> Wert).
          [target] = owners;
          target.card.pokemontcg = c.ptId;
          byPtId.set(c.ptId, target);
          target.addPt.push(norm(c.ptNumber));
        }
      }
      if (target) {
        for (const r of newRefs) {
          target.card.tcgdex.push({ set: r.setId, localId: r.localId });
          byRef.set(refKey(r.setId, r.localId), target);
          target.addTd.push(norm(r.localId));
        }
        if (c.ptId && target.card.pokemontcg === c.ptId) target.addPt.push(...variantKeys(c));
        continue;
      }
      newCands.push({ ...c, refs: newRefs, ownedRefs: owned });
    }
    const taken = new Set();
    for (const e of entries) {
      taken.add(e.id);
      for (const k of e.fixedPt) taken.add(k);
      if (e.card.ambiguousLegacyKey) taken.add(e.card.ambiguousLegacyKey);
    }
    assignIds(newCands, taken, id);
    for (const c of newCands) {
      const card = { pokemontcg: c.ptId ?? null, tcgdex: c.refs.map((r) => ({ set: r.setId, localId: r.localId })), keys: null };
      if (c.ambiguousLegacyKey) card.ambiguousLegacyKey = c.ambiguousLegacyKey;
      const addPt = c.ptId ? [norm(c.ptNumber), ...variantKeys(c)] : [c.id];
      entries.push({
        id: c.id, frozen: false, card, fixedPt: new Set(), fixedTd: new Set(),
        addPt, addTd: c.refs.map((r) => norm(r.localId)),
      });
    }
    assignKeys(entries);
    out.cards[id] = {};
    for (const e of [...entries].sort((a, b) => cmp(a.id, b.id))) out.cards[id][e.id] = e.card;
  }
  if (drift.length) throw new RegistryFrozenError(drift);

  // Nichts still verlieren: jede Eingabe-Karte genau einmal referenziert.
  const lost = [];
  const ptCount = new Map();
  const refCount = new Map();
  for (const cards of Object.values(out.cards)) {
    for (const c of Object.values(cards)) {
      if (c.pokemontcg) ptCount.set(c.pokemontcg, (ptCount.get(c.pokemontcg) ?? 0) + 1);
      for (const r of c.tcgdex) refCount.set(refKey(r.set, r.localId), (refCount.get(refKey(r.set, r.localId)) ?? 0) + 1);
    }
  }
  for (const s of ptSets) {
    for (const c of ptCardsBySet.get(s.id) ?? []) {
      if (ptCount.get(c.id) !== 1) lost.push(`pokemontcg-Karte ${c.id} ${ptCount.get(c.id) ?? 0}x in der Registry`);
    }
  }
  for (const s of tcgdexSets) {
    for (const c of s.cards ?? []) {
      const n = refCount.get(refKey(s.id, c.localId));
      if (n !== 1) lost.push(`TCGdex-Karte ${s.id}/${c.localId} ${n ?? 0}x in der Registry`);
    }
  }
  if (lost.length) throw new RegistryInvariantError(lost);
  assertRegistryInvariants(out);
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
    const find = (eq) => Object.entries(cards).filter(([, c]) => (c.tcgdex ?? []).some((r) => r.set === entry.td
      && eq(norm(r.localId), key) && (c.keys?.tcgdex ?? []).includes(norm(r.localId))));
    let hits = find((a, b) => a === b);
    if (!hits.length) hits = find((a, b) => a.toLowerCase() === b.toLowerCase());
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
