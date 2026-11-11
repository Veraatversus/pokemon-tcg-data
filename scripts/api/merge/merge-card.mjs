// Fuehrt eine kanonische Karte aus pokemontcg-Snapshot und TCGdex zu einer v3-Karte zusammen (Spec §6).
// Feld-Prioritaet: EN-Texte/rules/subtypes pt -> TCGdex-abgeleitet; legalities immer TCGdex;
// DE-Texte TCGdex; Bilder TCGdex (EN) -> pt-Legacy-URL; Varianten/Cardmarket-IDs TCGdex;
// Set-Zuordnung und Schluessel aus der Registry.
//
// tcgdexCards: geladene TCGdex-Karten in Registry-Reihenfolge, jeweils mit `set` = geladenes
// TCGdex-Set ({ id, serieId, ... }); die erste ist die Primaerkarte.
import { subtypesKey, rulesKey } from './learn-tables.mjs';
import { deriveLegalities } from './legalities.mjs';
import { resolveImages } from './images.mjs';

const SUPERTYPE = { Pokemon: 'Pokémon', Trainer: 'Trainer', Energy: 'Energy' };
const STAGE = { Stage1: 'Stage 1', Stage2: 'Stage 2', 'LEVEL-UP': 'Level-Up', RESTORED: 'Restored' };
const ENERGY_TYPE = { Normal: 'Basic' };

export const decodeLocalId = (localId) => {
  try {
    return decodeURIComponent(localId);
  } catch {
    return localId;
  }
};

// Bild-URLs; der Assets-Index kann die localId dekodiert ('?') oder roh ('%3F') fuehren.
// Der URL-Pfad ist immer die URL-kodierte dekodierte Form.
export function cardImages(index, lang, card) {
  const decoded = decodeLocalId(card.localId);
  for (const key of [...new Set([decoded, card.localId])]) {
    const found = resolveImages(index, { lang, serieId: card.set?.serieId, setId: card.set?.id, localId: key });
    if (!found) continue;
    const seg = encodeURIComponent(decoded);
    if (seg === key) return found;
    const base = `https://assets.tcgdex.net/${lang}/${card.set.serieId}/${card.set.id}/${seg}`;
    return { small: `${base}/low.webp`, large: `${base}/high.webp` };
  }
  return null;
}

const compact = (obj) => {
  const out = {};
  for (const [k, v] of Object.entries(obj)) if (v !== undefined) out[k] = v;
  return out;
};
const nonEmpty = (list) => (Array.isArray(list) && list.length ? list : undefined);
const firstOf = (...values) => values.find((v) => v !== undefined && v !== null);
const textOf = (langs, lang) => (langs && typeof langs[lang] === 'string' ? langs[lang] : undefined);
const anyText = (langs) => (langs ? firstOf(textOf(langs, 'en'), ...Object.values(langs).filter((v) => typeof v === 'string')) : undefined);

// Rarity ohne pt-Gegenstueck: Tabelle nur, wenn sie eine reine Schreibvariante liefert
// (Kleinschreibung ohne Leerzeichen gleich); die Schreibung mit Leerzeichen wird bevorzugt.
export function mergeRarity(tdRarity, tables) {
  if (!tdRarity) return tdRarity;
  const learned = tables?.rarity?.[tdRarity];
  const squash = (s) => String(s).toLowerCase().replace(/\s+/g, '');
  if (!learned || squash(learned) !== squash(tdRarity)) return tdRarity;
  if (/\s/.test(learned)) return learned;
  if (/\s/.test(tdRarity)) return tdRarity;
  return learned;
}

function deriveSubtypes(td, tables) {
  const key = subtypesKey(td);
  if (tables?.subtypes?.[key]) return tables.subtypes[key];
  const list = [
    td.stage ? (STAGE[td.stage] ?? td.stage) : undefined,
    td.suffix,
    td.trainerType,
    td.energyType ? (ENERGY_TYPE[td.energyType] ?? td.energyType) : undefined,
  ].filter(Boolean);
  return nonEmpty(list);
}

function deriveRules(td, tables) {
  const out = [];
  const effect = textOf(td.effect, 'en');
  if (td.category !== 'Pokemon' && effect) out.push(effect);
  const key = rulesKey(td);
  if (!/^[|]*$/.test(key)) out.push(...(tables?.rules?.[key] ?? []));
  return nonEmpty(out);
}

const tdAttacks = (td) => nonEmpty((td.attacks ?? []).map((a) => compact({
  name: anyText(a.name) ?? '',
  cost: a.cost ?? [],
  convertedEnergyCost: (a.cost ?? []).length,
  damage: a.damage === undefined || a.damage === null ? '' : String(a.damage),
  text: textOf(a.effect, 'en') ?? '',
})));

const tdAbilities = (td) => nonEmpty((td.abilities ?? []).map((a) => compact({
  name: anyText(a.name) ?? '', text: textOf(a.effect, 'en') ?? '', type: a.type,
})));

const deTexts = (list) => {
  const out = (list ?? []).map((a) => compact({ name: textOf(a.name, 'de'), text: textOf(a.effect, 'de') }));
  return out.some((a) => a.name !== undefined || a.text !== undefined) ? out : undefined;
};

