// Kartensuche direkt ueber api/v3/search-index.json (einmal je Session geladen, SW-Cache 24 h).
// Kartendateien je Set (api/v3/cards/<set>.json) werden fuer die Suche nicht mehr geladen; nur die
// Detailansicht (Lightbox) laedt das eine Set der angeklickten Karte nach.
//
// Durchsucht werden je Indexeintrag: Name (EN), Name DE, Nummer, Kuenstler, Typen (EN und DE), Seltenheit, Supertyp
// sowie die Set-Felder (Name, Kuerzel, Serie, Set-ID). Attacken-/Faehigkeitstexte stehen nicht im Index
// und werden nicht durchsucht (bewusster Tausch gegen sofortige Treffer).
// Regeln: Gross-/Kleinschreibung und Diakritika egal ("pokemon" = "Pokémon"); jedes Suchwort muss
// irgendein Feld treffen. Reine Zahlen treffen die Kartennummer (fuehrende Nullen egal) oder ein ganzes
// Wort der Set-Felder (z. B. "151").
import { loadV3SearchIndex } from '../../data/v3-api.js';
import { buildCardmarketProductUrl, normalizeCardmarketProductId } from '../../data/cardmarket-url-utils.js';

const lower = (value) => String(value ?? '').trim().toLowerCase();
const text = (value) => String(value ?? '').trim();
const NUMBER_LIKE = /^[a-z._-]*\d+[a-z._-]*$/;
const DIGITS_ONLY = /^\d+$/;
// Nummern-Sortierung (numerisch, ohne Gross-/Kleinschreibung); einmal je Modul statt je Vergleich.
const NUMBER_COLLATOR = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
// Der Index fuehrt Energietypen englisch; deutsche Namen treffen dieselben Karten.
const TYPE_NAMES_DE = {
  Grass: 'Pflanze',
  Fire: 'Feuer',
  Water: 'Wasser',
  Lightning: 'Elektro',
  Psychic: 'Psycho',
  Fighting: 'Kampf',
  Darkness: 'Finsternis',
  Metal: 'Metall',
  Dragon: 'Drache',
  Fairy: 'Fee',
  Colorless: 'Farblos'
};
const withGermanTypeNames = (types) => (Array.isArray(types) ? types : [])
  .flatMap((type) => [type, TYPE_NAMES_DE[text(type)]])
  .filter(Boolean);

/** Kleinbuchstaben ohne Diakritika, Leerraum zusammengefasst. */
export function normalizeSearchValue(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenize(query) {
  return normalizeSearchValue(query)
    .split(' ')
    .map((token) => token.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ''))
    .filter(Boolean);
}

