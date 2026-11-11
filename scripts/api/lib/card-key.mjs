// Schluesselvertrag: identisch zu normalizeCardNumber im Frontend
// (frontend/tcg-tracker-web/js/core/utils.js). Paritaet per Golden-Test gesichert.
export function normalizeCardNumber(cardNumber) {
  if (cardNumber === null || cardNumber === undefined) return '';
  let normalized = String(cardNumber).trim();
  if (!normalized) return '';

  const slashIndex = normalized.indexOf('/');
  if (slashIndex > 0) {
    normalized = normalized.slice(0, slashIndex).trim();
  }

  const match = normalized.match(/^([a-zA-Z._-]*?)(\d+)([a-zA-Z._-]*)$/);
  if (!match) return normalized;
  const prefix = match[1];
  const numericPart = parseInt(match[2], 10).toString();
  const suffix = match[3];
  return `${prefix}${numericPart}${suffix}`;
}

export function cardMatchKey(value) {
  return normalizeCardNumber(value).toLowerCase();
}
