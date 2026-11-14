// Sortierung von Kartennummern (localId): Praefix, Zahl, Suffix. Frueher in scripts/cardmarket/tcgdex-helper.
function splitLocalId(value) {
  const text = String(value || '').trim();
  const match = /^([A-Za-z]*)(\d+)([A-Za-z]*)$/i.exec(text);
  if (!match) {
    return {
      prefix: text.toLowerCase(),
      numeric: Number.MAX_SAFE_INTEGER,
      suffix: '',
      raw: text,
    };
  }

  return {
    prefix: match[1].toLowerCase(),
    numeric: Number(match[2]),
    suffix: match[3].toLowerCase(),
    raw: text,
  };
}

export function sortLocalIds(left, right) {
  const leftParts = splitLocalId(left);
  const rightParts = splitLocalId(right);

  if (leftParts.prefix !== rightParts.prefix) {
    if (!leftParts.prefix) return -1;
    if (!rightParts.prefix) return 1;
    return leftParts.prefix.localeCompare(rightParts.prefix, 'en');
  }

  if (leftParts.numeric !== rightParts.numeric) {
    return leftParts.numeric - rightParts.numeric;
  }

  if (leftParts.suffix !== rightParts.suffix) {
    if (!leftParts.suffix) return -1;
    if (!rightParts.suffix) return 1;
    return leftParts.suffix.localeCompare(rightParts.suffix, 'en');
  }

  return leftParts.raw.localeCompare(rightParts.raw, 'en', { numeric: true });
}
