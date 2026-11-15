// Produktindex einer Cardmarket-Expansion und die Treffer-Funktionen darauf (Nummer + Name, Energie, Angriffe).
import { normalizeCmNumber, productsByNumber, cardCmNumbers, cardCmNumber } from './numbers.mjs';
import { normalizeCmName, cmEnergyName, cmAttackKey, cardAttackKey, OVERSIZED } from './names.mjs';

const SINGLE_CATEGORY_ID = 51;
const SINGLE_CATEGORY = 'Pokémon Single';

export const isSingle = (p) => p?.categoryId === SINGLE_CATEGORY_ID || p?.categoryName === SINGLE_CATEGORY;

export function indexExpansion(expansion) {
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
  const setSuffix = expansion?.setSuffix && typeof expansion.setSuffix === 'object' ? expansion.setSuffix : null;
  return { byNumber, byName, byId, byEnergy, all, oversized, customSet, setSuffix };
}

// Gleichnamige Produkte ohne Nummer: genau eines mit denselben Angriffs-/Faehigkeitsnamen -> dieses.
function byAttacks(card, sameName) {
  const key = cardAttackKey(card);
  if (!key) return null;
  const equal = sameName.filter((p) => p.attacks === key);
  return equal.length === 1 && equal[0].number === null ? equal[0] : null;
}

// -> { id } | { ambiguous: true } | null
export function matchOne(card, index, taken) {
  const name = normalizeCmName(card.name);
  if (!name) return null;
  const byNumber = productsByNumber(index.byNumber, card).filter((p) => p.name === name && !taken.has(p.id));
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
export function matchEnergy(card, index, taken) {
  const name = normalizeCmName(card.name);
  const all = name ? index.byEnergy.get(name) ?? [] : [];
  if (!all.length) return null;
  const numbers = cardCmNumbers(card);
  const byNumber = all.filter((p) => p.number !== null && numbers.includes(p.number) && !taken.has(p.id));
  if (byNumber.length === 1) return { id: byNumber[0].id, source: 'energySymbol' };
  if (byNumber.length > 1) return { ambiguous: true };
  const free = all.filter((p) => p.number === null && !taken.has(p.id));
  if (all.length === 1 && free.length === 1) return { id: free[0].id, source: 'energySymbol' };
  return free.length ? { ambiguous: true } : null;
}

// Strenger Pfad (nur fuer Korrekturen): genau ein Produkt mit gleicher Nummer und gleichem Namen,
// unabhaengig von belegten IDs; ohne Nummerntreffer nur ein gleichnamiges Produkt ohne Nummer mit
// denselben Angriffs-/Faehigkeitsnamen (nie nur per Name).
export function strictMatch(card, index) {
  const name = normalizeCmName(card.name);
  if (!name || !cardCmNumber(card)) return null;
  const hits = productsByNumber(index.byNumber, card).filter((p) => p.name === name);
  if (hits.length === 1) return hits[0].id;
  if (hits.length > 1) return null;
  return byAttacks(card, index.byName.get(name) ?? [])?.id ?? null;
}
