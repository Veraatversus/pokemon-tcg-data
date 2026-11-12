// Vorauswahl der zu ladenden Sets fuer die Suche ueber api/v3/search-index.json (~2,9 MB, einmal je Session)
// statt jede api/v3/cards/<set>.json (~53 MB gesamt) zu laden.
//
// Der Index kennt je Karte nur setId, cardId, number, name, nameDe. Daraus folgt:
// - Name-/Nummern-Treffer (freie Suche, "57 Digda") werden ueber den Index erkannt.
// - Treffer ueber Set-Felder (Set-Name, Kuerzel, Serie, Set-ID) werden ueber die Set-Metadaten erkannt.
// - Felder ausserhalb des Index (Seltenheit, Typen, KP, Kuenstler, Regeln/Attacken-Text, Flavor) kann die
//   Vorauswahl nicht pruefen. Findet sie gar nichts, liefert sie null -> Aufrufer scannt wie bisher alle Sets.
// - Strukturierte Suchen ("SET 12") betreffen genau ein Set und laufen ohne Vorauswahl.
import { loadV3SearchIndex } from '../../data/v3-api.js';

const lower = (value) => String(value ?? '').trim().toLowerCase();

/** Index-Eintrag im Format einer Display-Karte (fuer die bestehende Trefferlogik). */
export function indexEntryToCard(entry) {
  return {
    setId: entry?.setId,
    collectionKey: entry?.cardId,
    number: entry?.number,
    name: entry?.name,
    vera_name: entry?.name,
    tcgdex_name: entry?.nameDe || ''
  };
}

/**
 * @param {{ sets: object[], matchCard: (card) => boolean, matchSet?: (set) => boolean, loadIndex?: Function, signal?: AbortSignal }} opts
 * @returns {Promise<object[]|null>} Teilmenge von `sets` (Reihenfolge bleibt) oder null (=> alle Sets scannen)
 */
export async function selectSearchSets({ sets, matchCard, matchSet = () => false, loadIndex = loadV3SearchIndex, signal } = {}) {
  const list = Array.isArray(sets) ? sets : [];
  if (!list.length || typeof matchCard !== 'function') return null;
  const index = await loadIndex({ signal });
  if (!Array.isArray(index)) return null;

  const scope = new Set(list.map((set) => lower(set?.setId)).filter(Boolean));
  const hitSets = new Set();
  for (const entry of index) {
    const setKey = lower(entry?.setId);
    if (!scope.has(setKey) || hitSets.has(setKey)) continue;
    if (matchCard(indexEntryToCard(entry))) hitSets.add(setKey);
  }
  for (const set of list) {
    const setKey = lower(set?.setId);
    if (!hitSets.has(setKey) && matchSet(set)) hitSets.add(setKey);
  }
  if (!hitSets.size) return null;
  return list.filter((set) => hitSets.has(lower(set?.setId)));
}
