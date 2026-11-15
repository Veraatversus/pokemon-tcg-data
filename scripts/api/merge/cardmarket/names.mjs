// Namen: Normalisierung, Namensvergleich, Energie-Symbole und Angriffsschluessel (Blatt, keine Importe).

// Klammerzusaetze ([Angriffe], [F], [A]) und Cardmarkets Level-Angabe "Lv.44" (nicht "LV.X") fallen weg,
// "★" entspricht "Gold Star", "Delta Species" ist bei Cardmarket nur ein Zusatz zu "δ".
// Danach ohne Diakritika, klein, nur Buchstaben und Ziffern.
export function normalizeCmName(value) {
  return String(value ?? '')
    // HTML-Kuerzel aus Cardmarkets Katalog ("Nidoran &female;"): wie die Zeichen selbst (♀) bleiben sie aussen vor
    .replace(/&#?\w+;/g, ' ')
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/\bLv\.\s*\d+/gi, ' ')
    .replace(/★/g, ' gold star ')
    .replace(/\bdelta species\b/gi, ' ')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, '');
}

export const OVERSIZED = /\[\s*oversized\s*\]/i;
// Nur ein einzelnes Energie-Buchstaben-Token, auf das noch Namenstext folgt (nicht die Angriffsklammer
// und nicht "Nidoran [F] [Angriffe]", dort ist [F] das Geschlecht).
const ENERGY_TOKEN = /\[([GRWLPFDMYNC])\](?=\s*[^\s[])/g;
const ENERGY_WORDS = {
  G: 'Grass', R: 'Fire', W: 'Water', L: 'Lightning', P: 'Psychic', F: 'Fighting', D: 'Darkness', M: 'Metal', Y: 'Fairy', N: 'Dragon', C: 'Colorless',
};
// Normalisierter Name mit ausgeschriebenen Energie-Symbolen, null ohne solches Token.
export function cmEnergyName(cmName) {
  const raw = String(cmName ?? '');
  if (!raw.match(ENERGY_TOKEN)) return null;
  return normalizeCmName(raw.replace(ENERGY_TOKEN, (_, l) => ` ${ENERGY_WORDS[l]} `));
}

// Nachsichtiger Namensvergleich, nur fuer die Frage "zeigt diese vorhandene ID auf ein falsches Produkt?"
// (nie zum Finden): Cardmarket schreibt Kurz-Tags in Klammern ("Lucario [GL]", "Growing [G] Energy"),
// Basis-Energien mit "Basic" und Varianten mit Untertitel ("Professor's Research - Professor Oak").
const GREEK = { α: ' alpha ', β: ' beta ', γ: ' gamma ', δ: ' delta ' };
export function cmNameMatches(cmName, cardName) {
  const card = normalizeCmName(cardName);
  if (!card) return false;
  // Cardmarket schreibt griechische Buchstaben aus ("Mystery Plate delta" = "Mystery Plate δ").
  const cards = new Set([card, normalizeCmName(String(cardName).replace(/[αβγδ]/g, (g) => GREEK[g]))]);
  const raw = String(cmName ?? '');
  const forms = [raw, raw.replace(/\[([^\]|]{1,4})\]/g, ' $1 '), raw.replace(/^Basic\s+/i, ''), raw.split(' - ')[0]];
  return forms.some((f) => cards.has(normalizeCmName(f)));
}

// Angriffs-/Faehigkeitsnamen als reihenfolgefreier Schluessel ("" = keine).
const attackKey = (names) => [...new Set(names.map((n) => normalizeCmName(n)).filter((n) => n && !/^\d+$/.test(n)))].sort().join('|');
// Cardmarket: letzte Klammer des Produktnamens ("Pikachu [Lonely Gaze | Pika Ball]"); reine Zahlen fallen weg.
export function cmAttackKey(cmName) {
  const groups = [...String(cmName ?? '').matchAll(/\[([^\]]*)\]/g)];
  return groups.length ? attackKey(groups.at(-1)[1].split('|')) : '';
}
// v3-Karte: EN-Angriffe und -Faehigkeiten.
export function cardAttackKey(card) {
  return attackKey([...(card?.attacks ?? []), ...(card?.abilities ?? [])].map((a) => a?.name ?? ''));
}
