// Kartennummern: Normalisierung, Set-Praefix und custom-set-Basisnummern (Blatt, keine Importe).

export function normalizeCmNumber(value) {
  if (value === undefined || value === null) return null;
  const s = String(value).trim().toLowerCase();
  if (!s) return null;
  const m = /^([a-z]*)0*(\d+)(.*)$/.exec(s);
  return m ? `${m[1]}${m[2]}${m[3]}` : s;
}

// Kartennummer fuer den Vergleich mit Cardmarket-Nummern (custom-sets). Promo-Sets fuehren das Kuerzel in jeder
// Nummer ("BW01", "SM30a", "XY35"), Cardmarket schreibt es als Setcode davor ("BW 01" -> custom-set "1"). Haben
// ALLE Karten eines Sets dasselbe Buchstaben-Praefix, wird es entfernt; gemischte Sets (Skyridge 1-144 + H1-H32,
// Galerien TG01 neben 001) bleiben exakt. registerSetNumbers setzt das je Set, cardCmNumber liest es.
const cardNumberKeys = new WeakMap();
export function commonNumberPrefix(cards) {
  let prefix = null;
  for (const c of cards ?? []) {
    const m = /^([a-z]+)\d/.exec(normalizeCmNumber(c?.number) ?? '');
    if (!m || (prefix !== null && m[1] !== prefix)) return null;
    prefix = m[1];
  }
  return prefix;
}
export function registerSetNumbers(cards) {
  const prefix = commonNumberPrefix(cards);
  if (!prefix) return;
  for (const c of cards) cardNumberKeys.set(c, normalizeCmNumber(c.number).slice(prefix.length));
}
export function cardCmNumber(card) {
  return cardNumberKeys.get(card) ?? normalizeCmNumber(card?.number);
}
// Beide Schreibweisen, exakte zuerst: Produkte alter Quellen fuehren das Kuerzel teils in der Nummer ("XY20"), und
// Erweiterungen mit Haupt- und Unterset (Hidden Fates: 1-69 und SV1-SV94) brauchen die exakte Nummer.
export function cardCmNumbers(card) {
  return [...new Set([normalizeCmNumber(card?.number), cardCmNumber(card)].filter(Boolean))];
}
// Treffer der ersten Schreibweise, die etwas findet (exakt vor "ohne Praefix").
export const productsByNumber = (map, card) => {
  for (const n of cardCmNumbers(card)) if (map.get(n)?.length) return [...map.get(n)];
  return [];
};

// Basisnummer einer normalisierten custom-set-Nummer: "4v2" -> "4", "h25v3" -> "h25", "224a" -> "224".
// Kit-Expansionen (setSuffix): "1n"/"1s" sind verschiedene Karten, kein Buchstaben-Zusatz zu "1".
export const csBase = (index, n) => (index?.setSuffix ? n : customSetBase(n));
export function customSetBase(normalized) {
  return String(normalized ?? '').replace(/v\d+$/, '').replace(/^(\d+)[a-z]$/, '$1');
}
