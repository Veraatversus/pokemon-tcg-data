// Reine Hilfsfunktionen fuer Set-IDs (frueher in pokecode-compat.js).

/**
 * Normalisiert eine Set-ID fuer tolerante Vergleiche:
 * Kleinbuchstaben, "12.5" -> "12pt5", Leerzeichen -> "-", Sonderzeichen weg, fuehrende Nullen weg.
 * Beispiele: "SV3.5" -> "sv3pt5", "swsh012" -> "swsh12".
 */
export function normalizeSetId(setId) {
  if (!setId) return '';
  let normalized = String(setId).toLowerCase().trim();
  normalized = normalized.replace(/(\d+)\.(\d+)/g, (_match, p1, p2) => `${parseInt(p1, 10)}pt${parseInt(p2, 10)}`);
  normalized = normalized.replace(/\s+/g, '-');
  normalized = normalized.replace(/[^a-z0-9-]/g, '');
  normalized = normalized.replace(/([a-z-]+)(\d+)/g, (_match, p1, p2) => p1 + parseInt(p2, 10));
  return normalized;
}
