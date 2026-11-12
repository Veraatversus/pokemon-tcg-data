// Alte Kartenschluessel (v1-Backups, Legacy-Import) im Namensraum ihres QUELL-Sets aufloesen (Spec §5.2/§7.1).
// Reine Logik ohne gapi/DOM; der Resolver kommt aus ensureResolverForSet(liveSetId) (Karten des Live-Sets geladen).
//
// Regeln (Goldene Regel: nie eine Sammlungszeile verlieren oder falsch zuordnen):
// - Ein Schluessel wird nur ueber resolver.resolve(sourceSetKey, rawCardId) einer Karte zugeordnet.
// - Mehrdeutig (§5.3) oder nicht aufloesbar -> uebersprungen und gezaehlt; nie Fallback auf den rohen Schluessel.
// - Der Quell-Namensraum muss auf das Live-Set aufloesen (kein Schreiben in ein fremdes Set).
import { normalizeSetId } from '../../core/set-id-helpers.js';

const lower = (value) => String(value ?? '').trim().toLowerCase();
const normalizeSetIdForMatch = (setId) => normalizeSetId(String(setId || '').replace(/^TCGDEX-/i, ''));

/**
 * Set-Schluessel, in dessen Namensraum die Quellnummern gelten.
 * - Leere Quelle (z. B. Legacy-Blatt per Name erkannt) -> das kanonische Live-Set.
 * - Quelle bekannt (ID oder Alias) -> die Quelle selbst, wenn sie auf das Live-Set aufloest, sonst null.
 * - Quelle unbekannt -> eindeutiger Alias des Live-Sets mit gleicher normalisierter ID, sonst null.
 * @returns {string|null}
 */
export function pickSourceSetKey(resolver, { sourceSetId = '', liveSetId = '' } = {}) {
  const live = resolver?.resolveSetKey?.(liveSetId) || '';
  if (!live) return null;
  const raw = String(sourceSetId ?? '').trim();
  if (!raw) return live;
  const direct = resolver.resolveSetKey(raw);
  if (direct) return lower(direct) === lower(live) ? raw : null;
  const wanted = normalizeSetIdForMatch(raw);
  if (!wanted) return null;
  const candidates = [...new Set([live, ...(resolver.aliasesOf?.(live) || [])])]
    .filter((key) => normalizeSetIdForMatch(key) === wanted);
  return candidates.length === 1 ? candidates[0] : null;
}

/**
 * Einen Quellschluessel aufloesen.
 * @returns {{ collectionKey: string } | { skip: 'ambiguous', collectionKeys: string[] } | { skip: 'unresolved' }}
 */
export function resolveSourceCardKey(resolver, sourceSetKey, rawCardId) {
  const raw = String(rawCardId ?? '').trim();
  if (!sourceSetKey || !raw) return { skip: 'unresolved' };
  const hit = resolver.resolve(sourceSetKey, raw);
  if (hit?.collectionKey) return { collectionKey: hit.collectionKey };
  const amb = resolver.ambiguous(sourceSetKey, raw);
  if (amb?.collectionKeys?.length) return { skip: 'ambiguous', collectionKeys: [...amb.collectionKeys] };
  return { skip: 'unresolved' };
}

const mergeState = (previous, next) => {
  if (!previous) return next;
  const g = previous.g || next.g;
  return { g, rh: g && (previous.rh || next.rh) };
};

/**
 * Snapshot eines Live-Sets aus seinen Backup-Sets (mehrere Backup-Sets je Live-Set werden per ODER vereinigt).
 * - Backup-Version >= 2 und Backup-Set-ID == Live-Set-ID: Schluessel sind bereits collectionKeys.
 * - Sonst (Version 1 oder Alias-Set-ID wie `TCGDEX-30th-c`): Aufloesung im Namensraum der Backup-Set-ID.
 * @param {Array<{ setId: string, cards?: Array<{ cardId, g, rh }> }>} backupSets
 * @returns {{ snapshot: Map<string,{g:boolean,rh:boolean}>, protectedKeys: Set<string>, unresolved: number, ambiguous: number }}
 *   protectedKeys: Kandidaten mehrdeutiger Schluessel – der Restore laesst sie unveraendert.
 */
export function buildBackupRestoreSnapshot(backupSets, { liveSetId, version = 1, resolver } = {}) {
  const snapshot = new Map();
  const protectedKeys = new Set();
  let unresolved = 0;
  let ambiguous = 0;
  for (const backupSet of (Array.isArray(backupSets) ? backupSets : [])) {
    const backupSetId = String(backupSet?.setId ?? '').trim();
    const direct = Number(version) >= 2 && lower(backupSetId) === lower(liveSetId);
    const sourceKey = direct ? null : pickSourceSetKey(resolver, { sourceSetId: backupSetId, liveSetId });
    for (const entry of (Array.isArray(backupSet?.cards) ? backupSet.cards : [])) {
      const raw = String(entry?.cardId ?? '').trim();
      if (!raw) continue;
      const state = { g: Boolean(entry.g), rh: Boolean(entry.g && entry.rh) };
      let key = raw;
      if (!direct) {
        const resolved = resolveSourceCardKey(resolver, sourceKey, raw);
        if (resolved.skip === 'ambiguous') {
          ambiguous++;
          resolved.collectionKeys.forEach((candidate) => protectedKeys.add(candidate));
          continue;
        }
        if (resolved.skip) {
          unresolved++;
          continue;
        }
        key = resolved.collectionKey;
      }
      snapshot.set(key, mergeState(snapshot.get(key), state));
    }
  }
  return { snapshot, protectedKeys, unresolved, ambiguous };
}

/**
 * Zieluebergaenge fuer die Live-Map. Nur Eintraege mit Zellen; protectedKeys ohne eigenen Backup-Eintrag bleiben
 * unveraendert (mit eigenem Eintrag werden nur Haken gesetzt).
 * `allowUncheck=false` (z. B. wenn Schluessel nicht aufloesbar waren): nur Haken setzen, nie entfernen –
 * ein nicht zuordenbarer Backup-Schluessel koennte genau diese Karte meinen.
 * @returns {Array<{ key: string, entry: object, target: { g: boolean, rh: boolean } }>}
 */
export function planBackupRestore(liveMap, { snapshot, protectedKeys = new Set(), allowUncheck = true, hasCells } = {}) {
  const plan = [];
  for (const [key, entry] of (liveMap instanceof Map ? liveMap.entries() : [])) {
    if (typeof hasCells === 'function' && !hasCells(entry)) continue;
    const explicit = snapshot?.get(key);
    // Kandidat eines mehrdeutigen Schluessels: ohne eigenen Backup-Eintrag unveraendert, mit eigenem nur Haken setzen.
    const isProtected = protectedKeys.has(key);
    if (isProtected && !explicit) continue;
    const wanted = explicit || { g: false, rh: false };
    let target = { g: Boolean(wanted.g), rh: Boolean(wanted.g && wanted.rh) };
    if (!allowUncheck || isProtected) {
      const g = target.g || Boolean(entry?.g);
      target = { g, rh: g && (target.rh || Boolean(entry?.rh)) };
    }
    if (Boolean(entry?.g) === target.g && Boolean(entry?.rh) === target.rh) continue;
    plan.push({ key, entry, target });
  }
  return plan;
}
