// Traegt Cardmarket-Produkt-IDs fuer Karten nach, denen TCGdex keine liefert (ids.cardmarket leer).
// Quelle: sources/cardmarket/catalog.jsonl (nur Pokémon-Singles, ohne Nummern) und
// sources/cardmarket/custom-sets/<expansionId>.json (Nummern aus Cardmarket-HTML), geladen ueber
// scripts/api/sources/cardmarket-catalog.mjs. Nummernregeln greifen daher nur in Expansionen mit custom-set.
//
// Stufen je Karte (erste eindeutige gewinnt): 1. Override, 2. custom-set (exakte Nummer inkl. Zusatz),
// 3. TCGdex-ID (Expansions-/Doppelpruefung), 4. Regeln unten, 5. leer. Danach Stabilitaetsregel (previous).
//
// Regeln (kein Raten):
// - Kandidaten: Produkte der Expansion mit gleicher normalisierter Nummer UND gleichem normalisierten Namen.
// - Gibt es keinen, nur per Name: genau EIN Produkt dieses Namens in der ganzen Expansion, und es hat
//   collectorNumber null.
// - Produkte, die eine TCGdex-ID schon belegt, sind keine Kandidaten.
// - Genau ein Kandidat -> ids.cardmarket = [id], ids.cardmarketSource = 'matched'; mehrere -> leer (mehrdeutig).
// - Bekaemen zwei Karten dasselbe Produkt, bleiben beide leer (mehrdeutig).
// - Eine vorhandene TCGdex-ID wird nie ueberschrieben (ausser per Override, s. u.).
// - Produkte mit "[Oversized]" im Namen sind nie Kandidaten (auch nicht fuer Korrekturen).
// - Ohne Treffer: Cardmarkets Energie-Symbole im Namen ("Bubbly [W] Energy" = "Bubbly Water Energy").
// - Danach je (Expansion, Name), wenn alle gleichnamigen Karten noch offen sind und die gleichnamigen
//   Produkte alle ohne collectorNumber und frei sind: zwei Karten mit aufeinanderfolgenden Nummern <->
//   "[Left]"/"[Right]" (leftRight), sonst gleich viele Karten wie identisch benannte Produkte ->
//   aufsteigende Nummer <-> aufsteigende Produkt-ID (ordered). Sonst nichts.
// - Overrides (api/mappings/cardmarket-overrides.json, "<setId>/<cardId>": id | null) gewinnen vor allem.
// Unterset-Karten (in ein Haupt-Set gemergt) suchen in der Expansion ihres TCGdex-Untersets, sonst in der
// des Haupt-Sets; finden sie dort nichts, bleiben sie leer und stehen in subsetMissing.

const SINGLE_CATEGORY_ID = 51;
const SINGLE_CATEGORY = 'Pokémon Single';

export function normalizeCmNumber(value) {
  if (value === undefined || value === null) return null;
  const s = String(value).trim().toLowerCase();
  if (!s) return null;
  const m = /^([a-z]*)0*(\d+)(.*)$/.exec(s);
  return m ? `${m[1]}${m[2]}${m[3]}` : s;
}

// Klammerzusaetze ([Angriffe], [F], [A]) und Cardmarkets Level-Angabe "Lv.44" (nicht "LV.X") fallen weg,
// "★" entspricht "Gold Star", "Delta Species" ist bei Cardmarket nur ein Zusatz zu "δ".
// Danach ohne Diakritika, klein, nur Buchstaben und Ziffern.
export function normalizeCmName(value) {
  return String(value ?? '')
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/\bLv\.\s*\d+/gi, ' ')
    .replace(/★/g, ' gold star ')
    .replace(/\bdelta species\b/gi, ' ')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, '');
}

const OVERSIZED = /\[\s*oversized\s*\]/i;
// Nur ein einzelnes Energie-Buchstaben-Token, auf das noch Namenstext folgt (nicht die Angriffsklammer
// und nicht "Nidoran [F] [Angriffe]", dort ist [F] das Geschlecht).
const ENERGY_TOKEN = /\[([GRWLPFDMYNC])\](?=\s*[^\s[])/g;
const ENERGY_WORDS = {
  G: 'Grass', R: 'Fire', W: 'Water', L: 'Lightning', P: 'Psychic', F: 'Fighting', D: 'Darkness', M: 'Metal', Y: 'Fairy', N: 'Dragon', C: 'Colorless',
};
// Normalisierter Name mit ausgeschriebenen Energie-Symbolen, null ohne solches Token.
export function cmEnergyName(cmName) {
  const raw = String(cmName ?? '');
  if (!raw.match(ENERGY_TOKEN)) return null;
  return normalizeCmName(raw.replace(ENERGY_TOKEN, (_, l) => ` ${ENERGY_WORDS[l]} `));
}
// Versions-Suffix der Custom-Sets (sources/cardmarket/custom-sets): "4V2", "224a" (normalisiert).
const VERSION_SUFFIX = /^\d+(v\d+|[a-z])$/;
// Basisnummer einer normalisierten custom-set-Nummer: "4v2" -> "4", "h25v3" -> "h25", "224a" -> "224".
export function customSetBase(normalized) {
  return String(normalized ?? '').replace(/v\d+$/, '').replace(/^(\d+)[a-z]$/, '$1');
}
const HALF = /\[(left|right)\]\s*$/i;

const isSingle = (p) => p?.categoryId === SINGLE_CATEGORY_ID || p?.categoryName === SINGLE_CATEGORY;

// Nachsichtiger Namensvergleich, nur fuer die Frage "zeigt diese vorhandene ID auf ein falsches Produkt?"
// (nie zum Finden): Cardmarket schreibt Kurz-Tags in Klammern ("Lucario [GL]", "Growing [G] Energy"),
// Basis-Energien mit "Basic" und Varianten mit Untertitel ("Professor's Research - Professor Oak").
const GREEK = { α: ' alpha ', β: ' beta ', γ: ' gamma ', δ: ' delta ' };
export function cmNameMatches(cmName, cardName) {
  const card = normalizeCmName(cardName);
  if (!card) return false;
  // Cardmarket schreibt griechische Buchstaben aus ("Mystery Plate delta" = "Mystery Plate δ").
  const cards = new Set([card, normalizeCmName(String(cardName).replace(/[αβγδ]/g, (g) => GREEK[g]))]);
  const raw = String(cmName ?? '');
  const forms = [raw, raw.replace(/\[([^\]|]{1,4})\]/g, ' $1 '), raw.replace(/^Basic\s+/i, ''), raw.split(' - ')[0]];
  return forms.some((f) => cards.has(normalizeCmName(f)));
}

// Primaere Cardmarket-ID einer Karte (gleiche Regel im Frontend), je erste Variante mit cardmarketId:
// ungestempelt und nicht Jumbo (size "jumbo"), sonst nicht Jumbo, sonst ungestempelt, sonst irgendeine,
// sonst ids.cardmarket[0]. Karten nur mit Jumbo-Variante behalten deren ID.
export function primaryCardmarketId(card) {
  const variants = (card?.variants ?? []).filter((v) => typeof v?.cardmarketId === 'number');
  const stamped = (v) => (Array.isArray(v.stamp) ? v.stamp.length > 0 : Boolean(v.stamp));
  const jumbo = (v) => v.size === 'jumbo';
  const id = (variants.find((v) => !stamped(v) && !jumbo(v)) ?? variants.find((v) => !jumbo(v))
    ?? variants.find((v) => !stamped(v)) ?? variants[0])?.cardmarketId ?? card?.ids?.cardmarket?.[0];
  return typeof id === 'number' ? id : undefined;
}

