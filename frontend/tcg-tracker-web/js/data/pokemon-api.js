// Karten- und Setdaten ausschliesslich aus api/v3 (+ api/registry fuer Set-Aliase).
// Keine Laufzeit-Aufrufe an pokemontcg.io oder TCGdex; kein Laufzeit-Merging.
//
// Cardmarket: v3-Karten tragen die Produkt-ID (variants[].cardmarketId bzw. ids.cardmarket);
// toCardRecord baut daraus vera_cardmarket_url. Das fruehere heuristische Nach-Matching
// (promoteCardmarketUrlsForCards) entfaellt hier: es haette die massgeblichen v3-IDs nur
// ueberschrieben (Produkt-URLs gelten dort als "generiert") und vergibt fuer Karten ohne URL
// keine neue.
import { resolveDisplayCard, resolveDisplaySet } from './schema-contract.js';
import { loadV3Sets, loadV3Cards, loadRegistrySets } from './v3-api.js';
import { createCollectionKeyResolver } from './v3-collection-keys.js';
import { toSetRecord, toCardRecord } from './v3-records.js';

export const V3_UNREACHABLE_MESSAGE = 'Kartendaten (api/v3) nicht erreichbar';

function isAbortError(err) {
  return err?.name === 'AbortError';
}

// HTTP-/Netzwerkfehler von api/v3 -> eine verstaendliche Meldung; Abbrueche bleiben Abbrueche.
async function v3(promise) {
  try {
    return await promise;
  } catch (err) {
    if (isAbortError(err)) throw err;
    const wrapped = new Error(V3_UNREACHABLE_MESSAGE, { cause: err });
    wrapped.code = 'V3_UNREACHABLE';
    throw wrapped;
  }
}

const naturalCompare = (a, b) => String(a ?? '').localeCompare(String(b ?? ''), undefined, { numeric: true, sensitivity: 'base' });

function compareCards(a, b) {
  return naturalCompare(a.number, b.number) || naturalCompare(a.collectionKey, b.collectionKey);
}

function compareSets(a, b) {
  const aIsTcgdexOnly = String(a.setId).startsWith('TCGDEX-');
  const bIsTcgdexOnly = String(b.setId).startsWith('TCGDEX-');
  if (aIsTcgdexOnly !== bIsTcgdexOnly) return aIsTcgdexOnly ? 1 : -1;
  const dateA = new Date(a.releaseDate || 0).getTime() || 0;
  const dateB = new Date(b.releaseDate || 0).getTime() || 0;
  if (dateA !== dateB) return dateB - dateA;
  return naturalCompare(a.setName, b.setName);
}

// ── Öffentliche API ────────────────────────────────────────────────

/**
 * Karten eines Sets als Display-Karten (siehe fetchMergedCardsWithSetMeta).
 * @param {string} setId  kanonische Set-ID oder ein Alias (z. B. "TCGDEX-me05")
 */
export async function fetchMergedCards(setId, { signal } = {}) {
  const payload = await fetchMergedCardsWithSetMeta(setId, { signal });
  return payload.cards;
}

/**
 * Lädt Karten plus Set-Metadaten-Patch aus api/v3.
 * `setId` darf ein Alias sein; er wird über die Registry auf die kanonische Set-ID abgebildet.
 * Jede Karte trägt zusätzlich `collectionKey` (v3 cardId), `cardId` (v3 id), `number`, `i18n_de`.
 * Sortierung: natürlich nach `number`, bei Gleichstand nach `collectionKey`.
 *
 * Fehler: api/v3 nicht erreichbar -> Error(V3_UNREACHABLE_MESSAGE, code 'V3_UNREACHABLE');
 * unbekannte Set-ID -> code 'V3_SET_UNKNOWN'.
 */
export async function fetchMergedCardsWithSetMeta(setId, { signal } = {}) {
  const [registrySets, v3Sets] = await v3(Promise.all([
    loadRegistrySets({ signal }),
    loadV3Sets({ signal })
  ]));

  const canonicalId = createCollectionKeyResolver(registrySets, new Map()).resolveSetKey(setId);
  const v3Set = canonicalId ? (v3Sets || []).find((set) => set?.id === canonicalId) : null;
  if (!v3Set) {
    const err = new Error(`Set '${setId}' ist in api/v3 nicht vorhanden`);
    err.code = 'V3_SET_UNKNOWN';
    throw err;
  }

  const v3Cards = await v3(loadV3Cards(canonicalId, { signal }));
  const cards = (Array.isArray(v3Cards) ? v3Cards : Object.values(v3Cards || {}))
    .map((card) => resolveDisplayCard(toCardRecord(card, v3Set)))
    .sort(compareCards);

  const setMetaPatch = resolveDisplaySet(toSetRecord(v3Set, { imported: false }));
  return { cards, setMetaPatch };
}

/**
 * Alle Sets aus api/v3 für das Dashboard-Overview.
 * Sets, die Alias eines anderen Sets sind, erscheinen nicht. Jedes Set trägt `aliases`.
 * Sortierung: TCGdex-only zuletzt, sonst Erscheinungsdatum absteigend, dann Name.
 */
export async function fetchAllAvailableSets({ signal } = {}) {
  const v3Sets = (await v3(loadV3Sets({ signal }))) || [];

  const aliasIds = new Set();
  for (const set of v3Sets) {
    for (const alias of set?.aliases || []) {
      if (alias && alias !== set.id) aliasIds.add(String(alias).toLowerCase());
    }
  }

  return v3Sets
    .filter((set) => set?.id && !aliasIds.has(String(set.id).toLowerCase()))
    .map((set) => ({
      ...resolveDisplaySet(toSetRecord(set)),
      aliases: [...(set.aliases || [])]
    }))
    .sort(compareSets);
}

/**
 * Map setId -> deutsche Serie (i18n.de.series) aus api/v3, fuer Sheet-Zeilen ohne tcgdex_serie_name.
 * Fehler (api/v3 offline) liefern eine leere Map; das Dashboard faellt dann auf vera_series zurueck.
 */
export async function fetchDeSeriesBySetId({ signal } = {}) {
  const map = new Map();
  try {
    for (const set of (await loadV3Sets({ signal })) || []) {
      const de = String(set?.i18n?.de?.series || '').trim();
      if (set?.id && de) map.set(String(set.id), de);
    }
  } catch {
    // offline: leere Map
  }
  return map;
}
