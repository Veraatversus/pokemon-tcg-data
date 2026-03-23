/**
 * PHASE 1: Dual-Source Schema Contract & Feldmatrix
 * 
 * Definiert:
 * 1. Kanonische Entity-Contracts für Set und Card
 * 2. Match-Status-Modell mit Konfidenzscores
 * 3. Feldweise Merge-Regeln (pro Feld: Quelle, Fallback, Null-Handling)
 * 4. Source-Enums für Provenance-Tracking
 */

// ── Match-Status und Konfidenzscores ──────────────────────────────

export const MATCH_STATUS = Object.freeze({
  /** Direkte ID-Übereinstimmung (Vera setId === TCGdex id ) */
  DIRECT_ID: 'direct_id',
  
  /** Match via CUSTOM_SET_ID_MAPPINGS */
  CUSTOM_MAP: 'custom_map',
  
  /** Match via normalisierte ID-Form (e.g. "swsh4.5" → "swsh45") */
  NORMALIZED_ID: 'normalized_id',
  
  /** Match via Name-Heuristik (codebasierter Name-Vergleich) */
  NAME_HEURISTIC: 'name_heuristic',
  
  /** TCGdex-only Set (existiert nur in TCGdex, nicht in Vera) */
  TCGDEX_ONLY: 'unmatched_tcgdex_only'
});

export const MATCH_CONFIDENCE = Object.freeze({
  // Keys entsprechen den Values von MATCH_STATUS (lowercase), damit
  // MATCH_CONFIDENCE[MATCH_STATUS.DIRECT_ID] korrekt aufgelöst wird.
  direct_id: 0.99,
  custom_map: 0.95,
  normalized_id: 0.90,
  name_heuristic: 0.70,
  unmatched_tcgdex_only: 0.50
});

// ── Source-Enums für Feld-Provenance ──────────────────────────────

export const SOURCE = Object.freeze({
  VERA: 'vera',
  TCGDEX: 'tcgdex',
  MERGED: 'merged'
});

// ── Set Entity Contract ──────────────────────────────────────────

/**
 * Kanonisches Set-Modell mit allen UI-relevanten Feldern + Provenance.
 * 
 * UI-Felder (public):
 * - id: Set-Kennung
 * - name: Display-Name
 * - series: Serie/Block
 * - releaseDate: Veröffentlichungsdatum
 * - cardCounts: Kartenzählungen (official, reverse, holo, first edition)
 * - images: logos + symbole (für Sets)
 * - ptcgoCode: Pokémon TCGO-Kode
 * - legalities: Legales Format
 * - symbols: Zusätzliche Markierungen
 * 
 * Provenance-Felder (internal):
 * - matchStatus: wie das Set gematcht wurde
 * - matchReason: warum (für Debugging)
 * - matchConfidence: confidence score 0..1
 * - sources: {vera, tcgdex} rohe Quelldaten zur Inspektionall merged fields to support field-wise fallback
 */
export const SET_ENTITY_FIELDS = Object.freeze({
  // ── Identifikation ────────────────────────────────────────────
  id: 'string',                    // kanonische ID
  veraId: 'string',                // Vera API id
  tcgdexId: 'string',              // TCGdex API id
  
  // ── Anzeigedaten ──────────────────────────────────────────────
  name: 'string',                  // Display-Name (bevorzugt DE version)
  series: 'string',                // Serie/Block
  releaseDate: 'string',           // yyyy-mm-dd oder Vera format
  
  // ── Kartenzählungen (feldweise Quelle konfigurierbar) ─────────
  totalCards: 'number',            // offizielle Gesamtanzahl
  printedCards: 'number',          // gedruckte nur (ohne Secret Rares)
  cardCounts: {
    official: 'number',            // TCGdex: official count
    reverse: 'number',             // TCGdex oder Vera
    holo: 'number',                // TCGdex oder Vera
    firstEdition: 'number'         // TCGdex oder Vera
  },
  
  // ── Bilder ─────────────────────────────────────────────────────
  images: {
    logo: 'string',                // URL zum Logo
    symbol: 'string'               // URL zum Symbol
  },
  
  // ── Metadaten ──────────────────────────────────────────────────
  ptcgoCode: 'string',             // Pokémon TCGO-Kode
  legalities: 'object',            // {format: "legal"|"banned"|"restricted"}
  updatedAt: 'string',             // ISO timestamp oder Vera format
  
  // ── Provenance & Match-Metadata ────────────────────────────────
  matchStatus: 'string',           // MATCH_STATUS enum
  matchReason: 'string',           // human-readable reason
  matchConfidence: 'number',       // 0..1
  
  // ── Source-Daten (volle Payloads für Debugging/Merge) ────────────
  sources: {
    vera: 'object|null',           // vollständige Vera-Payload
    tcgdex: 'object|null'          // vollständige TCGdex-Payload
  }
});