function indexExpansion(expansion) {
  const byNumber = new Map();
  const byName = new Map();
  const byEnergy = new Map();
  const all = []; // kandidatenfaehige Singles
  const oversized = [];
  const byId = new Map(); // alle Produkte der Datei, fuer die Pruefung vorhandener IDs
  const customSet = new Map(); // normalisierte custom-set-Nummer -> [Produkt]
  for (const p of expansion?.cards ?? []) {
    if (typeof p.cardmarketProductId === 'number') byId.set(p.cardmarketProductId, p);
    if (!isSingle(p) || typeof p.cardmarketProductId !== 'number') continue;
    if (OVERSIZED.test(String(p.name ?? ''))) { oversized.push({ productId: p.cardmarketProductId, name: p.name }); continue; }
    const entry = {
      id: p.cardmarketProductId, number: normalizeCmNumber(p.collectorNumber), name: normalizeCmName(p.name), attacks: cmAttackKey(p.name),
      raw: String(p.name ?? ''), energy: cmEnergyName(p.name),
    };
    all.push(entry);
    if (p.customSet && entry.number) customSet.set(entry.number, [...(customSet.get(entry.number) ?? []), entry]);
    if (entry.energy) byEnergy.set(entry.energy, [...(byEnergy.get(entry.energy) ?? []), entry]);
    if (entry.number) byNumber.set(entry.number, [...(byNumber.get(entry.number) ?? []), entry]);
    byName.set(entry.name, [...(byName.get(entry.name) ?? []), entry]);
  }
  return { byNumber, byName, byId, byEnergy, all, oversized, customSet };
}

// Angriffs-/Faehigkeitsnamen als reihenfolgefreier Schluessel ("" = keine).
const attackKey = (names) => [...new Set(names.map((n) => normalizeCmName(n)).filter((n) => n && !/^\d+$/.test(n)))].sort().join('|');
// Cardmarket: letzte Klammer des Produktnamens ("Pikachu [Lonely Gaze | Pika Ball]"); reine Zahlen fallen weg.
export function cmAttackKey(cmName) {
  const groups = [...String(cmName ?? '').matchAll(/\[([^\]]*)\]/g)];
  return groups.length ? attackKey(groups.at(-1)[1].split('|')) : '';
}
// v3-Karte: EN-Angriffe und -Faehigkeiten.
export function cardAttackKey(card) {
  return attackKey([...(card?.attacks ?? []), ...(card?.abilities ?? [])].map((a) => a?.name ?? ''));
}

// Gleichnamige Produkte ohne Nummer: genau eines mit denselben Angriffs-/Faehigkeitsnamen -> dieses.
function byAttacks(card, sameName) {
  const key = cardAttackKey(card);
  if (!key) return null;
  const equal = sameName.filter((p) => p.attacks === key);
  return equal.length === 1 && equal[0].number === null ? equal[0] : null;
}

// -> { id } | { ambiguous: true } | null
function matchOne(card, index, taken) {
  const name = normalizeCmName(card.name);
  if (!name) return null;
  const number = normalizeCmNumber(card.number);
  const byNumber = (index.byNumber.get(number) ?? []).filter((p) => p.name === name && !taken.has(p.id));
  if (byNumber.length === 1) return { id: byNumber[0].id };
  if (byNumber.length > 1) return { ambiguous: true };
  const sameName = index.byName.get(name) ?? [];
  const unnumbered = sameName.filter((p) => p.number === null && !taken.has(p.id));
  if (sameName.length === 1 && unnumbered.length === 1) return { id: unnumbered[0].id };
  // Unnummerierte Kandidaten, aber der Name ist in der Expansion nicht eindeutig -> Angriffe entscheiden
  if (unnumbered.length && sameName.length > 1) {
    const hit = byAttacks(card, sameName);
    return hit && !taken.has(hit.id) ? { id: hit.id } : { ambiguous: true };
  }
  return null;
}

// Nur wenn matchOne nichts findet: derselbe Name mit ausgeschriebenen Energie-Symbolen, gleiche
// Eindeutigkeitsregeln (Nummer + Name, sonst einziges Produkt dieses Namens und ohne Nummer).
function matchEnergy(card, index, taken) {
  const name = normalizeCmName(card.name);
  const all = name ? index.byEnergy.get(name) ?? [] : [];
  if (!all.length) return null;
  const number = normalizeCmNumber(card.number);
  const byNumber = all.filter((p) => p.number !== null && p.number === number && !taken.has(p.id));
  if (byNumber.length === 1) return { id: byNumber[0].id, source: 'energySymbol' };
  if (byNumber.length > 1) return { ambiguous: true };
  const free = all.filter((p) => p.number === null && !taken.has(p.id));
  if (all.length === 1 && free.length === 1) return { id: free[0].id, source: 'energySymbol' };
  return free.length ? { ambiguous: true } : null;
}

// Gleichnamige Gruppe (alle Karten offen): Left/Right oder Reihenfolge. -> [Produkt je Karte in cards-Reihenfolge] + source | null
function assignGroup(cards, products) {
  if (cards.length < 2 || products.length !== cards.length) return null;
  if (products.some((p) => p.number !== null)) return null;
  const nums = cards.map((c) => normalizeCmNumber(c.number));
  if (nums.some((n) => !/^\d+$/.test(n ?? '')) || new Set(nums).size !== nums.length) return null;
  const order = cards.map((c, i) => ({ i, n: Number(nums[i]) })).sort((a, b) => a.n - b.n);
  const halves = products.map((p) => HALF.exec(p.raw)?.[1].toLowerCase() ?? null);
  let sorted;
  let source;
  if (halves.some(Boolean)) {
    const left = products[halves.indexOf('left')];
    const right = products[halves.indexOf('right')];
    const base = (p) => p.raw.replace(HALF, '').trim();
    if (products.length !== 2 || !left || !right || order[1].n !== order[0].n + 1 || base(left) !== base(right)) return null;
    sorted = [left, right];
    source = 'leftRight';
  } else {
    if (new Set(products.map((p) => p.raw.trim())).size !== 1) return null;
    const key = products[0].attacks;
    if (key && cards.some((c) => { const k = cardAttackKey(c); return k && k !== key; })) return null;
    sorted = [...products].sort((a, b) => a.id - b.id);
    source = 'ordered';
  }
  const out = new Array(cards.length);
  order.forEach(({ i }, rank) => { out[i] = sorted[rank]; });
  return { products: out, source };
}

// Woerter eines Namens (ohne Klammern) fuer die Kandidatenliste der Arbeitsliste.
const wordsOf = (s) => String(s ?? '').replace(/\[[^\]]*\]/g, ' ').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
  .split(/[^\p{L}\p{N}]+/u).filter((w) => w.length >= 3);

// Strenger Pfad (nur fuer Korrekturen): genau ein Produkt mit gleicher Nummer und gleichem Namen,
// unabhaengig von belegten IDs; ohne Nummerntreffer nur ein gleichnamiges Produkt ohne Nummer mit
// denselben Angriffs-/Faehigkeitsnamen (nie nur per Name).
function strictMatch(card, index) {
  const name = normalizeCmName(card.name);
  const number = normalizeCmNumber(card.number);
  if (!name || !number) return null;
  const hits = (index.byNumber.get(number) ?? []).filter((p) => p.name === name);
  if (hits.length === 1) return hits[0].id;
  if (hits.length > 1) return null;
  return byAttacks(card, index.byName.get(name) ?? [])?.id ?? null;
}

const tcgdexIds = (card) => (Array.isArray(card.ids?.cardmarket) ? card.ids.cardmarket : []);

