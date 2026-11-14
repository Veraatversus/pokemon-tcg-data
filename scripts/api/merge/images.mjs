// Bild-URLs aus dem reduzierten assets.tcgdex.net-Index (nur wenn vorhanden).
import { sortLocalIds } from '../lib/local-ids.mjs';

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

// Stichproben fuer Kartenbilder von Sets, die der Assets-Index (assets.tcgdex.net/datas.json) noch nicht fuehrt.
// Der Index hinkt dem CDN hinterher (neue Sets haben Bilder, stehen aber tagelang nicht drin). Je Set und Sprache
// werden erste und letzte Karte geprueft (verify-assets.mjs); sind beide da, gelten alle Karten als vorhanden.
// Einzelne Luecken faengt das Frontend ab (Bild-Fallback DE -> EN -> Legacy). Sobald der Index das Set fuehrt,
// gilt wieder nur der Index. sets: [{ id, serieId, cards: [{ localId }] }] (TCGdex-Datenbank).
const decodeId = (id) => {
  try {
    return decodeURIComponent(id);
  } catch {
    return id;
  }
};
// Stichprobe und Uebernahme nur fuer rein numerische localIds, wenn es welche gibt: Sonderkarten mit Buchstaben
// (30th: B, G, R) fehlen im CDN oft auch dann, wenn das Hauptset da ist, und behalten ihr bisheriges Bild.
const sampledIds = (s) => {
  const ids = s.cards.map((c) => c.localId).sort(sortLocalIds);
  const numeric = ids.filter((id) => /^\d+$/.test(decodeId(id)));
  return numeric.length ? numeric : ids;
};
const sampleUrl =(lang, serieId, setId, localId) => `${BASE}/${lang}/${serieId}/${setId}/${encodeURIComponent(decodeId(localId))}/low.webp`;

export function cardSampleCandidates(index, sets, langs = ['en', 'de']) {
  const out = [];
  for (const lang of langs) {
    for (const s of sets ?? []) {
      if (!s?.serieId || !s?.id || !s.cards?.length || index?.[lang]?.[s.serieId]?.[s.id]) continue;
      const ids = sampledIds(s);
      const sample = [...new Set([ids[0], ids[ids.length - 1]])];
      out.push({ lang, serieId: s.serieId, setId: s.id, urls: sample.map((id) => sampleUrl(lang, s.serieId, s.id, id)) });
    }
  }
  return out;
}

// Neuer Index (Eingabe unveraendert): Sets mit bestandener Stichprobe bekommen alle Karten-localIds (dekodiert).
export function withSampledCardImages(index, sets, verified, langs = ['en', 'de']) {
  const out = { ...(index ?? {}) };
  for (const c of cardSampleCandidates(index, sets, langs)) {
    if (!c.urls.every((u) => verified?.[u]?.status === 'ok')) continue;
    const s = sets.find((x) => x.id === c.setId && x.serieId === c.serieId);
    const entries = Object.fromEntries(sampledIds(s).map((id) => [decodeId(id), 'sampled']));
    out[c.lang] = { ...out[c.lang], [c.serieId]: { ...out[c.lang]?.[c.serieId], [c.setId]: entries } };
  }
  return out;
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
