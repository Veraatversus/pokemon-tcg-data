/**
 * utils.js – Gemeinsame Hilfsfunktionen für tcg-tracker-web
 */

/**
 * Normalisiert eine Kartennummer:
 * führende Nullen entfernen, alphabetische Präfixe/Suffixe bewahren.
 * Beispiele: "001" → "1", "SWSH001" → "SWSH1", "1a" → "1a"
 * @param {string|number} cardNumber
 * @returns {string}
 */
export function normalizeCardNumber(cardNumber) {
  if (cardNumber === null || cardNumber === undefined) return '';
  const normalized = String(cardNumber).trim();
  const match = normalized.match(/^([a-zA-Z._-]*?)(\d+)([a-zA-Z._-]*)$/);
  if (!match) return normalized;
  const prefix = match[1];
  const numericPart = parseInt(match[2], 10).toString();
  const suffix = match[3];
  return `${prefix}${numericPart}${suffix}`;
}

/**
 * Natürlich sortiert ein Array von Objekten nach einem Schlüssel.
 * Numerische Segmente werden korrekt als Zahlen verglichen.
 * @param {object[]} arr
 * @param {string|((item: object) => string)} key  Schlüssel oder Accessor-Funktion
 * @returns {object[]} Neues sortiertes Array (original wird nicht mutiert)
 */
export function naturalSort(arr, key) {
  const getValue = typeof key === 'function' ? key : (item) => item[key] ?? '';
  return [...arr].sort((a, b) =>
    String(getValue(a)).localeCompare(String(getValue(b)), undefined, {
      numeric: true,
      sensitivity: 'base'
    })
  );
}

/**
 * Robuste Boolean-Konvertierung:
 * Behandelt true, "true", "TRUE", "1", 1 → true; alles andere → false.
 * @param {*} value
 * @returns {boolean}
 */
export function toBoolean(value) {
  if (value === true) return true;
  if (value === false) return false;
  const str = String(value).trim().toLowerCase();
  return str === 'true' || str === '1';
}

/**
 * Extrahiert den Anzeigetext aus einer Google-Sheets-HYPERLINK-Formel.
 * Falls kein HYPERLINK vorhanden, den ursprünglichen Wert zurückgeben.
 * @param {string} value
 * @returns {string}
 */
export function extractDisplayTextFromHyperlink(value) {
  if (!value) return '';
  const text = String(value);
  const match = /=HYPERLINK\((?:"[^"]+"|[^,;]+)[,;]\s*"([^"]+)"\)/i.exec(text);
  return match ? match[1] : text;
}

/**
 * Wandelt einen 1-basierten Spaltenindex in A1-Notation um.
 * Beispiele: 1 → "A", 26 → "Z", 27 → "AA"
 * @param {number} col  1-basierter Spaltenindex
 * @returns {string}
 */
export function colToA1(col) {
  let n = col;
  let result = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    result = String.fromCharCode(65 + rem) + result;
    n = Math.floor((n - 1) / 26);
  }
  return result;
}
