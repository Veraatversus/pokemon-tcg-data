// Verschwundene TCGdex-Referenzen der eingefrorenen Registry automatisch behandeln, bevor buildRegistry sie als
// Drift meldet (README "Registry-Drift beheben"). Nur eindeutige Faelle; alles andere bleibt Drift (manuell):
// - TCGdex hat die Karte geloescht, im Set taucht keine gleichnamige unbelegte Karte auf
//     -> Verweis entfernen; ohne weitere Quelle (kein pokemontcg, keine andere TCGdex-Referenz) gilt die Karte
//        als stillgelegt (tcgdex []). Schluessel bleiben reserviert, die Karte fehlt in api/v3.
// - Genau eine unbelegte Karte gleichen Namens im selben TCGdex-Set (umnummeriert)
//     -> Verweis umhaengen, neue localId zusaetzlich als Schluessel (alte Schluessel bleiben).
// Manuell bleiben: TCGdex-Set ganz verschwunden (Set umbenannt), mehrere gleichnamige Kandidaten, ein Kandidat
// fuer mehrere verschwundene Karten, und mehr als MAX_VANISHED_PER_SET verschwundene Karten in einem Set.
import { normalizeCardNumber } from '../lib/card-key.mjs';

export const MAX_VANISHED_PER_SET = 5;

const refKey = (set, localId) => `${set}/${localId}`;
const normName = (s) => String(s ?? '').trim().toLowerCase();

/**
 * @param {object} p
 * @param {object|null} p.previous eingefrorene Registry ({ sets, cards })
 * @param {Array<{id, cards: Array<{localId, name}>}>} p.tcgdexSets aktueller TCGdex-Spiegel
 * @param {Map<string,string>} p.previousNames "<setId>/<cardId>" -> Kartenname aus dem zuletzt veroeffentlichten api/v3
 * @returns {{ registry: object|null, changes: object[], unresolved: string[] }} registry ist eine angepasste Kopie
 */
export function resolveVanishedRefs({ previous, tcgdexSets, previousNames = new Map() }) {
  if (!previous) return { registry: null, changes: [], unresolved: [] };
  const registry = structuredClone(previous);
  const td = new Map((tcgdexSets ?? []).map((s) => [s.id, new Map((s.cards ?? []).map((c) => [c.localId, c]))]));
  const referenced = new Set();
  for (const cards of Object.values(registry.cards ?? {})) {
    for (const card of Object.values(cards)) for (const r of card.tcgdex ?? []) referenced.add(refKey(r.set, r.localId));
  }

  // Verschwundene Referenzen sammeln: { setId, cardId, card, ref }
  const vanished = [];
  for (const [setId, cards] of Object.entries(registry.cards ?? {})) {
    for (const [cardId, card] of Object.entries(cards)) {
      for (const ref of card.tcgdex ?? []) {
        if (!td.get(ref.set)?.has(ref.localId)) vanished.push({ setId, cardId, card, ref });
      }
    }
  }
  const perSet = new Map();
  for (const v of vanished) perSet.set(v.ref.set, (perSet.get(v.ref.set) ?? 0) + 1);

  // Kandidaten je verschwundener Referenz; ein Kandidat darf nur einer Referenz zugeordnet werden.
  const plans = vanished.map((v) => {
    const label = `${v.setId}/${v.cardId}: ${refKey(v.ref.set, v.ref.localId)}`;
    const setCards = td.get(v.ref.set);
    if (!setCards) return { ...v, label, verdict: 'manual', reason: 'TCGdex-Set fehlt' };
    if ((perSet.get(v.ref.set) ?? 0) > MAX_VANISHED_PER_SET) return { ...v, label, verdict: 'manual', reason: 'zu viele im Set' };
    const name = previousNames.get(`${v.setId}/${v.cardId}`);
    const candidates = name
      ? [...setCards.values()].filter((c) => !referenced.has(refKey(v.ref.set, c.localId)) && normName(c.name?.en) === normName(name))
      : [];
    if (candidates.length > 1) {
      return { ...v, label, verdict: 'manual', reason: `mehrdeutig: ${candidates.map((c) => refKey(v.ref.set, c.localId)).join(', ')}` };
    }
    return { ...v, label, name, verdict: candidates.length ? 'repoint' : 'remove', target: candidates[0]?.localId };
  });
  const claims = new Map();
  const claimKey = (p) => refKey(p.ref.set, p.target);
  for (const p of plans) if (p.verdict === 'repoint') claims.set(claimKey(p), (claims.get(claimKey(p)) ?? 0) + 1);
  for (const p of plans) {
    if (p.verdict === 'repoint' && claims.get(claimKey(p)) > 1) Object.assign(p, { verdict: 'manual', reason: 'Kandidat mehrfach beansprucht' });
  }

  const changes = [];
  const unresolved = [];
  for (const p of plans) {
    const from = refKey(p.ref.set, p.ref.localId);
    if (p.verdict === 'manual') { unresolved.push(`${p.label} (${p.reason})`); continue; }
    if (p.verdict === 'repoint') {
      p.ref.localId = p.target;
      const keys = (p.card.keys ??= {});
      keys.tcgdex = [...new Set([...(keys.tcgdex ?? []), normalizeCardNumber(p.target)])];
      changes.push({ kind: 'repointed', card: `${p.setId}/${p.cardId}`, ref: from, to: refKey(p.ref.set, p.target), ...(p.name ? { name: p.name } : {}) });
      continue;
    }
    p.card.tcgdex = (p.card.tcgdex ?? []).filter((r) => r !== p.ref);
    const retired = p.card.pokemontcg == null && p.card.tcgdex.length === 0;
    changes.push({ kind: retired ? 'retired' : 'ref-removed', card: `${p.setId}/${p.cardId}`, ref: from, ...(p.name ? { name: p.name } : {}) });
  }
  return { registry, changes, unresolved };
}