// previous fuer die Stabilitaetsregel aus veroeffentlichten v3-Karten: "<setId>/<cardId>" -> { ids, source, variants }
// (source 'tcgdex', wenn die Karte keine ids.cardmarketSource hat). Nur Karten mit Cardmarket-ID.
export function previousFromCards(cards, into = new Map()) {
  for (const c of cards ?? []) {
    const ids = tcgdexIds(c).filter((id) => Number.isInteger(id));
    const variants = (c.variants ?? []).filter((v) => v && typeof v === 'object');
    if (!ids.length && !variants.some((v) => typeof v.cardmarketId === 'number')) continue;
    into.set(`${c.setId}/${c.cardId}`, { ids, source: c.ids?.cardmarketSource ?? 'tcgdex', variants });
  }
  return into;
}

/**
 * Fuellt ids.cardmarket der Karten in cardsBySet (in place) und liefert den Report.
 * sets: v3-Sets ({ id, ids: { cardmarket } }); loadExpansion(expansionId) -> { cards } | null;
 * subsetExpansion: Map card.id -> Cardmarket-Expansion des TCGdex-Untersets (null = keine eigene).
 *
 * Vorher: TCGdex-IDs, die mehreren Karten zugeordnet sind (duplicateTcgdexIds), werden je Karte ueber den
 * strengen Pfad korrigiert (ids.cardmarketSource 'corrected', Original in ids.cardmarketTcgdex; nur geteilte
 * IDs werden ersetzt bzw. entfernt, nicht geteilte bleiben in ids.cardmarket und an ihrer Variante). Ohne
 * eindeutigen strengen Treffer, bei schon anderweitig belegtem Produkt oder Doppelvergabe bleibt die
 * TCGdex-ID. Nicht doppelte TCGdex-IDs werden aus diesem Grund nicht angefasst.
 *
 * Expansionspruefung (nur mit productExpansion(id) -> expansionId aus dem Katalog und knownExpansions =
 * Expansionen des Katalogs; Report expansionMismatch):
 * - Set: Zuordnungsdatei ("<setId>": expansionId, ids.cardmarketSetSource 'override'), sonst ids.cardmarket,
 *   wenn bekannte Expansion. Sonst (auch bei null) nur abgeleitet, wenn >= 80 % der Karten mit IDs ein
 *   namensgleiches Produkt in genau dieser Expansion haben (ids.cardmarketSetSource 'derived', Original in
 *   ids.cardmarketTcgdexSet); sonst bleibt der Wert (invalid-kept) und das Set steht in setsWithoutExpansion.
 * - Karte: Eine ID, deren Produktname nicht zum Kartennamen passt (cmNameMatches), wird durch den Treffer
 *   nach den Lueckenregeln in der Expansion der Karte ersetzt (Nummer + Name, sonst eindeutiger Name ohne
 *   Nummer; ids.cardmarketSource 'corrected-expansion', Original in ids.cardmarketTcgdex). Ohne Treffer
 *   wird sie entfernt, wenn das Produkt in einer fremden Expansion liegt (dropped-mismatch: kein Link ist
 *   besser als ein falscher), sonst bleibt sie (kept-mismatch). Namensgleiche Produkte fremder Expansionen
 *   (Stempel-, Ball-Varianten) bleiben. Sets ohne gueltige Expansion werden nur gemeldet (no-set-expansion).
 */
