// Abbildung von API-v3-Sets/-Karten auf die bestehenden internen Record-Felder
// (identisch zu buildSetRecordFromSources / buildCardRecordFromSources).
//
// Semantik:
//  - vera_*   = EN-Oberfelder von v3
//  - tcgdex_* = ausschliesslich DE aus i18n.de (leer ohne DE-Wert, kein EN-Fallback;
//               den Fallback uebernimmt resolveFieldValue nach Kartensprache)
//  - updatedAt: wie in den alten Buildern `new Date().toISOString()`, sofern nicht
//               per Option `updatedAt` uebergeben (keine erfundenen festen Zeitstempel).
import { buildCardmarketProductUrl } from './cardmarket-url-utils.js';

const str = (v) => (typeof v === 'string' ? v.trim() : '');
const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const list = (v) => (Array.isArray(v) ? v : []);

function safeDecode(text) {
  try {
    return decodeURIComponent(text);
  } catch {
    return text;
  }
}

// localId = alles nach dem TCGdex-Set-Praefix `<tcgdexSetId>-` (bekannt aus dem Set),
// sonst Teil nach dem letzten '-'. URL-dekodiert.
function tcgdexLocalId(tcgdexId, tcgdexSetId = '') {
  const id = str(tcgdexId);
  if (!id) return '';
  const prefix = str(tcgdexSetId) ? `${str(tcgdexSetId)}-` : '';
  const rest = prefix && id.startsWith(prefix) && id.length > prefix.length
    ? id.slice(prefix.length)
    : id.slice(id.lastIndexOf('-') + 1);
  return safeDecode(rest);
}

const positiveId = (v) => {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
};

const isUnstamped = (variant) => !Array.isArray(variant?.stamp) || variant.stamp.length === 0;

/**
 * Primaere Cardmarket-Produkt-ID einer v3-Karte - dieselbe Regel wie search-index `cm` (API-Build):
 *   1. erste UNGESTEMPELTE Variante (ohne `stamp` bzw. leeres Array) mit cardmarketId
 *   2. sonst erste Variante mit cardmarketId
 *   3. sonst ids.cardmarket[0]
 * null ohne ID. Stempel-Produkte (pre-release, set-logo ...) stehen teils vorn (sv3-72: 727119 Pre-Release
 * statt 725152), ids.cardmarket[0] ist bei TCGdex-IDs teils ein Stempel-Produkt ohne Nummer (sv3pt5-1).
 */
export function primaryCardmarketProductId(card = {}) {
  const variants = list(card?.variants).filter((v) => positiveId(v?.cardmarketId));
  const fromVariant = positiveId((variants.find(isUnstamped) || variants[0])?.cardmarketId);
  if (fromVariant) return fromVariant;
  const ids = card?.ids?.cardmarket;
  return positiveId(Array.isArray(ids) ? ids[0] : ids);
}

const cardmarketProductId = primaryCardmarketProductId;

// Varianten mit eigener Produkt-ID (Stempel/Sondervarianten), fuer eine spaetere Varianten-Anzeige.
function cardmarketVariants(card) {
  return list(card.variants)
    .filter((v) => positiveId(v?.cardmarketId))
    .map((v) => ({
      type: str(v.type),
      subtype: str(v.subtype),
      stamp: list(v.stamp),
      cardmarketId: positiveId(v.cardmarketId)
    }));
}

export function toSetRecord(v3Set = {}, { imported = false, updatedAt = null } = {}) {
  const set = v3Set || {};
  const de = set.i18n?.de || {};
  const id = str(set.id);
  const pokemontcgId = str(set.ids?.pokemontcg);
  const tcgdexId = str(set.ids?.tcgdex);
  const isTcgdexOnly = id.startsWith('TCGDEX-');
  const matchStatus = str(set.matchStatus)
    || (pokemontcgId && tcgdexId ? 'matched' : (tcgdexId ? 'tcgdex_only' : 'primary_only'));

  return {
    setId: id,
    imported: Boolean(imported),
    updatedAt: updatedAt || new Date().toISOString(),
    matchStatus,
    isTcgdexOnly,
    // vera (EN)
    vera_id: pokemontcgId,
    vera_name: str(set.name),
    vera_series: str(set.series),
    vera_printedTotal: num(set.printedTotal),
    vera_total: num(set.total),
    vera_ptcgoCode: str(set.ptcgoCode),
    vera_releaseDate: str(set.releaseDate),
    vera_legalities: set.legalities || null,
    vera_images_symbol: str(set.images?.symbol),
    vera_images_logo: str(set.images?.logo),
    // tcgdex (DE)
    tcgdex_id: tcgdexId,
    tcgdex_name: str(de.name),
    tcgdex_serie_id: '',
    tcgdex_serie_name: str(de.series),
    tcgdex_abbreviation_official: '',
    tcgdex_releaseDate: '',
    tcgdex_legal: null,
    tcgdex_logo: str(de.images?.logo),
    tcgdex_symbol: str(de.images?.symbol),
    // official/total fehlen in i18n.de.cardCount teils (total nie): Fallback auf die Oberfelder
    tcgdex_cardCount_official: num(de.cardCount?.official) || num(set.printedTotal),
    tcgdex_cardCount_total: num(de.cardCount?.total) || num(set.total),
    tcgdex_cardCount_holo: 0,
    tcgdex_cardCount_reverse: 0,
    tcgdex_cardCount_firstEdition: 0,
    tcgdex_cardCount_normal: 0,
    // Nicht-Sheet-Passthrough: volles DE-Objekt aus v3 (kein Sheet-Header)
    i18n_de: set.i18n?.de || null
  };
}

