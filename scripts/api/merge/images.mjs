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

// Kartenbilder von Sets, die der Assets-Index (assets.tcgdex.net/datas.json) noch nicht fuehrt.
// Der Index hinkt dem CDN hinterher (neue Sets haben Bilder, stehen aber tagelang nicht drin) und manche Sets
// sind im CDN nur teilweise bebildert (Promos). Je Set und Sprache wird zuerst eine Stichprobe geprueft (erste und
// letzte numerische Karte, cardSampleCandidates); besteht davon mindestens eine, wird jede Karte einzeln geprueft
// (cardImageCandidates, verify-assets.mjs) und nur Karten mit eigenem 'ok' kommen in den Index. Sobald der Index
// das Set fuehrt, gilt wieder nur der Index. sets: [{ id, serieId, cards: [{ localId }] }] (TCGdex-Datenbank).
const decodeId = (id) => {
  try {
    return decodeURIComponent(id);
  } catch {
    return id;
  }
};
// Stichprobe nur ueber rein numerische localIds, wenn es welche gibt: Sonderkarten mit Buchstaben
// (30th: B, G, R) fehlen im CDN oft auch dann, wenn das Hauptset da ist.
const sampledIds = (s) => {
  const ids = s.cards.map((c) => c.localId).sort(sortLocalIds);
  const numeric = ids.filter((id) => /^\d+$/.test(decodeId(id)));
  return numeric.length ? numeric : ids;
};
const cardUrl = (lang, serieId, setId, localId) => `${BASE}/${lang}/${serieId}/${setId}/${encodeURIComponent(decodeId(localId))}/low.webp`;
const isOk = (verified, url) => verified?.[url]?.status === 'ok';

export function cardSampleCandidates(index, sets, langs = ['en', 'de']) {
  const out = [];
  for (const lang of langs) {
    for (const s of sets ?? []) {
      if (!s?.serieId || !s?.id || !s.cards?.length || index?.[lang]?.[s.serieId]?.[s.id]) continue;
      const ids = sampledIds(s);
      const sample = [...new Set([ids[0], ids[ids.length - 1]])];
      out.push({ lang, serieId: s.serieId, setId: s.id, urls: sample.map((id) => cardUrl(lang, s.serieId, s.id, id)) });
    }
  }
  return out;
}

// Sets/Sprachen mit mindestens einer bestandenen Stichprobe: jede Karte einzeln ({ ..., ids, urls } gleich lang).
export function cardImageCandidates(index, sets, verified, langs = ['en', 'de']) {
  const out = [];
  for (const c of cardSampleCandidates(index, sets, langs)) {
    if (!c.urls.some((u) => isOk(verified, u))) continue;
    const s = sets.find((x) => x.id === c.setId && x.serieId === c.serieId);
    const ids = s.cards.map((x) => x.localId).sort(sortLocalIds);
    out.push({ ...c, ids, urls: ids.map((id) => cardUrl(c.lang, c.serieId, c.setId, id)) });
  }
  return out;
}

// Neuer Index (Eingabe unveraendert): je Set/Sprache die Karten, deren eigenes Bild 'ok' ist (localIds dekodiert).
export function withSampledCardImages(index, sets, verified, langs = ['en', 'de']) {
  const out = { ...(index ?? {}) };
  for (const c of cardImageCandidates(index, sets, verified, langs)) {
    const entries = Object.fromEntries(c.ids.filter((id, i) => isOk(verified, c.urls[i])).map((id) => [decodeId(id), 'verified']));
    if (!Object.keys(entries).length) continue;
    out[c.lang] = { ...out[c.lang], [c.serieId]: { ...out[c.lang]?.[c.serieId], [c.setId]: entries } };
  }
  return out;
}

// Rueckfall Scrydex (Nachfolger von pokemontcg.io; Bilder ohne API-Schluessel abrufbar): nur fuer Karten, die
// weder ein EN- noch ein DE-Bild haben, und nur in Sets mit pokemontcg-ID (nicht TCGDEX-*), denn Scrydex nutzt
// deren Karten-IDs (<setId>-<cardId>). Fehlende Karten liefert Scrydex mit 200 und Kartenrueckseite aus; das
// erkennt verify-assets.mjs (scrydexProbe) und fuehrt sie als 'missing'. Uebernommen wird nur verifiziertes 'ok'.
export const SCRYDEX_BASE = 'https://images.scrydex.com/pokemon';
export const scrydexImages = (cardId) => {
  const base = `${SCRYDEX_BASE}/${encodeURIComponent(cardId)}`;
  return { small: `${base}/small`, large: `${base}/large` };
};
const filled = (v) => typeof v === 'string' && v.trim() !== '';
const isScrydex = (url) => filled(url) && url.startsWith(`${SCRYDEX_BASE}/`);
const scrydexEligible = (card) => typeof card?.id === 'string' && !card.id.startsWith('TCGDEX-')
  && !filled(card.i18n?.de?.images?.small) && (!filled(card.images?.small) || isScrydex(card.images.small));

// Zu pruefende Scrydex-URLs aus den zuletzt veroeffentlichten Karten: Karten ohne Bild und Karten, deren Bild
// schon von Scrydex kommt (sonst fiele ein bestaetigtes Bild am naechsten Tag aus der Pruefliste).
export function scrydexCandidates(cards) {
  return [...new Set((cards ?? []).filter(scrydexEligible).map((c) => scrydexImages(c.id).small))];
}

// Setzt images bei Karten ohne jedes Bild, wenn das Scrydex-Bild verifiziert ist. Aendert die Karten, liefert die Anzahl.
export function applyScrydexImages(cards, verified) {
  let n = 0;
  for (const card of cards ?? []) {
    if (!scrydexEligible(card) || filled(card.images?.small)) continue;
    const images = scrydexImages(card.id);
    if (!isOk(verified, images.small)) continue;
    card.images = images;
    n++;
  }
  return n;
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
