// Bild-URLs aus dem reduzierten assets.tcgdex.net-Index (nur wenn vorhanden).
const BASE = 'https://assets.tcgdex.net';

export function resolveImages(index, { lang, serieId, setId, localId }) {
  const hash = index?.[lang]?.[serieId]?.[setId]?.[localId];
  if (!hash) return null;
  const base = `${BASE}/${lang}/${serieId}/${setId}/${localId}`;
  return { small: `${base}/low.webp`, large: `${base}/high.webp` };
}

export function resolveSetImages(index, { lang, serieId, setId }) {
  const out = {};
  if (index?.[lang]?.[serieId]?.[setId]?.logo) out.logo = `${BASE}/${lang}/${serieId}/${setId}/logo.webp`;
  if (index?.univ?.[serieId]?.[setId]?.symbol) out.symbol = `${BASE}/univ/${serieId}/${setId}/symbol.webp`;
  return out;
}