export function toCardRecord(v3Card = {}, v3Set = null, { updatedAt = null } = {}) {
  const card = v3Card || {};
  const de = card.i18n?.de || {};
  const pokemontcgId = str(card.ids?.pokemontcg);
  const tcgdexId = str(card.ids?.tcgdex);
  const matchStatus = str(card.matchStatus)
    || (pokemontcgId && tcgdexId ? 'matched' : (tcgdexId ? 'tcgdex_only' : 'primary_only'));
  const productId = cardmarketProductId(card);
  // Gespeicherte URL (Sheet-Spalte) bleibt de; der angezeigte Link entsteht in resolveDisplayCard
  // ueber resolveCardmarketLink in der Kartensprache.
  const cardmarketUrl = buildCardmarketProductUrl(productId) || '';

  return {
    // Die eigene setId der Karte ist massgeblich (z.B. cel25c-Karten unter Set cel25);
    // v3Set ist nur Fallback und wird bei Abweichung nicht eingemischt.
    setId: str(card.setId) || str(v3Set?.id),
    cardId: str(card.id),
    collectionKey: str(card.cardId),
    number: str(card.number),
    updatedAt: updatedAt || new Date().toISOString(),
    matchStatus,
    isPrimaryOnly: matchStatus === 'primary_only',
    isTcgdexOnly: matchStatus === 'tcgdex_only',
    // vera (EN)
    vera_id: pokemontcgId,
    vera_name: str(card.name),
    vera_supertype: str(card.supertype),
    vera_subtypes: list(card.subtypes),
    vera_hp: card.hp ? String(card.hp) : '',
    vera_types: list(card.types),
    vera_evolvesFrom: str(card.evolvesFrom),
    vera_abilities: list(card.abilities),
    vera_attacks: list(card.attacks),
    vera_weaknesses: list(card.weaknesses),
    vera_resistances: list(card.resistances),
    vera_retreatCost: list(card.retreatCost).filter(Boolean),
    vera_convertedRetreatCost: num(card.convertedRetreatCost),
    vera_number: str(card.number),
    vera_artist: str(card.artist),
    vera_rarity: str(card.rarity),
    vera_flavorText: str(card.flavorText),
    vera_nationalPokedexNumbers: list(card.nationalPokedexNumbers),
    vera_legalities: card.legalities || null,
    vera_regulationMark: str(card.regulationMark),
    vera_rules: list(card.rules),
    vera_images_small: str(card.images?.small),
    vera_images_large: str(card.images?.large),
    vera_cardmarket_url: cardmarketUrl,
    // tcgdex (DE, nur echte DE-Werte)
    tcgdex_id: tcgdexId,
    tcgdex_name: str(de.name),
    tcgdex_localId: tcgdexLocalId(
      tcgdexId,
      !card.setId || !v3Set?.id || card.setId === v3Set.id ? v3Set?.ids?.tcgdex : ''
    ),
    tcgdex_image_small: str(de.images?.small),
    tcgdex_image_large: str(de.images?.large),
    tcgdex_cardmarket_url: '',
    tcgdex_rarity: '',
    tcgdex_hp: '',
    tcgdex_types: [],
    tcgdex_category: '',
    tcgdex_stage: '',
    tcgdex_suffix: '',
    tcgdex_evolvesFrom: str(de.evolvesFrom),
    tcgdex_illustrator: '',
    tcgdex_regulationMark: '',
    tcgdex_description: '',
    tcgdex_effect: null,
    // Nicht-Sheet-Passthrough: Cardmarket-Produkt-ID (massgeblich fuer Link/Preis, siehe
    // resolveCardmarketProductId) und Varianten-IDs; kein Sheet-Header.
    cardmarketProductId: productId,
    cardmarketVariants: cardmarketVariants(card),
    // Nicht-Sheet-Passthrough: volles DE-Objekt (name, evolvesFrom, attacks, abilities,
    // rules, flavorText, images ...); kein Sheet-Header, wird von den Writern ignoriert.
    i18n_de: card.i18n?.de || null
  };
}