// ── Card Entity Contract ──────────────────────────────────────────

/**
 * Kanonisches Card-Modell.
 * 
 * UI-Felder (public):
 * - setId: gehörendes Set
 * - cardId: eindeutige Kennung
 * - number: Kartennummer im Set
 * - name: Kartennamen (bevorzugt DE)
 * - image: Kartenbilder (bevorzugt HD von TCGdex)
 * - cardmarketUrl: Cardmarket-Link
 * - stats: HP, Typen, Supertypes, Subtypes, etc.
 * - pricing: Preise aus TCGdex
 * - rarity: Seltenheit
 * - artist: Künstler
 * - evolvesFrom: Vorgänger-Karte
 * - rules: Regeltext (Fähigkeiten, Angriffe)
 * 
 * Provenance-Felder (internal):
 * - matchStatus: wie die Karte gematcht wurde
 * - sources: {vera, tcgdex} volle Payloads
 */
export const CARD_ENTITY_FIELDS = Object.freeze({
  // ── Identifikation ────────────────────────────────────────────
  setId: 'string',                 // gehörendes Set ID
  cardId: 'string',                // kanonische Karten-ID (setId/number)
  veraCardId: 'string',            // Vera interne Karten-ID (falls vorhanden)
  tcgdexCardId: 'string',          // TCGdex interne Karten-ID
  
  // ── Kartennummer ───────────────────────────────────────────────
  number: 'string',                // Nummern im Set (z.B. "25" oder "25a", kann auch "95sr")
  
  // ── Anzeigedaten (feldweise Quelle konfigurierbar) ────────────
  name: 'string',                  // Kartennamen (bevorzugt TCGdex-DE)
  nameEn: 'string',                // englischer Name (Fallback)
  imageDe: 'string',               // HD-Bild (bevorzugt TCGdex)
  imageEn: 'string',               // Fallback-Bild (Vera oder ptcg)
  
  // ── Kartenstats ────────────────────────────────────────────────
  hp: 'number|null',               // Hitpoints (nur Pokémon)
  types: 'array<string>',          // Energietypen
  supertype: 'string',             // "Pokémon" | "Trainer" | "Energy"
  subtypes: 'array<string>',       // z.B. ["Stage 1", "Evo", "Supporter"]
  evolvesFrom: 'string|null',      // Vorgänger-Karte, falls Evo
  
  // ── Kunstler und Flavor ────────────────────────────────────────
  artist: 'string|null',           // Künstler
  flavorText: 'string|null',       // Flavor Text
  
  // ── Preise & Market-Links ──────────────────────────────────────
  cardmarketUrl: 'string|null',    // Direct Cardmarket Link
  normalPrice: 'number|null',      // TCGdex normalPrice (€)
  reversePrice: 'number|null',     // TCGdex reversePrice (€)
  
  // ── Seltenheit & Regeln ────────────────────────────────────────
  rarity: 'string|null',           // "Common" | "Uncommon" | "Rare" | etc
  regulationMark: 'string|null',   // z.B. "E", "F", "G", "H"
  rules: 'array<object>|null',     // [{name, type, text}, ...] (Ability, Atk, Etc)
  
  // ── Metadaten ──────────────────────────────────────────────────
  updatedAt: 'string',             // ISO timestamp oder Vera format
  
  // ── Provenance & Match-Metadata ────────────────────────────────
  matchStatus: 'string',           // MATCH_STATUS enum
  matchReason: 'string',           // human-readable reason
  matchConfidence: 'number',       // 0..1
  
  // ── Source-Daten (volle Payloads für Debugging/Merge) ────────────
  sources: {
    vera: 'object|null',           // ursprüngliche Vera-Payload
    tcgdex: 'object|null'          // ursprüngliche TCGdex-Payload
  }
});

// ── Feldweise Merge-Matrix ───────────────────────────────────────