function variantsOf(td) {
  const v = td.variants;
  if (Array.isArray(v)) {
    return v.map((x) => compact({
      type: x.type, subtype: x.subtype, size: x.size, stamp: nonEmpty(x.stamp), foil: x.foil,
      cardmarketId: x.thirdParty?.cardmarket, tcgplayerId: x.thirdParty?.tcgplayer,
    }));
  }
  if (v && typeof v === 'object') return Object.keys(v).filter((k) => v[k] === true).map((type) => ({ type }));
  return [];
}

const uniqNums = (values) => [...new Set(values.filter((x) => typeof x === 'number'))].sort((a, b) => a - b);

export function mergeCard({
  canonicalSetId, canonicalCardId, registryCard, ptCard = null, tcgdexCards = [], tcgdexSet = null,
  tables = {}, legals, assetsIndex, sourceCommits = {},
}) {
  const td = tcgdexCards[0] ?? null;
  const pt = ptCard ?? {};
  const has = (k) => ptCard && ptCard[k] !== undefined && ptCard[k] !== null;
  const from = (k, derive) => (has(k) ? pt[k] : (td ? derive() : undefined));

  const matchStatus = ptCard ? (td ? 'matched' : 'primary_only') : 'tcgdex_only';
  const retreat = typeof td?.retreat === 'number' ? td.retreat : undefined;

  const legalInput = td
    ? { tcgdexSetId: td.set?.id, serieId: td.set?.serieId, localId: td.localId, regulationMark: firstOf(pt.regulationMark, td.regulationMark) }
    : (tcgdexSet ? { tcgdexSetId: tcgdexSet.id, serieId: tcgdexSet.serieId, localId: pt.number, regulationMark: pt.regulationMark } : null);
  const legalities = legalInput && legals ? deriveLegalities(legalInput, legals) : { unlimited: 'Legal' };

  let images;
  for (const c of tcgdexCards) {
    images = cardImages(assetsIndex, 'en', c);
    if (images) break;
  }
  if (!images && pt.images?.small) images = compact({ small: pt.images.small, large: pt.images.large });

  let deImages;
  for (const c of tcgdexCards) {
    deImages = cardImages(assetsIndex, 'de', c);
    if (deImages) break;
  }
  const de = td ? compact({
    name: textOf(td.name, 'de'),
    evolvesFrom: textOf(td.evolveFrom, 'de'),
    abilities: deTexts(td.abilities),
    attacks: deTexts(td.attacks),
    rules: textOf(td.effect, 'de') ? [td.effect.de] : undefined,
    flavorText: textOf(td.description, 'de'),
    images: deImages ?? undefined,
  }) : {};

  const variants = tcgdexCards.flatMap(variantsOf);
  const thirdParty = tcgdexCards.map((c) => c.thirdParty ?? {});
  const tdRef = registryCard?.tcgdex?.[0];

  return compact({
    id: `${canonicalSetId}-${canonicalCardId}`,
    setId: canonicalSetId,
    cardId: canonicalCardId,
    matchStatus,
    number: ptCard ? pt.number : (td ? decodeLocalId(td.localId) : undefined),
    name: ptCard ? pt.name : anyText(td?.name),
    supertype: from('supertype', () => tables?.supertype?.[td.category] ?? SUPERTYPE[td.category] ?? td.category),
    subtypes: from('subtypes', () => deriveSubtypes(td, tables)),
    level: from('level', () => (td.level !== undefined ? String(td.level) : undefined)),
    hp: from('hp', () => (td.hp !== undefined ? String(td.hp) : undefined)),
    types: from('types', () => nonEmpty(td.types)),
    evolvesFrom: from('evolvesFrom', () => textOf(td.evolveFrom, 'en')),
    evolvesTo: pt.evolvesTo,
    rules: from('rules', () => deriveRules(td, tables)),
    ancientTrait: pt.ancientTrait,
    abilities: from('abilities', () => tdAbilities(td)),
    attacks: from('attacks', () => tdAttacks(td)),
    weaknesses: from('weaknesses', () => nonEmpty(td.weaknesses?.map((w) => compact({ type: w.type, value: w.value })))),
    resistances: from('resistances', () => nonEmpty(td.resistances?.map((w) => compact({ type: w.type, value: w.value })))),
    retreatCost: from('retreatCost', () => (retreat ? Array(retreat).fill('Colorless') : undefined)),
    convertedRetreatCost: from('convertedRetreatCost', () => retreat),
    artist: from('artist', () => td.illustrator),
    rarity: has('rarity') ? pt.rarity : mergeRarity(td?.rarity, tables),
    flavorText: from('flavorText', () => textOf(td.description, 'en')),
    nationalPokedexNumbers: from('nationalPokedexNumbers', () => nonEmpty(td.dexId)),
    regulationMark: from('regulationMark', () => td.regulationMark),
    legalities,
    images: images ?? undefined,
    i18n: Object.keys(de).length ? { de } : undefined,
    variants: nonEmpty(variants),
    ids: {
      pokemontcg: ptCard?.id ?? registryCard?.pokemontcg ?? null,
      tcgdex: tdRef ? `${tdRef.set}-${tdRef.localId}` : null,
      cardmarket: uniqNums([...variants.map((x) => x.cardmarketId), ...thirdParty.map((x) => x.cardmarket)]),
      tcgplayer: uniqNums([...variants.map((x) => x.tcgplayerId), ...thirdParty.map((x) => x.tcgplayer)]),
    },
    sources: compact({
      pokemontcg: ptCard ? sourceCommits.pokemontcg : undefined,
      tcgdex: td ? sourceCommits.tcgdex : undefined,
    }),
  });
}
