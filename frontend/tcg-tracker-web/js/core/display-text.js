const MOJIBAKE_REPLACEMENTS = [
  ['Ã¤', 'ae'],
  ['Ã„', 'Ae'],
  ['Ã¶', 'oe'],
  ['Ã–', 'Oe'],
  ['Ã¼', 'ue'],
  ['Ãœ', 'Ue'],
  ['ÃŸ', 'ss'],
  ['â€“', '-'],
  ['â€”', '-'],
  ['â€¦', '...'],
  ['â€¢', '-'],
  ['â€ž', '"'],
  ['â€œ', '"'],
  ['â€˜', "'"],
  ['â€™', "'"],
  ['â€ ', '"'],
  ['â€', '"'],
  ['Â·', ' - '],
  ['Â', ''],
];

export function sanitizeDisplayText(value, fallback = '') {
  const raw = String(value ?? '').trim();
  if (!raw) return fallback;

  let text = raw;
  for (const [needle, replacement] of MOJIBAKE_REPLACEMENTS) {
    text = text.split(needle).join(replacement);
  }

  return text
    .replace(/\uFFFD+/g, ' - ')
    .replace(/\s*[\uFFFD|]+\s*/g, ' - ')
    .replace(/\s*[-]{2,}\s*/g, ' - ')
    .replace(/\s*·\s*/g, ' - ')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s*[-]\s*[-]\s*/g, ' - ')
    .replace(/^[-\s]+|[-\s]+$/g, '')
    .trim() || fallback;
}