/**
 * Definiert pro Feld: welche Quelle ist primär, Fallback-Reihenfolge, Null-Handling.
 * 
 * Format:
 * fieldName: {
 *   primarySource: SOURCE.VERA|SOURCE.TCGDEX,   // Primärquelle
 *   fallbackSources: [SOURCE.TCGDEX, ...],       // Fallback-Reihenfolge
 *   nullHandling: 'use_fallback' | 'allow_empty'
 * }
 * 
 * Wird von Phase 2–5 zur feldweisen Merge-Resolver-Logik genutzt.
 * Kann später in config.js als runtime-konfigurierbar verschoben werden.
 */
export const FIELD_MERGE_MATRIX = Object.freeze({
  // ── Sets ────────────────────────────────────────────────────────
  sets: {
    // Identifikation: Vera primär (ist kanonisch)
    id: { primarySource: SOURCE.VERA, fallbackSources: [SOURCE.TCGDEX], nullHandling: 'disallow' },
    name: { primarySource: SOURCE.VERA, fallbackSources: [SOURCE.TCGDEX], nullHandling: 'use_fallback' },
    series: { primarySource: SOURCE.VERA, fallbackSources: [SOURCE.TCGDEX], nullHandling: 'allow_empty' },
    releaseDate: { primarySource: SOURCE.VERA, fallbackSources: [SOURCE.TCGDEX], nullHandling: 'allow_empty' },
    
    // Kartenzählungen: TCGdex für official count, Vera für andere
    'cardCounts.official': { primarySource: SOURCE.TCGDEX, fallbackSources: [SOURCE.VERA], nullHandling: 'allow_empty' },
    'cardCounts.reverse': { primarySource: SOURCE.VERA, fallbackSources: [SOURCE.TCGDEX], nullHandling: 'allow_empty' },
    'cardCounts.holo': { primarySource: SOURCE.VERA, fallbackSources: [SOURCE.TCGDEX], nullHandling: 'allow_empty' },
    'cardCounts.firstEdition': { primarySource: SOURCE.VERA, fallbackSources: [SOURCE.TCGDEX], nullHandling: 'allow_empty' },
    totalCards: { primarySource: SOURCE.VERA, fallbackSources: [SOURCE.TCGDEX], nullHandling: 'use_fallback' },
    printedCards: { primarySource: SOURCE.VERA, fallbackSources: [SOURCE.TCGDEX], nullHandling: 'allow_empty' },
    
    // Bilder: Vera primär (meist besser gepflegt)
    'images.logo': { primarySource: SOURCE.VERA, fallbackSources: [SOURCE.TCGDEX], nullHandling: 'use_fallback' },
    'images.symbol': { primarySource: SOURCE.VERA, fallbackSources: [SOURCE.TCGDEX], nullHandling: 'use_fallback' },
    
    // Metadaten: Vera primär (Update-Quelle)
    ptcgoCode: { primarySource: SOURCE.VERA, fallbackSources: [SOURCE.TCGDEX], nullHandling: 'allow_empty' },
    legalities: { primarySource: SOURCE.TCGDEX, fallbackSources: [SOURCE.VERA], nullHandling: 'allow_empty' },
    updatedAt: { primarySource: SOURCE.VERA, fallbackSources: [], nullHandling: 'disallow' }
  },

  // ── Cards ────────────────────────────────────────────────────────
  cards: {
    // Identifikation
    setId: { primarySource: SOURCE.VERA, fallbackSources: [SOURCE.TCGDEX], nullHandling: 'disallow' },
    cardId: { primarySource: SOURCE.VERA, fallbackSources: [SOURCE.TCGDEX], nullHandling: 'disallow' },
    number: { primarySource: SOURCE.VERA, fallbackSources: [SOURCE.TCGDEX], nullHandling: 'disallow' },
    
    // Anzeigedaten: TCGdex für DE, Vera als Fallback für EN
    name: { primarySource: SOURCE.TCGDEX, fallbackSources: [SOURCE.VERA], nullHandling: 'use_fallback' },
    nameEn: { primarySource: SOURCE.VERA, fallbackSources: [SOURCE.TCGDEX], nullHandling: 'use_fallback' },
    imageDe: { primarySource: SOURCE.TCGDEX, fallbackSources: [SOURCE.VERA], nullHandling: 'use_fallback' },
    imageEn: { primarySource: SOURCE.VERA, fallbackSources: [SOURCE.TCGDEX], nullHandling: 'use_fallback' },
    
    // Kartenstats: Vera primär (zuverlässiger)
    hp: { primarySource: SOURCE.VERA, fallbackSources: [SOURCE.TCGDEX], nullHandling: 'allow_empty' },
    types: { primarySource: SOURCE.VERA, fallbackSources: [SOURCE.TCGDEX], nullHandling: 'allow_empty' },
    supertype: { primarySource: SOURCE.VERA, fallbackSources: [SOURCE.TCGDEX], nullHandling: 'allow_empty' },
    subtypes: { primarySource: SOURCE.VERA, fallbackSources: [SOURCE.TCGDEX], nullHandling: 'allow_empty' },
    evolvesFrom: { primarySource: SOURCE.VERA, fallbackSources: [SOURCE.TCGDEX], nullHandling: 'allow_empty' },
    
    // Kunstler + Flavor: Vera primär
    artist: { primarySource: SOURCE.VERA, fallbackSources: [SOURCE.TCGDEX], nullHandling: 'allow_empty' },
    flavorText: { primarySource: SOURCE.VERA, fallbackSources: [SOURCE.TCGDEX], nullHandling: 'allow_empty' },
    
    // Preise & Links: TCGdex nur
    cardmarketUrl: { primarySource: SOURCE.TCGDEX, fallbackSources: [], nullHandling: 'allow_empty' },
    normalPrice: { primarySource: SOURCE.TCGDEX, fallbackSources: [], nullHandling: 'allow_empty' },
    reversePrice: { primarySource: SOURCE.TCGDEX, fallbackSources: [], nullHandling: 'allow_empty' },
    
    // Seltenheit: Vera primär
    rarity: { primarySource: SOURCE.VERA, fallbackSources: [SOURCE.TCGDEX], nullHandling: 'allow_empty' },
    regulationMark: { primarySource: SOURCE.VERA, fallbackSources: [SOURCE.TCGDEX], nullHandling: 'allow_empty' },
    rules: { primarySource: SOURCE.VERA, fallbackSources: [SOURCE.TCGDEX], nullHandling: 'allow_empty' },
    
    // Update-Tracking: neueste gewinnt
    updatedAt: { primarySource: SOURCE.VERA, fallbackSources: [SOURCE.TCGDEX], nullHandling: 'disallow' }
  }
});

