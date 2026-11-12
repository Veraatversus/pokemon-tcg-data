// Entscheidet, ob db_cards-Karten (Offline-/Sammel-Fallback) aus api/v3 nachgeladen werden muessen.
//
// api/v3 ist massgeblich (Spec §7.1). db_cards werden beim Import aus v3 geschrieben; deren Cardmarket-Links
// sind direkte Produkt-URLs (`?idProduct=`) aus den v3-IDs oder leer, wenn v3 keine Cardmarket-ID kennt.
// Beides ist der aktuelle v3-Stand und darf kein Nachladen ausloesen – sonst wuerde jedes Set mit db_cards
// bei jedem Aufruf erneut geladen (Endlos-Reload).
//
// Nachgeladen wird nur bei Daten aus der Zeit vor v3:
// - zu wenige Karten mit Detaildaten (alte, duenne db_cards-Zeilen), oder
// - generierte Cardmarket-*Such*links (`/Products/Search?searchString=`); v3 erzeugt solche Links nie.
import { isGeneratedCardmarketSearchUrl } from '../data/cardmarket-url-utils.js';

export function hasRichCardDetails(card = {}) {
  return Boolean(
    String(card?.rarity || '').trim()
    || String(card?.hp || '').trim()
    || (Array.isArray(card?.types) && card.types.length)
    || String(card?.supertype || '').trim()
    || String(card?.artist || '').trim()
    || (Array.isArray(card?.rules) && card.rules.length)
    || String(card?.flavorText || '').trim()
  );
}

export function needsApiCardEnrichment(cards = []) {
  const sample = (Array.isArray(cards) ? cards : []).filter(Boolean).slice(0, 12);
  if (!sample.length) return false;

  const richCount = sample.filter((card) => hasRichCardDetails(card)).length;
  const hasPreV3SearchLink = sample.some((card) => {
    const cardmarketUrl = String(card?.cardmarketUrl || card?.vera_cardmarket_url || card?.tcgdex_cardmarket_url || '').trim();
    return Boolean(cardmarketUrl) && isGeneratedCardmarketSearchUrl(cardmarketUrl);
  });

  return richCount < Math.max(1, Math.ceil(sample.length * 0.4)) || hasPreV3SearchLink;
}

export const NO_CARD_DATA_MESSAGE = 'Keine Kartendaten in der Datenbank gefunden. Bitte Set importieren/aktualisieren oder API-Fallback aktivieren.';

/**
 * Meldung, wenn fuer ein Set weder api/v3-Karten noch db_cards (Offline-Fallback) vorliegen.
 * api/v3 nicht erreichbar -> die v3-Meldung statt des allgemeinen „Keine Kartendaten …“.
 */
export function describeCardDataFailure(err) {
  if (err?.code === 'V3_UNREACHABLE') {
    return `${err.message} – und für dieses Set sind keine gespeicherten Kartendaten (db_cards) vorhanden. Bitte Verbindung prüfen und erneut laden.`;
  }
  if (err?.code === 'V3_SET_UNKNOWN') {
    return `${err.message}.`;
  }
  return NO_CARD_DATA_MESSAGE;
}