export function fillCardmarketIds({
  sets, cardsBySet, loadExpansion, subsetExpansion = new Map(), knownExpansions = null, productExpansion = null, overrides = {}, previous = null,
}) {
  // Vor allen Schritten: TCGdex-IDs je Karte (fuer cardmarketTcgdex bei der Stabilitaetsregel)
  const tcgdexBefore = new Map();
  for (const cards of cardsBySet.values()) for (const c of cards) tcgdexBefore.set(c.id, [...tcgdexIds(c)]);
  const indexes = new Map();
  const indexFor = (expansionId) => {
    if (!indexes.has(expansionId)) {
      const expansion = loadExpansion(expansionId);
      indexes.set(expansionId, expansion ? indexExpansion(expansion) : null);
    }
    return indexes.get(expansionId);
  };
  const validExpansion = (e) => typeof e === 'number' && (!knownExpansions || knownExpansions.has(e));
  // -> { expansion, name|null } | null
  const productOf = (id) => {
    const expansion = productExpansion?.(id);
    if (typeof expansion !== 'number') return null;
    return { expansion, name: indexFor(expansion)?.byId.get(id)?.name ?? null };
  };

  // Overrides zuerst: gewinnen vor TCGdex und allen Regeln; die Karte ist danach fuer alle Schritte gesperrt.
  // Zahl -> ids.cardmarket = [id] (Produkt muss im Produktindex stehen), null -> keine ID; Varianten-IDs
  // fallen weg, damit die primaere ID (primaryCardmarketId) die des Overrides ist.
  // Auffaelligkeiten (fremde Expansion, kein Single, [Oversized], doppelt vergeben, schon per TCGdex bei
  // einer anderen Karte) sind nur Warnungen: der Eintrag ist eine bewusste Entscheidung.
  const overrideReport = { applied: 0, removed: 0, warnings: [] };
  const locked = new Set();
  const cardByKey = new Map();
  const heldBefore = new Map(); // Produkt-ID -> card.id[] (TCGdex-IDs und Varianten vor den Overrides)
  for (const [setId, cards] of cardsBySet) {
    for (const c of cards) {
      cardByKey.set(`${setId}/${c.cardId}`, c);
      const ids = new Set([...tcgdexIds(c), ...(c.variants ?? []).map((v) => v?.cardmarketId).filter((id) => typeof id === 'number')]);
      for (const id of ids) heldBefore.set(id, [...(heldBefore.get(id) ?? []), c.id]);
    }
  }
  const setById = new Map(sets.map((x) => [x.id, x]));
  const overrideKeys = Object.keys(overrides ?? {}).filter((k) => !k.startsWith('_')).sort();
  // "<setId>": expansionId (ohne "/") legt die Cardmarket-Expansion eines Sets fest (Spec §3.1).
  const setOverrides = new Map();
  for (const key of overrideKeys) {
    if (key.includes('/')) continue;
    if (!setById.has(key)) overrideReport.warnings.push(`${key}: Set nicht gefunden, ignoriert`);
    else if (!Number.isInteger(overrides[key])) overrideReport.warnings.push(`${key}: Expansion ${overrides[key]} ist keine Zahl, ignoriert`);
    else setOverrides.set(key, overrides[key]);
  }
  const cardOverrideKeys = overrideKeys.filter((k) => k.includes('/'));
  const keysByProduct = new Map();
  for (const key of cardOverrideKeys) {
    const value = overrides[key];
    if (Number.isInteger(value)) keysByProduct.set(value, [...(keysByProduct.get(value) ?? []), key]);
  }
  for (const key of cardOverrideKeys) {
    const value = overrides[key];
    const c = cardByKey.get(key);
    if (!c) { overrideReport.warnings.push(`${key}: Karte nicht gefunden, ignoriert`); continue; }
    if (value !== null && !(Number.isInteger(value) && typeof productExpansion?.(value) === 'number')) {
      overrideReport.warnings.push(`${key}: Produkt ${value} nicht im Cardmarket-Katalog, ignoriert`);
      continue;
    }
    if (value !== null) {
      const warn = (why) => overrideReport.warnings.push(`${key}: Produkt ${value} ${why} (Warnung, uebernommen)`);
      const expansion = productExpansion(value);
      const setId = key.slice(0, key.lastIndexOf('/'));
      const setExp = setOverrides.get(setId) ?? setById.get(setId)?.ids?.cardmarket;
      const ownExp = subsetExpansion.get(c.id);
      if (expansion !== setExp && expansion !== ownExp) warn(`liegt in Expansion ${expansion}, nicht in der des Sets (${setExp ?? '-'})`);
      const p = indexFor(expansion)?.byId.get(value);
      if (p && !isSingle(p)) warn(`ist kein Pokémon-Single (Kategorie ${p.categoryId ?? p.categoryName ?? '?'})`);
      if (p && OVERSIZED.test(String(p.name ?? ''))) warn('ist ein [Oversized]-Produkt');
      const keys = keysByProduct.get(value) ?? [];
      if (keys.length > 1) warn(`steht mehrfach in den Overrides (${keys.join(', ')})`);
      const others = (heldBefore.get(value) ?? []).filter((id) => id !== c.id);
      if (others.length) warn(`gehoert per TCGdex schon zu ${others.join(', ')}`);
    }
    const original = tcgdexIds(c);
    c.ids = { ...c.ids, cardmarket: value === null ? [] : [value], cardmarketSource: 'override', ...(original.length ? { cardmarketTcgdex: original } : {}) };
    if (Array.isArray(c.variants)) c.variants = c.variants.map(({ cardmarketId, ...rest }) => rest);
    locked.add(c.id);
    if (value === null) overrideReport.removed++;
    else overrideReport.applied++;
  }

  // 0. Set-Ebene: Expansion pruefen, notfalls aus den Karten ableiten
  const expansionMismatch = {
    totals: { checked: 0, ok: 0, foreignNameOk: 0, corrected: 0, dropped: 0, keptMismatch: 0, noSetExpansion: 0, unknownProduct: 0 },
    sets: [], cards: [], foreignNameOkBySet: {},
  };
  // Reihenfolge (Spec §3.1): Zuordnungsdatei ("<setId>": expansionId) -> ids.cardmarket aus TCGdex/pokemontcg,
  // wenn im Katalog -> Mehrheit (>= 80 %) der Karten-IDs. Unklar -> null und setsWithoutExpansion.
  const refExpansion = new Map(); // set.id -> gepruefte Expansion | null
  const setsWithoutExpansion = [];
  for (const set of sets) {
    const raw = set.ids?.cardmarket;
    const forced = setOverrides.get(set.id);
    if (forced !== undefined) {
      if (validExpansion(forced)) {
        if (forced !== raw) set.ids = { ...set.ids, cardmarket: forced, cardmarketSetSource: 'override', ...(raw != null ? { cardmarketTcgdexSet: raw } : {}) };
        refExpansion.set(set.id, forced);
        continue;
      }
      overrideReport.warnings.push(`${set.id}: Expansion ${forced} nicht im Cardmarket-Katalog, ignoriert`);
    }
    if (validExpansion(raw) || !productExpansion) {
      refExpansion.set(set.id, validExpansion(raw) ? raw : null);
      continue;
    }
    const counts = new Map();
    let withIds = 0;
    const from = { tcgdex: 0, previous: 0 };
    for (const card of cardsBySet.get(set.id) ?? []) {
      // Karten-IDs: heutige TCGdex-IDs, sonst die zuletzt veroeffentlichten (previous; z. B. pt-Sets ohne TCGdex-IDs)
      const todayIds = locked.has(card.id) ? [] : tcgdexIds(card);
      const ids = todayIds.length || locked.has(card.id) ? todayIds : (previous?.get(`${set.id}/${card.cardId}`)?.ids ?? []);
      if (!ids.length) continue;
      withIds++;
      from[todayIds.length ? 'tcgdex' : 'previous']++;
      const exps = new Set();
      for (const id of ids) {
        const p = productOf(id);
        if (p?.name && validExpansion(p.expansion) && cmNameMatches(p.name, card.name)) exps.add(p.expansion);
      }
      for (const e of exps) counts.set(e, (counts.get(e) ?? 0) + 1);
    }
    const ranked = [...counts].sort((a, b) => b[1] - a[1] || a[0] - b[0]);
    const [best, second] = ranked;
    const evidence = `${best?.[1] ?? 0}/${withIds}`;
    // Herkunft der Evidenz: heutige TCGdex-IDs, veroeffentlichte IDs (previous) oder beides
    const evidenceSource = !withIds ? null : !from.previous ? 'tcgdex' : !from.tcgdex ? 'previous' : 'mixed';
    if (best && best[1] >= 0.8 * withIds && (!second || second[1] < best[1])) {
      set.ids = { ...set.ids, cardmarket: best[0], cardmarketSetSource: 'derived', ...(raw != null ? { cardmarketTcgdexSet: raw } : {}) };
      refExpansion.set(set.id, best[0]);
      expansionMismatch.sets.push({ setId: set.id, oldId: raw ?? null, newId: best[0], reason: 'derived', evidence, evidenceSource });
    } else {
      refExpansion.set(set.id, null);
      if (raw != null) expansionMismatch.sets.push({ setId: set.id, oldId: raw, newId: null, reason: 'invalid-kept', evidence, evidenceSource });
      setsWithoutExpansion.push({ setId: set.id, tcgdexExpansion: raw ?? null, evidence, evidenceSource, cards: (cardsBySet.get(set.id) ?? []).length });
    }
  }

  // Expansion einer Karte: eigene des TCGdex-Untersets (Galerie-Subsets), sonst die des Sets.
  const setExpansionOf = (set) => (typeof set.ids?.cardmarket === 'number' ? set.ids.cardmarket : null);
  const cardExpansion = (set, card) => {
    const own = subsetExpansion.has(card.id) ? subsetExpansion.get(card.id) : null;
    return validExpansion(own) ? own : setExpansionOf(set);
  };

  // 0b. custom-set (Stufe 2): exakte Nummer inkl. Zusatz ("4" ist die normale Karte, "4V2"/"224a"/"H1" nie).
  // Gewinnt vor TCGdex: TCGdex-IDs, die laut custom-set zu einer anderen Basisnummer gehoeren, fallen weg bzw.
  // werden ersetzt (auch an Varianten) - auch bei Karten, fuer die custom-set selbst nichts entscheidet
  // (mehrere Produkte zur Nummer, keine Nummer, Konflikt; Report customSets.dropped). IDs von Drucken derselben
  // Basisnummer ("101V2" bei Karte 101) und unbekannte IDs bleiben hinter dem Treffer. Mehrere Produkte zur
  // Nummer oder dasselbe Produkt fuer mehrere Karten -> custom-set entscheidet nicht (customSets.ambiguous /
  // conflicts). Eine Karte mit Treffer ist danach gesperrt.
  const customSetReport = { applied: 0, changed: 0, ambiguous: [], conflicts: [], nameWarnings: [], dropped: [] };
  const csLocked = new Set();
  const csRejected = new Map(); // card.id -> Set der laut custom-set falschen Produkt-IDs (auch fuer die Stabilitaetsregel)
  const overrideProducts = new Set();
  for (const key of cardOverrideKeys) if (Number.isInteger(overrides[key]) && locked.has(cardByKey.get(key)?.id)) overrideProducts.add(overrides[key]);
  // Nummer eines Produkts laut custom-set (auch mehrfach vergebene: beide Produkte "1" in 1536 sind Drucke von #1)
  const csNumber = (index, id) => {
    const p = index.byId.get(id);
    return p?.customSet ? normalizeCmNumber(p.collectorNumber) : null;
  };
  const isStamped = (v) => (Array.isArray(v.stamp) ? v.stamp.length > 0 : Boolean(v.stamp));
  const normalPrint = (v) => !isStamped(v) && v.size !== 'jumbo';
  const csCards = []; // { set, card, index, hits }
  const csClaims = new Map(); // Produkt-ID -> [eintrag]
  for (const set of sets) {
    for (const card of cardsBySet.get(set.id) ?? []) {
      if (locked.has(card.id)) continue;
      const exp = cardExpansion(set, card);
      const index = exp === null ? null : indexFor(exp);
      if (!index?.customSet.size) continue;
      const hits = index.customSet.get(normalizeCmNumber(card.number)) ?? [];
      const entry = { set, card, index, hits };
      csCards.push(entry);
      if (hits.length > 1) { customSetReport.ambiguous.push(`${set.id}/${card.cardId}`); continue; }
      if (hits.length) csClaims.set(hits[0].id, [...(csClaims.get(hits[0].id) ?? []), entry]);
    }
  }
  const applied = new Set();
  for (const [productId, claims] of csClaims) {
    if (claims.length > 1 || overrideProducts.has(productId)) {
      customSetReport.conflicts.push({ productId, cards: claims.map(({ set, card }) => `${set.id}/${card.cardId}`), ...(overrideProducts.has(productId) ? { reason: 'override' } : {}) });
      continue;
    }
    const [{ set, card, hits: [hit], index }] = claims;
    const base = customSetBase(hit.number);
    // Gehoert laut custom-set zu einer anderen Basisnummer derselben Expansion -> falsch fuer diese Karte
    const contradicted = (id) => { const n = csNumber(index, id); return id !== productId && n !== null && customSetBase(n) !== base; };
    // Druck derselben Basisnummer mit Zusatz ("149V2" bei Karte 149): Variante, nie die normale Karte
    const suffixed = (id) => { const n = csNumber(index, id); return id !== productId && n !== null && n !== base && customSetBase(n) === base; };
    const original = tcgdexIds(card);
    const rejected = new Set([...original, ...(card.variants ?? []).map((v) => v?.cardmarketId)].filter((id) => typeof id === 'number' && contradicted(id)));
    const kept = original.filter((x) => x !== productId && !rejected.has(x));
    const ids = [productId, ...kept];
    let changed = ids.length !== original.length || ids.some((x, i) => x !== original[i]);
    if (Array.isArray(card.variants)) {
      // Normale Drucke (ungestempelt, nicht Jumbo) mit falscher oder Zusatz-ID -> Treffer; gestempelte/Jumbo-
      // Varianten verlieren eine widersprochene ID und - wenn die Karte einen normalen Druck hat - auch das
      // Basisprodukt (das gehoert dem normalen Druck); Zusatz-IDs derselben Nummer bleiben dort.
      const hasNormal = card.variants.some((v) => v && normalPrint(v));
      card.variants = card.variants.map((v) => {
        const id = v.cardmarketId;
        if (typeof id !== 'number') return v;
        if (normalPrint(v)) {
          if (!(rejected.has(id) || suffixed(id))) return v;
          changed = true;
          return { ...v, cardmarketId: productId };
        }
        if (!rejected.has(id) && !(id === productId && hasNormal)) return v;
        changed = true;
        const { cardmarketId, ...rest } = v;
        return rest;
      });
    }
    card.ids = { ...card.ids, cardmarket: ids, cardmarketSource: 'custom-set', ...(changed && original.length ? { cardmarketTcgdex: original } : {}) };
    if (!cmNameMatches(hit.raw, card.name)) customSetReport.nameWarnings.push({ cardKey: `${set.id}/${card.cardId}`, name: card.name, productId, productName: hit.raw });
    customSetReport.applied++;
    if (changed && original.length) customSetReport.changed++;
    if (rejected.size) csRejected.set(card.id, rejected);
    applied.add(card.id);
    csLocked.add(card.id);
    locked.add(card.id);
  }
  // Karten ohne custom-set-Treffer: widersprochene TCGdex-IDs fallen trotzdem weg (z. B. ecard1-47 mit #12),
  // aber nur, wenn das custom-set die Nummer der Karte ueberhaupt fuehrt (svp-500 fehlt dort; die
  // Lot-Eintraege "224a-f" sind vergebene Nummern und sagen nichts ueber andere Karten).
  const basesOf = new Map();
  for (const { set, card, index } of csCards) {
    if (applied.has(card.id)) continue;
    const base = customSetBase(normalizeCmNumber(card.number));
    if (!basesOf.has(index)) basesOf.set(index, new Set([...index.customSet.keys()].map(customSetBase)));
    if (!basesOf.get(index).has(base)) continue;
    const contradicted = (id) => { const n = csNumber(index, id); return n !== null && customSetBase(n) !== base; };
    const original = tcgdexIds(card);
    const rejected = new Set([...original, ...(card.variants ?? []).map((v) => v?.cardmarketId)].filter((id) => typeof id === 'number' && contradicted(id)));
    if (!rejected.size) continue;
    csRejected.set(card.id, rejected);
    for (const id of [...rejected].sort((a, b) => a - b)) customSetReport.dropped.push({ cardKey: `${set.id}/${card.cardId}`, productId: id, number: csNumber(index, id) });
    card.ids = { ...card.ids, cardmarket: original.filter((x) => !rejected.has(x)), cardmarketTcgdex: card.ids.cardmarketTcgdex ?? original };
    if (Array.isArray(card.variants)) {
      card.variants = card.variants.map((v) => {
        if (!rejected.has(v?.cardmarketId)) return v;
        const { cardmarketId, ...rest } = v;
        return rest;
      });
    }
  }
  customSetReport.ambiguous.sort();

  const owners = new Map(); // TCGdex-Produkt-ID -> card.id[]
  for (const cards of cardsBySet.values()) {
    for (const c of cards) for (const id of new Set(tcgdexIds(c))) owners.set(id, [...(owners.get(id) ?? []), c.id]);
  }
  const taken = new Set(owners.keys());
  const duplicateTcgdexIds = {};
  for (const [id, cardIds] of owners) if (cardIds.length > 1) duplicateTcgdexIds[id] = [...cardIds].sort();

  const sharedId = (id) => (owners.get(id)?.length ?? 0) > 1;
  const isShared = (card) => tcgdexIds(card).some(sharedId);

  const bySet = {};
  const walk = (fn) => {
    for (const set of sets) {
      const expansionId = typeof set.ids?.cardmarket === 'number' ? set.ids.cardmarket : null;
      bySet[set.id] ??= { expansionId, cards: (cardsBySet.get(set.id) ?? []).length, tcgdex: 0, matched: 0, missing: 0, ambiguous: 0 };
      for (const card of cardsBySet.get(set.id) ?? []) {
        const subset = subsetExpansion.has(card.id);
        const own = subset ? subsetExpansion.get(card.id) : null;
        const exp = validExpansion(own) ? own : expansionId;
        fn({ set, row: bySet[set.id], card, subset, exp, index: exp === null ? null : indexFor(exp) });
      }
    }
  };

  // 1. Geteilte TCGdex-IDs: strenger Treffer je Karte
  const corrections = new Map(); // card.id -> { setId, card, id }
  const dup = { ids: Object.keys(duplicateTcgdexIds).length, cards: 0, corrected: 0, kept: 0 };
  walk(({ set, card, index }) => {
    if (locked.has(card.id) || !tcgdexIds(card).length || !isShared(card)) return;
    dup.cards++;
    const id = index ? strictMatch(card, index) : null;
    if (id === null) return;
    // Das Produkt darf keiner anderen Karte per TCGdex gehoeren; ist es schon die einzige ID, bleibt alles.
    if ((owners.get(id) ?? []).some((k) => k !== card.id)) return;
    // Ist der Treffer schon die eigene, nicht geteilte ID, bleibt alles (wie base2-1 mit der geteilten).
    const ids = tcgdexIds(card);
    if (ids.length === 1 && ids[0] === id) return;
    corrections.set(card.id, { setId: set.id, card, id });
  });

  // Korrekturen: dasselbe Produkt fuer mehrere Karten -> keine korrigieren
  const corrClaims = new Map();
  for (const c of corrections.values()) corrClaims.set(c.id, (corrClaims.get(c.id) ?? 0) + 1);
  for (const { setId, card, id } of corrections.values()) {
    if (corrClaims.get(id) > 1) continue;
    dup.corrected++;
    bySet[setId].corrected = (bySet[setId].corrected ?? 0) + 1;
    taken.add(id);
    // Nur geteilte (falsche) IDs fallen weg; eigene, nicht geteilte TCGdex-IDs bleiben hinter dem Treffer.
    const original = tcgdexIds(card);
    const kept = original.filter((x) => x !== id && !sharedId(x));
    card.ids = { ...card.ids, cardmarket: [id, ...kept], cardmarketSource: 'corrected', cardmarketTcgdex: original };
    if (Array.isArray(card.variants)) {
      // Geteilte (falsche) Varianten-ID -> Treffer (Leser nehmen die erste Varianten-ID vor ids.cardmarket);
      // nicht geteilte Varianten-IDs (z. B. gestempelte Drucke) bleiben.
      card.variants = card.variants.map((v) => (v.cardmarketId !== undefined && sharedId(v.cardmarketId) ? { ...v, cardmarketId: id } : v));
    }
  }
  dup.kept = dup.cards - dup.corrected;

  // 1b. Expansionspruefung: IDs, deren Produkt anders heisst als die Karte
  if (productExpansion) {
    const T = expansionMismatch.totals;
    const report = (card, oldId, oldExpansion, newId, reason) => expansionMismatch.cards.push({ cardKey: card.id, oldId, oldExpansion, newId, reason });
    const flagged = []; // { card, index, bad: [{ id, expansion, foreign }] }
    walk(({ set, card, exp, index }) => {
      if (locked.has(card.id)) return;
      const accepted = new Set([refExpansion.get(set.id), exp].filter((e) => e !== null && validExpansion(e)));
      const bad = [];
      for (const id of tcgdexIds(card)) {
        T.checked++;
        const p = productOf(id);
        if (!p?.name) { T.unknownProduct++; report(card, id, p?.expansion ?? null, null, 'unknown-product'); continue; }
        if (cmNameMatches(p.name, card.name)) {
          if (accepted.size && !accepted.has(p.expansion)) {
            T.foreignNameOk++;
            const row = (expansionMismatch.foreignNameOkBySet[set.id] ??= {});
            row[p.expansion] = (row[p.expansion] ?? 0) + 1;
          } else T.ok++;
          continue;
        }
        if (!accepted.size) { T.noSetExpansion++; report(card, id, p.expansion, null, 'no-set-expansion'); continue; }
        bad.push({ id, expansion: p.expansion, foreign: !accepted.has(p.expansion) });
      }
      if (bad.length) flagged.push({ card, index, bad });
    });

    // Belegt sind alle IDs, die bei ihrer Karte stimmen; falsch zugeordnete Produkte werden frei.
    const badPairs = new Set(flagged.flatMap(({ card, bad }) => bad.map((b) => `${card.id}|${b.id}`)));
    const held = new Set();
    for (const cards of cardsBySet.values()) for (const c of cards) for (const id of tcgdexIds(c)) if (!badPairs.has(`${c.id}|${id}`)) held.add(id);
    for (const f of flagged) f.newId = (f.index ? matchOne(f.card, f.index, held) : null)?.id ?? null;
    const claimsX = new Map();
    for (const f of flagged) if (f.newId !== null) claimsX.set(f.newId, (claimsX.get(f.newId) ?? 0) + 1);

    for (const f of flagged) {
      const { card, bad } = f;
      const newId = f.newId !== null && claimsX.get(f.newId) === 1 ? f.newId : null;
      const replaced = new Set();
      const dropped = new Set();
      for (const b of bad) {
        if (newId !== null) { replaced.add(b.id); T.corrected++; report(card, b.id, b.expansion, newId, 'corrected-expansion'); }
        else if (b.foreign) { dropped.add(b.id); T.dropped++; report(card, b.id, b.expansion, null, 'dropped-mismatch'); }
        else { T.keptMismatch++; report(card, b.id, b.expansion, null, 'kept-mismatch'); }
      }
      if (!replaced.size && !dropped.size) continue;
      const original = tcgdexIds(card);
      const kept = original.filter((x) => !replaced.has(x) && !dropped.has(x));
      card.ids = {
        ...card.ids,
        cardmarket: [...new Set([...(newId !== null ? [newId] : []), ...kept])],
        ...(newId !== null ? { cardmarketSource: 'corrected-expansion' } : {}),
        cardmarketTcgdex: card.ids.cardmarketTcgdex ?? original,
      };
      if (newId !== null) taken.add(newId);
      if (Array.isArray(card.variants)) {
        card.variants = card.variants.map((v) => {
          if (replaced.has(v.cardmarketId)) return { ...v, cardmarketId: newId };
          if (!dropped.has(v.cardmarketId)) return v;
          const { cardmarketId, ...rest } = v;
          return rest;
        });
      }
    }
  }

  // 2. Luecken: Kandidaten je Karte ohne TCGdex-ID (Energie-Symbole nur, wenn sonst nichts passt)
  const results = new Map(); // card.id -> { setId, card, subset, exp, index, result }
  walk(({ set, row, card, subset, exp, index }) => {
    if (csLocked.has(card.id)) { row.customSet = (row.customSet ?? 0) + 1; return; }
    if (locked.has(card.id)) { row.override = (row.override ?? 0) + 1; return; }
    if (tcgdexIds(card).length) { row.tcgdex++; return; }
    if (exp !== null && !index) row.expansionFileMissing = true;
    const result = index ? matchOne(card, index, taken) ?? matchEnergy(card, index, taken) : null;
    results.set(card.id, { setId: set.id, card, subset, exp, index, result });
  });

  // 3. Dasselbe Produkt fuer mehrere Karten -> alle mehrdeutig
  const claims = new Map();
  for (const r of results.values()) if (r.result?.id !== undefined) claims.set(r.result.id, (claims.get(r.result.id) ?? 0) + 1);
  for (const r of results.values()) if (r.result?.id !== undefined && claims.get(r.result.id) > 1) r.result = { ambiguous: true };

  // 3b. Gleichnamige Gruppen je Expansion (Left/Right, Reihenfolge): nur wenn jede Karte dieses Namens in
  // der Expansion noch offen ist (keine TCGdex-ID, kein Override, kein Treffer) und kein Produkt belegt ist.
  // Reihenfolge nur, wenn die Produkt-IDs zu den Nachbarn passen: Offset (Produkt-ID - Kartennummer) gleich
  // dem eines naechsten Nachbarn darunter oder darueber (+-2; Nachbarn = Karten mit ID in dieser Expansion und
  // nummerierte Produkte), ohne Nachbarn liegen die IDs der Gruppe hoechstens 50 auseinander. Sonst orderedRejected.
  const groups = new Map(); // `${exp}|${name}` -> { exp, index, name, cards }
  const neighbours = new Map(); // exp -> [{ n, offset }]
  const keyOf = new Map(); // card.id -> "<setId>/<cardId>"
  walk(({ set, card, exp, index }) => {
    keyOf.set(card.id, `${set.id}/${card.cardId}`);
    if (exp === null || !index) return;
    const number = normalizeCmNumber(card.number);
    if (number && /^\d+$/.test(number)) {
      const id = results.get(card.id)?.result?.id ?? tcgdexIds(card).find((x) => index.byId.has(x));
      if (id !== undefined) neighbours.set(exp, [...(neighbours.get(exp) ?? []), { n: Number(number), offset: id - Number(number) }]);
    }
    const name = normalizeCmName(card.name);
    if (!name) return;
    const key = `${exp}|${name}`;
    if (!groups.has(key)) groups.set(key, { exp, index, name, cards: [] });
    groups.get(key).cards.push(card);
  });
  for (const [exp, index] of indexes) {
    if (!index) continue;
    for (const p of index.all) if (p.number && /^\d+$/.test(p.number)) neighbours.set(exp, [...(neighbours.get(exp) ?? []), { n: Number(p.number), offset: p.id - Number(p.number) }]);
  }
  const orderedRejected = [];
  const plausibleOrder = (g, hit) => {
    const near = neighbours.get(g.exp) ?? [];
    if (!near.length) {
      const ids = hit.products.map((p) => p.id);
      return Math.max(...ids) - Math.min(...ids) <= 50;
    }
    return g.cards.every((c, i) => {
      const n = Number(normalizeCmNumber(c.number));
      const offset = hit.products[i].id - n;
      const below = near.filter((x) => x.n < n);
      const above = near.filter((x) => x.n > n);
      const lo = below.length ? Math.max(...below.map((x) => x.n)) : null;
      const hi = above.length ? Math.min(...above.map((x) => x.n)) : null;
      return near.some((x) => (x.n === lo || x.n === hi) && Math.abs(x.offset - offset) <= 2);
    });
  };
  const claimedNow = new Set([...results.values()].map((r) => r.result?.id).filter((id) => id !== undefined));
  for (const g of groups.values()) {
    if (g.cards.length < 2 || g.cards.some((c) => !results.has(c.id) || results.get(c.id).result?.id !== undefined)) continue;
    const products = g.index.byName.get(g.name) ?? [];
    if (products.some((p) => taken.has(p.id) || claimedNow.has(p.id))) continue;
    const hit = assignGroup(g.cards, products);
    if (!hit) continue;
    if (hit.source === 'ordered' && !plausibleOrder(g, hit)) {
      const order = g.cards.map((c, i) => ({ c, p: hit.products[i] })).sort((a, b) => a.p.id - b.p.id);
      orderedRejected.push({ expansionId: g.exp, name: g.cards[0].name, cards: order.map(({ c }) => keyOf.get(c.id)), products: order.map(({ p }) => p.id) });
      continue;
    }
    g.cards.forEach((c, i) => {
      results.get(c.id).result = { id: hit.products[i].id, source: hit.source };
      claimedNow.add(hit.products[i].id);
    });
  }

  // 3c. Stabilitaetsregel (Spec §3.4): previous = zuletzt veroeffentlichte Ausgabe ("<setId>/<cardId>" ->
  // { ids, source, variants }). Eine ueber Stufe 3-4 vergebene primaere ID von gestern bleibt, wenn heute
  // keine Stufe sie liefert oder eine andere Stufe-3/4-ID entsteht. Ausnahmen: Override/custom-set (Stufe
  // 1-2) entscheiden (Karte gesperrt); das Produkt fehlt im Katalog (stabilityDropped); TCGdex selbst
  // liefert heute eine andere ID als gestern (gestern und heute Quelle TCGdex: Upstream-Korrektur gilt).
  // Haelt heute eine andere Karte das Produkt (und hielt es gestern nicht), weicht eine heutige Regel-ID;
  // eine TCGdex-ID dagegen nicht (stabilityConflicts, gestrige ID entfaellt).
  const STABLE_SOURCES = new Set(['tcgdex', 'matched', 'corrected', 'corrected-expansion', 'ordered', 'energySymbol', 'leftRight']);
  const stabilityKept = [];
  const stabilityDropped = [];
  const stabilityConflicts = [];
  const stableCards = new Set();
  if (previous && productExpansion) {
    const exists = (id) => typeof productExpansion(id) === 'number';
    const variantIds = (card) => (card.variants ?? []).map((v) => v?.cardmarketId).filter((id) => typeof id === 'number');
    const todayOf = (card) => {
      const r = results.get(card.id);
      if (r) return r.result?.id !== undefined ? { id: r.result.id, source: r.result.source ?? 'matched' } : { id: null, source: null };
      const id = primaryCardmarketId(card);
      return id === undefined ? { id: null, source: null } : { id, source: card.ids.cardmarketSource ?? 'tcgdex' };
    };
    const vkey = (v) => JSON.stringify(Object.keys(v).filter((k) => k !== 'cardmarketId' && k !== 'tcgplayerId').sort().map((k) => [k, v[k]]));
    // Gleicher Stand wie gestern: ids.cardmarket und Varianten-IDs (je Variante ohne IDs als Schluessel)
    const sameState = (card, prev) => {
      const r = results.get(card.id);
      const ids = r ? (r.result?.id !== undefined ? [r.result.id] : []) : tcgdexIds(card);
      if (JSON.stringify(ids) !== JSON.stringify(prev.ids ?? [])) return false;
      const was = new Map((prev.variants ?? []).map((v) => [vkey(v), v.cardmarketId ?? null]));
      return (card.variants ?? []).every((v) => !was.has(vkey(v)) || was.get(vkey(v)) === (v.cardmarketId ?? null));
    };
    const candidates = [];
    walk(({ set, card }) => {
      if (locked.has(card.id)) return;
      const key = `${set.id}/${card.cardId}`;
      const raw = previous.get(key);
      const prevSource = raw?.source ?? 'tcgdex';
      if (!raw || !STABLE_SOURCES.has(prevSource)) return;
      // Laut custom-set falsche IDs (Stufe 2) kommen nie zurueck
      const rejected = csRejected.get(card.id) ?? new Set();
      const prev = {
        ...raw,
        ids: (raw.ids ?? []).filter((id) => !rejected.has(id)),
        variants: (raw.variants ?? []).map((v) => (rejected.has(v?.cardmarketId) ? (({ cardmarketId, ...rest }) => rest)(v) : v)),
      };
      const rawPrimary = primaryCardmarketId({ ids: { cardmarket: raw.ids ?? [] }, variants: raw.variants ?? [] });
      if (rejected.has(rawPrimary)) { stabilityDropped.push({ cardKey: key, productId: rawPrimary, source: prevSource, reason: 'custom-set' }); return; }
      const productId = primaryCardmarketId({ ids: { cardmarket: prev.ids }, variants: prev.variants });
      if (productId === undefined) return;
      const today = todayOf(card);
      if (sameState(card, prev)) return;
      // Gestrige TCGdex-ID: nur wenn heute gar keine Stufe eine ID liefert und sie heute nicht geteilt ist
      // (sonst gewaenne eine geteilte, falsche TCGdex-ID dauerhaft gegen die heutige Korrektur).
      if (prevSource === 'tcgdex') {
        if (today.id !== null) return;
        if (duplicateTcgdexIds[productId]) { stabilityDropped.push({ cardKey: key, productId, source: prevSource, reason: 'shared-tcgdex-id' }); return; }
      }
      if (!exists(productId)) { stabilityDropped.push({ cardKey: key, productId, source: prevSource, reason: 'product-gone' }); return; }
      candidates.push({ set, card, key, prev, prevSource, productId, today });
    });
    const candidateIds = new Set(candidates.map((c) => c.card.id));
    const holders = new Map(); // Produkt-ID -> [{ card, key, rule }]
    walk(({ set, card }) => {
      if (candidateIds.has(card.id)) return;
      const r = results.get(card.id);
      const ids = r ? (r.result?.id !== undefined ? [r.result.id] : []) : [...tcgdexIds(card), ...variantIds(card)];
      for (const id of new Set(ids)) holders.set(id, [...(holders.get(id) ?? []), { card, key: `${set.id}/${card.cardId}`, rule: Boolean(r) }]);
    });
    for (const c of candidates) {
      const { set, card, key, prev, prevSource, productId, today } = c;
      const others = (holders.get(productId) ?? []).filter((h) => !(previous.get(h.key)?.ids ?? []).includes(productId)
        && !(previous.get(h.key)?.variants ?? []).some((v) => v?.cardmarketId === productId));
      if (others.some((h) => !h.rule)) { stabilityConflicts.push({ cardKey: key, productId, heldBy: others.map((h) => h.key).sort() }); continue; }
      for (const h of others) results.get(h.card.id).result = { ambiguous: true, gaveWay: true };
      const ids = (prev.ids ?? []).filter((id) => Number.isInteger(id) && exists(id));
      if (!ids.includes(productId)) ids.unshift(productId);
      const orig = tcgdexBefore.get(card.id) ?? [];
      const next = { ...card.ids, cardmarket: ids };
      delete next.cardmarketSource;
      delete next.cardmarketTcgdex;
      if (prevSource !== 'tcgdex') next.cardmarketSource = prevSource;
      if (orig.length && (orig.length !== ids.length || orig.some((x, i) => x !== ids[i]))) next.cardmarketTcgdex = orig;
      card.ids = next;
      if (Array.isArray(card.variants)) {
        const prevVariants = new Map((prev.variants ?? []).map((v) => [vkey(v), v.cardmarketId]));
        card.variants = card.variants.map((v) => {
          const k = vkey(v);
          let id = prevVariants.has(k) ? prevVariants.get(k) : v.cardmarketId;
          if (typeof id === 'number' && (!exists(id) || (!prevVariants.has(k) && !ids.includes(id)))) id = undefined;
          const { cardmarketId, ...rest } = v;
          return typeof id === 'number' ? { ...rest, cardmarketId: id } : rest;
        });
        // Varianten passen nicht mehr zur gestrigen Karte -> primaere ID ueber ids.cardmarket erzwingen
        if (primaryCardmarketId(card) !== productId) { card.variants = card.variants.map(({ cardmarketId, ...rest }) => rest); c.variantsReset = true; }
      }
      stableCards.add(card.id);
      const row = bySet[set.id];
      if (results.has(card.id)) results.get(card.id).stable = true;
      else row.tcgdex--;
      row.stabilityKept = (row.stabilityKept ?? 0) + 1;
      stabilityKept.push({
        cardKey: key, productId, source: prevSource, todayId: today.id, todaySource: today.source,
        ...(others.length ? { displaced: others.map((h) => h.key).sort() } : {}), ...(c.variantsReset ? { variantsReset: true } : {}),
      });
    }
  }

  // 4. Schreiben und zaehlen
  const rules = { energySymbol: 0, leftRight: 0, ordered: 0, orderedRejected: orderedRejected.length, override: overrideReport.applied + overrideReport.removed, oversizeExcluded: 0, versionSuffixSkipped: 0 };
  const push = (row, key, cardId) => { (row[key] ??= []).push(cardId); };
  const open = [];
  for (const entry of results.values()) {
    const { setId, card, subset, result } = entry;
    const row = bySet[setId];
    if (entry.stable) continue;
    if (result?.id !== undefined) {
      const source = result.source ?? 'matched';
      row.matched++;
      if (source !== 'matched') { rules[source]++; row[source] = (row[source] ?? 0) + 1; }
      card.ids = { ...card.ids, cardmarket: [result.id], cardmarketSource: source };
      continue;
    }
    row.missing++;
    if (result?.ambiguous) { row.ambiguous++; push(row, 'ambiguousCards', card.cardId); }
    if (row.expansionId === null && !subset) continue;
    push(row, 'missingCards', card.cardId);
    if (subset) push(row, 'subsetMissing', card.cardId);
    open.push(entry);
  }

  // Arbeitsliste fuer cardmarket-overrides.json: bis zu 5 freie Produkte der Expansion, gleicher Name
  // (auch mit Energie-Symbol) vor gleicher Nummer vor gemeinsamen Woertern.
  const held = new Set();
  for (const cards of cardsBySet.values()) {
    for (const c of cards) {
      for (const id of tcgdexIds(c)) held.add(id);
      for (const v of c.variants ?? []) if (typeof v?.cardmarketId === 'number') held.add(v.cardmarketId);
    }
  }
  // Hinweise je Kandidat: mehrere gleichnamige Produkte ohne Nummer (Sonder-/Oversize-Druck moeglich) oder
  // Produkt-ID weit ausserhalb des Hauptbereichs der Expansion (10.-90. Perzentil, Abstand > Spanne + 100).
  const idRange = new Map();
  const rangeOf = (index) => {
    if (!idRange.has(index)) {
      const ids = index.all.map((p) => p.id).sort((a, b) => a - b);
      const lo = ids[Math.floor(0.1 * (ids.length - 1))];
      const hi = ids[Math.floor(0.9 * (ids.length - 1))];
      const margin = hi - lo + 100;
      idRange.set(index, [lo - margin, hi + margin]);
    }
    return idRange.get(index);
  };
  const hintFor = (p, index) => {
    const hints = [];
    if ((index.byName.get(p.name) ?? []).filter((x) => x.number === null).length > 1) hints.push('same-name-unnumbered');
    const [lo, hi] = rangeOf(index);
    if (p.id < lo || p.id > hi) hints.push('id-outlier');
    return hints.length ? { hint: hints.join(', ') } : {};
  };
  const candidatesFor = (card, index) => {
    if (!index) return [];
    const name = normalizeCmName(card.name);
    const number = normalizeCmNumber(card.number);
    const words = new Set(wordsOf(card.name));
    const free = index.all.filter((p) => !held.has(p.id));
    const scored = free.map((p) => {
      let score = (p.name === name || p.energy === name ? 100 : 0) + (number && p.number === number ? 50 : 0);
      for (const w of new Set(wordsOf(p.raw))) if (words.has(w)) score += 10;
      return { p, score };
    });
    let pick = scored.filter((x) => x.score > 0);
    if (!pick.length && free.length <= 5) pick = scored;
    return pick.sort((a, b) => b.score - a.score || a.p.id - b.p.id).slice(0, 5).map(({ p }) => ({ productId: p.id, name: p.raw, ...hintFor(p, index) }));
  };
  const stillMissing = open.map(({ setId, card, exp, index }) => ({
    cardKey: `${setId}/${card.cardId}`, name: card.name, deName: card.i18n?.de?.name ?? null, set: setId, expansionId: exp,
    candidates: candidatesFor(card, index),
  }));
  const byExp = new Map();
  for (const m of stillMissing) {
    if (m.expansionId === null) continue;
    const e = byExp.get(m.expansionId) ?? { expansionId: m.expansionId, count: 0, sets: new Set() };
    e.count++;
    e.sets.add(m.set);
    byExp.set(m.expansionId, e);
  }
  const stillMissingByExpansion = [...byExp.values()]
    .sort((a, b) => b.count - a.count || a.expansionId - b.expansionId)
    .map((e) => ({ ...e, sets: [...e.sets].sort() }));

  // Oversize-Produkte und Produkte mit Versions-Suffix ("4V2", "224a"), die keine Karte bekommen hat
  const oversizeExcludedProducts = [];
  const versionSuffixSkippedByExpansion = {};
  for (const [expansionId, index] of indexes) {
    if (!index) continue;
    for (const p of index.oversized) oversizeExcludedProducts.push({ ...p, expansionId });
    const n = index.all.filter((p) => p.number && VERSION_SUFFIX.test(p.number) && !held.has(p.id)).length;
    if (n) versionSuffixSkippedByExpansion[expansionId] = n;
    rules.versionSuffixSkipped += n;
  }
  oversizeExcludedProducts.sort((a, b) => a.productId - b.productId);
  rules.oversizeExcluded = oversizeExcludedProducts.length;

  const totals = { cards: 0, tcgdex: 0, matched: 0, missing: 0, ambiguous: 0, override: 0, customSet: 0, stabilityKept: 0 };
  for (const row of Object.values(bySet)) for (const k of Object.keys(totals)) totals[k] += row[k] ?? 0;
  return {
    totals, rules, bySet, duplicateTcgdexIds, duplicates: dup, expansionMismatch, setsWithoutExpansion,
    customSets: customSetReport, stabilityKept, stabilityDropped, stabilityConflicts,
    overrides: overrideReport, orderedRejected, oversizeExcludedProducts, versionSuffixSkippedByExpansion, stillMissing, stillMissingByExpansion,
  };
}
