// Stufen 2-3b: Luecken-Regeln (Nummer + Name, Energie-Symbole, mehrere Karten je Produkt, gleichnamige Gruppen).
import { normalizeCmNumber } from './numbers.mjs';
import { normalizeCmName, cardAttackKey } from './names.mjs';
import { matchOne, matchEnergy } from './index-expansion.mjs';
import { tcgdexIds } from './ids.mjs';

const HALF = /\[(left|right)\]\s*$/i;

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

/** Regeln je Karte ohne TCGdex-ID (Stufen 2, 3, 3b). -> { results, orderedRejected } */
export function matchRules(ctx) {
  const { walk, csLocked, locked, taken, indexes } = ctx;
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
  return { results, orderedRejected };
}