// ── Hilfsfunktion: Match-Result erzeugen ──────────────────────────

/**
 * Erstellt ein strukturiertes Matching-Resultat.
 * 
 * @param {string} status - MATCH_STATUS enum value
 * @param {string} reason - human-readable reason
 * @param {object} veraEntity - ursprüngliche Vera-Entität oder null
 * @param {object} tcgdexEntity - ursprüngliche TCGdex-Entität oder null
 * @returns {object} {status, reason, confidence, sources}
 */
export function createMatchResult(status, reason, veraEntity = null, tcgdexEntity = null) {
  return {
    matchStatus: status,
    matchReason: reason,
    matchConfidence: MATCH_CONFIDENCE[status] ?? 0.5,
    sources: {
      vera: veraEntity || null,
      tcgdex: tcgdexEntity || null
    }
  };
}

// ── Hilfsfunktion: Merge-Konflikt Handler ────────────────────────

/**
 * Resolviert einen Feldwert basierend auf Merge-Matrix.
 * 
 * @param {string} fieldName - Feldname (kann nested sein wie "cardCounts.official")
 * @param {*} veraValue - Feldwert aus Vera
 * @param {*} tcgdexValue - Feldwert aus TCGdex
 * @param {object} fieldConfig - aus FIELD_MERGE_MATRIX[entityType][fieldName]
 * @returns {*} resolvierter Feldwert
 */
export function resolveFieldValue(fieldName, veraValue, tcgdexValue, fieldConfig) {
  if (!fieldConfig) {
    // Fallback: Vera primär, dann TCGdex
    return veraValue !== null && veraValue !== undefined ? veraValue
         : tcgdexValue !== null && tcgdexValue !== undefined ? tcgdexValue
         : null;
  }

  const { primarySource, fallbackSources, nullHandling } = fieldConfig;
  const sources = {
    [SOURCE.VERA]: veraValue,
    [SOURCE.TCGDEX]: tcgdexValue
  };

  // Primärquelle
  if (sources[primarySource] !== null && sources[primarySource] !== undefined) {
    return sources[primarySource];
  }

  // Fallback-Reihenfolge
  for (const fallbackSource of fallbackSources) {
    if (sources[fallbackSource] !== null && sources[fallbackSource] !== undefined) {
      return sources[fallbackSource];
    }
  }

  // Null-Handling
  if (nullHandling === 'disallow') {
    throw new Error(`Field "${fieldName}" cannot be null (nullHandling: disallow)`);
  }
  return null;
}