// "GG01" -> "gg1", "057/198" -> "57"
function normalizeNumber(value) {
  return lower(value).split('/')[0].replace(/^#/, '').replace(/\d+/g, (digits) => digits.replace(/^0+(?=\d)/, ''));
}

const firstDigits = (value) => (value.match(/\d+/) || [''])[0];

function numberMatches(prepared, token) {
  const wanted = normalizeNumber(token);
  if (!wanted) return false;
  if (prepared.number === wanted || prepared.cardId === wanted) return true;
  return DIGITS_ONLY.test(wanted) && firstDigits(prepared.number) === wanted;
}

const joinValues = (values) => values.flat().map(normalizeSearchValue).filter(Boolean).join(' | ');

// Vorbereitete Suchfelder je Index (einmal je Index-Array).
const preparedByIndex = new WeakMap();

function prepareIndex(index) {
  let prepared = preparedByIndex.get(index);
  if (prepared) return prepared;
  prepared = index.map((entry) => {
    const names = [entry?.name, entry?.nameDe].map(normalizeSearchValue).filter(Boolean);
    return {
      entry,
      setKey: lower(entry?.setId),
      names,
      nameText: names.join(' | '),
      fieldText: joinValues([entry?.artist, withGermanTypeNames(entry?.types), entry?.rarity, entry?.supertype].filter(Boolean)),
      number: normalizeNumber(entry?.number),
      cardId: normalizeNumber(entry?.cardId),
      numberSort: text(entry?.number)
    };
  });
  preparedByIndex.set(index, prepared);
  return prepared;
}

// Set-Lookup: kanonische ID und Aliase -> { set, order, id, text, words }.
function buildSetLookup(sets) {
  if (!Array.isArray(sets)) return null;
  const lookup = new Map();
  sets.forEach((set, order) => {
    const id = lower(set?.setId);
    if (!id) return;
    const setText = joinValues([
      set.setName, set.vera_name, set.tcgdex_name, set.series, set.vera_series, set.tcgdex_serie_name,
      set.ptcgoCode, set.vera_ptcgoCode, set.tcgdex_abbreviation_official, set.setId
    ].filter(Boolean));
    const info = { set, order, id, text: setText, words: new Set(setText.split(/[^\p{L}\p{N}]+/u).filter(Boolean)) };
    if (!lookup.has(id)) lookup.set(id, info);
    (Array.isArray(set.aliases) ? set.aliases : []).forEach((alias) => {
      const key = lower(alias);
      if (key && !lookup.has(key)) lookup.set(key, info);
    });
  });
  return lookup;
}

const NO_SET = { set: null, order: Number.MAX_SAFE_INTEGER, id: '', text: '', words: new Set() };

function tokenMatches(prepared, setInfo, token) {
  if (DIGITS_ONLY.test(token)) return numberMatches(prepared, token) || setInfo.words.has(token);
  return prepared.nameText.includes(token)
    || prepared.fieldText.includes(token)
    || setInfo.text.includes(token)
    || (NUMBER_LIKE.test(token) && numberMatches(prepared, token));
}

function nameScore(prepared, phrase, tokens) {
  if (!phrase) return 0;
  if (prepared.names.some((name) => name === phrase)) return 400;
  if (prepared.names.some((name) => name.startsWith(phrase))) return 300;
  if (prepared.names.some((name) => name.includes(phrase))) return 220;
  if (tokens.some((token) => prepared.nameText.includes(token))) return 100;
  return 0;
}

/**
 * Treffer im Index, sortiert (Name exakt > Namensanfang > Name enthaelt > sonstige; dann Set-Reihenfolge, Nummer).
 * @param {object[]} index Eintraege { setId, cardId, number, name, nameDe?, img?, imgDe?, types?, rarity?, artist?, supertype? }
 * @param {string} query freie Suche
 * @param {{ sets?: object[]|null, setFilter?: string, language?: string }} [options]
 *   sets: Suchbereich (nur Eintraege dieser Sets, auch ueber `aliases`) und Set-Felder; null = alle Eintraege.
 *   setFilter: nur dieses Set (ID oder Alias). Ohne Suchwort liefert ein setFilter das ganze Set.
 * @returns {{ entry: object, set: object|null, score: number }[]}
 */
export function searchIndexResults(index, query, { sets = null, setFilter = '' } = {}) {
  if (!Array.isArray(index)) return [];
  const tokens = tokenize(query);
  const phrase = tokens.join(' ');
  const lookup = buildSetLookup(sets);
  const filterKey = lower(setFilter);
  const filterId = filterKey ? (lookup?.get(filterKey)?.id || filterKey) : '';
  if (!tokens.length && !filterId) return [];

  const hits = [];
  for (const prepared of prepareIndex(index)) {
    const setInfo = lookup ? lookup.get(prepared.setKey) : NO_SET;
    if (!setInfo) continue;
    if (filterId && (setInfo.id || prepared.setKey) !== filterId) continue;
    if (!tokens.every((token) => tokenMatches(prepared, setInfo, token))) continue;
    hits.push({ prepared, setInfo, score: nameScore(prepared, phrase, tokens) });
  }

  hits.sort((a, b) => (b.score - a.score)
    || (a.setInfo.order - b.setInfo.order)
    || NUMBER_COLLATOR.compare(a.prepared.numberSort, b.prepared.numberSort));
  return hits.map(({ prepared, setInfo, score }) => ({ entry: prepared.entry, set: setInfo.set, score }));
}

/** Wie searchIndexResults, nur die Indexeintraege. */
export function searchIndexEntries(index, query, options = {}) {
  return searchIndexResults(index, query, options).map((result) => result.entry);
}

/** Laedt den Index (gecacht je Session) und sucht darin. Kein Laden von Kartendateien. */
export async function searchFromIndex(query, options = {}, { loadIndex = loadV3SearchIndex, signal } = {}) {
  const index = await loadIndex({ signal });
  if (!Array.isArray(index)) throw new Error('search-index.json hat kein gueltiges Format');
  return searchIndexResults(index, query, options);
}

/**
 * Anzeige-Karte aus einem Indexeintrag: collectionKey = cardId (Sammlungsschluessel unter der kanonischen
 * setId), Bilder in der Form, die image-fallback.js versteht (img -> EN klein, imgDe -> DE klein).
 */
export function indexEntryToCard(entry, { language = 'de' } = {}) {
  const name = text(entry?.name);
  const nameDe = text(entry?.nameDe);
  const img = text(entry?.img);
  const imgDe = text(entry?.imgDe);
  const card = {
    setId: text(entry?.setId),
    cardId: text(entry?.cardId),
    collectionKey: text(entry?.cardId),
    number: text(entry?.number),
    name: (language === 'en' ? name || nameDe : nameDe || name),
    vera_name: name,
    tcgdex_name: nameDe,
    artist: text(entry?.artist),
    rarity: text(entry?.rarity),
    types: Array.isArray(entry?.types) ? [...entry.types] : [],
    supertype: text(entry?.supertype),
    images: img ? { small: img } : {}
  };
  if (nameDe || imgDe) card.i18n = { de: { name: nameDe, images: imgDe ? { small: imgDe } : {} } };
  // cm = Cardmarket-Produkt-ID der Karte (primaere ID, siehe primaryCardmarketProductId); Link in Kartensprache, Preis ueber
  // die Cardmarket-Setdatei (resolveCardmarketEntryForCard), ohne Kartendatei des Sets.
  const cardmarketProductId = normalizeCardmarketProductId(entry?.cm);
  if (cardmarketProductId) {
    card.cardmarketProductId = Number(cardmarketProductId);
    card.cardmarketUrl = buildCardmarketProductUrl(cardmarketProductId, { language });
  }
  return card;
}

/**
 * Anzeige-Ergebnisse fuer die ersten `limit` Treffer: Karten-Objekte entstehen nur fuer gezeigte
 * Treffer (eine Suche wie "pokemon" trifft ~20 000 Indexeintraege).
 * @returns {{ card: object, set: object|null, score: number }[]}
 */
export function searchResultsForDisplay(hits, { limit = Infinity, language = 'de' } = {}) {
  if (!Array.isArray(hits)) return [];
  return hits.slice(0, limit).map(({ entry, set, score }) => ({ card: indexEntryToCard(entry, { language }), set, score }));
}
