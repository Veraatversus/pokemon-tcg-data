// Bild-URLs aus dem reduzierten assets.tcgdex.net-Index (nur wenn vorhanden).
const BASE = 'https://assets.tcgdex.net';

// Unterset-Karten (Galerien, Shiny Vault) liegen im CDN unter dem Pfad des Eltern-Sets
// (parentSetId); der eigene Set-Pfad gewinnt, wenn er das Asset fuehrt.
export function resolveImages(index, { lang, serieId, setId, localId, parentSetId }) {
  for (const id of new Set([setId, parentSetId].filter(Boolean))) {
    if (!index?.[lang]?.[serieId]?.[id]?.[localId]) continue;
    const base = `${BASE}/${lang}/${serieId}/${id}/${localId}`;
    return { small: `${base}/low.webp`, large: `${base}/high.webp` };
  }
  return null;
}

// Set-Assets: je Asset erst .webp, dann .png. Logos je Sprache; das Symbol fuehrt der Index unter
// `univ`, der CDN liefert univ-Pfade aber nie (HTTP 400) - ausgeliefert wird es unter /en/.
const variants = (p) => [`${p}.webp`, `${p}.png`];
const logoVariants = (lang, serieId, setId) => variants(`${BASE}/${lang}/${serieId}/${setId}/logo`);
const symbolVariants = (serieId, setId) => variants(`${BASE}/en/${serieId}/${setId}/symbol`);

// Alle zu pruefenden Set-Asset-Gruppen ([webp, png]) in stabiler Reihenfolge.
export function setAssetCandidates(index) {
  const out = [];
  for (const lang of ['en', 'de']) {
    for (const [serieId, sets] of Object.entries(index?.[lang] ?? {})) {
      for (const [setId, assets] of Object.entries(sets ?? {})) if (assets?.logo) out.push(logoVariants(lang, serieId, setId));
    }
  }
  for (const [serieId, sets] of Object.entries(index?.univ ?? {})) {
    for (const [setId, assets] of Object.entries(sets ?? {})) if (assets?.symbol) out.push(symbolVariants(serieId, setId));
  }
  return out;
}

// Erste Variante, die nicht als fehlend verifiziert ist (unbekannt = ausgeben).
const pick = (urls, verified) => urls.find((u) => verified?.[u]?.status !== 'missing');

export function resolveSetImages(index, verified, { lang, serieId, setId }) {
  const out = {};
  const logo = index?.[lang]?.[serieId]?.[setId]?.logo ? pick(logoVariants(lang, serieId, setId), verified) : undefined;
  const symbol = index?.univ?.[serieId]?.[setId]?.symbol ? pick(symbolVariants(serieId, setId), verified) : undefined;
  if (logo) out.logo = logo;
  if (symbol) out.symbol = symbol;
  return out;
}
