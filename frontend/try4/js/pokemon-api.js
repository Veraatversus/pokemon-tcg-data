import { CONFIG } from './config.js';
import { normalizeCardNumber, naturalSort } from './utils.js';

// ── Interne Hilfsfunktionen ──────────────────────────────────────

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`API Fehler ${response.status}: ${url}`);
  return response.json();
}

/**
 * Vera-API: lädt Karten aus dem GitHub-Pages-Repository.
 * Gibt null zurück wenn das Set dort nicht vorhanden ist.
 */
async function fetchVeraCards(setId) {
  try {
    const url = `${CONFIG.APIS.VERA_BASE}/cards/${CONFIG.VERA_API_LANGUAGE}/${encodeURIComponent(setId)}.json`;
    return await fetchJson(url);
  } catch {
    return null;
  }
}

/** Pokemontcg.io: lädt alle Karten eines Sets (paginiert). */
async function fetchPokemontcgCards(setId) {
  let page = 1;
  const pageSize = 250;
  const all = [];
  while (true) {
    const url = `${CONFIG.APIS.POKEMONTCG}/cards?q=set.id:${encodeURIComponent(setId)}&page=${page}&pageSize=${pageSize}`;
    const data = await fetchJson(url);
    const cards = data?.data || [];
    if (!cards.length) break;
    all.push(...cards);
    page += 1;
  }
  return all;
}

/** TCGDex DE: lädt Set-Daten mit allen Karten. Gibt null bei 404/Netzwerkfehler. */
async function fetchTcgdexSet(tcgdexId) {
  try {
    return await fetchJson(`${CONFIG.APIS.TCGDEX_DE}/sets/${encodeURIComponent(tcgdexId)}`);
  } catch {
    return null;
  }
}

/**
 * Gibt die TCGDex-ID zu einer pokemontcg.io-ID zurück.
 * Fällt auf die originale ID zurück wenn kein Mapping existiert.
 */
function toTcgdexId(pokemontcgId) {
  return CONFIG.CUSTOM_SET_ID_MAPPINGS[pokemontcgId] ?? pokemontcgId;
}

/**
 * Gibt die beste Bild-URL für eine TCGDex-Karte zurück.
 * Priorität: TCGDex .image → Pokemontcg.io CDN-URL
 */
function tcgdexImageOrFallback(pokemontcgSetId, tcgdexCard) {
  if (tcgdexCard?.image) return `${tcgdexCard.image}/low.jpg`;
  const cardNo = normalizeCardNumber(tcgdexCard?.localId || tcgdexCard?.id || '');
  if (!cardNo) return null;
  return `https://images.pokemontcg.io/${pokemontcgSetId}/${cardNo}.png`;
}

// ── Öffentliche API ────────────────────────────────────────────────

/**
 * Lädt und merged alle Kartendaten für ein Set.
 *
 * Für normale Sets (ID hat kein "TCGDEX-"-Präfix):
 *   1. Vera-API (schnell, gecachtes GitHub-Pages-JSON) oder pokemontcg.io als Fallback
 *   2. TCGDex DE für deutsche Namen und HD-Bilder
 *   3. TCGDex-only Karten werden als Union anhängt (neue DE-Karten die ptcg nicht hat)
 *
 * Für TCGDex-only Sets (ID beginnt mit "TCGDEX-"):
 *   Nur TCGDex, kein pokemontcg.io
 *
 * @param {string} setId  pokemontcg.io-Set-ID oder "TCGDEX-{tcgdexId}"
 * @returns {Promise<Array<{number, name, image, cardmarketUrl}>>}
 */
export async function fetchMergedCards(setId) {
  // ─ TCGDex-Only-Set ───────────────────────────────────────────
  if (setId.startsWith('TCGDEX-')) {
    const tcgdexId = setId.slice('TCGDEX-'.length);
    const tcgdexSet = await fetchTcgdexSet(tcgdexId);
    if (!tcgdexSet?.cards) return [];

    return naturalSort(
      tcgdexSet.cards.map((card) => ({
        number: normalizeCardNumber(card.localId || card.id),
        name: card.name,
        image: tcgdexImageOrFallback(tcgdexId, card),
        cardmarketUrl: card.links?.cardmarket || null
      })),
      'number'
    );
  }

  // ─ Regulares Set: Vera-API oder pokemontcg.io + TCGDex-Merge ───
  const tcgdexId = toTcgdexId(setId);

  // Beide Quellen parallel laden
  const [veraCards, ptcgCards, tcgdexSet] = await Promise.all([
    CONFIG.USE_VERA_API ? fetchVeraCards(setId) : Promise.resolve(null),
    CONFIG.USE_VERA_API ? Promise.resolve(null) : fetchPokemontcgCards(setId),
    fetchTcgdexSet(tcgdexId)
  ]);

  // Falls Vera-API erfolgreich war, keine pokemontcg.io-Anfrage nötig
  // Falls nicht, pokemontcg.io-Fallback (lazy-load)
  let sourcePtcgCards;
  if (veraCards && Array.isArray(veraCards)) {
    sourcePtcgCards = veraCards;
  } else {
    // Vera-API fehlgeschlagen oder deaktiviert: pokemontcg.io
    sourcePtcgCards = ptcgCards ?? (await fetchPokemontcgCards(setId));
  }

  // TCGDex-Map nach normalisierter localId aufbauen
  const tcgdexMap = new Map();
  (tcgdexSet?.cards || []).forEach((card) => {
    tcgdexMap.set(normalizeCardNumber(card.localId || card.id), card);
  });

  // Merge: pokemontcg.io/Vera ⊕ TCGDex
  const merged = sourcePtcgCards.map((card) => {
    const number = normalizeCardNumber(card.number);
    const tcgdexCard = tcgdexMap.get(number);
    // Cardmarket-URL: tcgdex > ptcg > generiert
    const cardmarketUrl =
      tcgdexCard?.links?.cardmarket ||
      card.cardmarket?.url ||
      null;
    return {
      number,
      name: tcgdexCard?.name || card.name,
      image: tcgdexCard
        ? tcgdexImageOrFallback(setId, tcgdexCard)
        : (card.images?.small || `https://images.pokemontcg.io/${setId}/${number}.png`),
      cardmarketUrl
    };
  });

  // TCGDex-only Karten als Union anhängen (z.B. neue DE-exklusive Promo-Karten)
  const existing = new Set(merged.map((c) => c.number));
  (tcgdexSet?.cards || []).forEach((tcgdexCard) => {
    const number = normalizeCardNumber(tcgdexCard.localId || tcgdexCard.id);
    if (existing.has(number)) return;
    merged.push({
      number,
      name: tcgdexCard.name,
      image: tcgdexImageOrFallback(setId, tcgdexCard),
      cardmarketUrl: tcgdexCard.links?.cardmarket || null
    });
  });

  return naturalSort(merged, 'number');
}
