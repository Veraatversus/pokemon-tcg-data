// Overview-/db_sets-Zeilen auf kanonische Sets abbilden (Spec §5.2, §7.1; Plan Task 6).
// Reine Logik: der Resolver (createCollectionKeyResolver, nur Registry-Sets noetig) wird hereingereicht.
//
// - Zeilen, deren Set-ID ein Alias ist (z. B. `swsh12pt5gg`, `TCGDEX-me05`), erscheinen nicht als eigenes Set.
//   Ihr `imported` wird per ODER auf das kanonische Set uebertragen. Fehlt die kanonische Zeile, wird die
//   Alias-Zeile unter der kanonischen Set-ID gefuehrt (kein Set geht verloren).
// - Jedes bekannte Set traegt `aliases` (Registry-Aliase ohne die eigene ID) fuer den Legacy-Import-Abgleich.
// - Im Sheet wird nichts geaendert oder geloescht; das passiert nur in der Anzeige.

const lower = (value) => String(value ?? '').trim().toLowerCase();

/**
 * @param {Array<object>} sets Zeilen aus listSetsOverviewData (je { setId, setName, imported, ... })
 * @param {{ resolveSetKey: Function, aliasesOf?: Function } | null} resolver
 * @returns {Array<object>} neue Liste (Reihenfolge der ersten Fundstelle je kanonischem Set)
 */
export function mergeAliasOverviewSets(sets, resolver) {
  const list = Array.isArray(sets) ? sets : [];
  if (!resolver?.resolveSetKey) return list.map((set) => ({ ...set }));

  const canonicalOf = (set) => {
    const id = String(set?.setId ?? '').trim();
    if (!id) return { id, canonical: id };
    let canonical = null;
    try {
      canonical = resolver.resolveSetKey(id);
    } catch {
      canonical = null;
    }
    return { id, canonical: canonical || id };
  };

  const byCanonical = new Map(); // lower(canonical) -> merged set
  const order = [];
  const pendingAliases = [];

  for (const set of list) {
    const { id, canonical } = canonicalOf(set);
    if (id && lower(id) !== lower(canonical)) {
      pendingAliases.push({ set, canonical });
      continue;
    }
    const key = lower(canonical) || `#${order.length}`;
    if (byCanonical.has(key)) {
      // Doppelte kanonische Zeile: Status zusammenfuehren, erste Zeile bleibt fuehrend.
      const current = byCanonical.get(key);
      current.imported = Boolean(current.imported) || Boolean(set?.imported);
      continue;
    }
    byCanonical.set(key, { ...set });
    order.push(key);
  }

  for (const { set, canonical } of pendingAliases) {
    const key = lower(canonical);
    const current = byCanonical.get(key);
    if (current) {
      current.imported = Boolean(current.imported) || Boolean(set?.imported);
      current.mergedAliasIds = [...(current.mergedAliasIds || []), set.setId];
      continue;
    }
    byCanonical.set(key, { ...set, setId: canonical, imported: Boolean(set?.imported), mergedAliasIds: [set.setId] });
    order.push(key);
  }

  return order.map((key) => {
    const set = byCanonical.get(key);
    let aliases = [];
    try {
      aliases = (resolver.aliasesOf?.(set.setId) || []).filter((alias) => lower(alias) !== lower(set.setId));
    } catch {
      aliases = [];
    }
    if (aliases.length || !Array.isArray(set.aliases)) set.aliases = aliases;
    return set;
  });
}
