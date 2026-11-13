// Task 8d Audit: echte api/v3- und Cardmarket-Daten des Repos. Jede Nicht-Pocket-Karte mit v3-ID wird als
// db_cards-Record mit absichtlich FALSCHER gespeicherter URL nachgebaut; alle Aufloesungswege muessen die
// v3-ID liefern. Zaehlwerte stehen als Diagnose im Testprotokoll (node --test ... zeigt sie mit "ℹ").
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  attachV3CardmarketIds,
  buildCardmarketProductUrl,
  resolveCardmarketLink,
  resolveCardmarketProductId,
  resolveItemCardmarketUrl,
} from '../js/data/cardmarket-url-utils.js';
import { buildV3CardmarketIdMap, buildV3ExpansionIdMap } from '../js/data/v3-cardmarket-ids.js';
import { buildSetCardAssignmentMap, inferCardmarketExpansionIdFromCards } from '../js/data/cardmarket-ui-helpers.js';
import { resolveDisplayCard } from '../js/data/schema-contract.js';
import { primaryCardmarketProductId, toCardRecord } from '../js/data/v3-records.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const v3Dir = path.join(repoRoot, 'api', 'v3');
const cmDir = path.join(repoRoot, 'cardmarket');
const hasData = existsSync(path.join(v3Dir, 'search-index.json')) && existsSync(path.join(cmDir, 'index', 'tracker.json'));
const readJson = (file) => JSON.parse(readFileSync(file, 'utf8'));
const skip = hasData ? false : 'api/v3 bzw. cardmarket/ fehlt im Checkout';

const POCKET_SERIES = 'Pokémon TCG Pocket';

function loadData() {
  const sets = readJson(path.join(v3Dir, 'sets.json'));
  const index = readJson(path.join(v3Dir, 'search-index.json'));
  const tracker = readJson(path.join(cmDir, 'index', 'tracker.json'));
  return { sets, index, tracker };
}

function cardmarketPayload(expansionId) {
  const file = path.join(cmDir, 'sets', `${expansionId}.json`);
  return existsSync(file) ? readJson(file) : null;
}

// db_cards-Zeile wie readDbCardsForSet sie liefert (keine setId, gespeicherte URL = falsche ID).
function staleDbRecord(v3Card, wrongId) {
  const display = resolveDisplayCard({
    cardId: v3Card.id,
    vera_number: v3Card.number,
    vera_name: v3Card.name,
    vera_cardmarket_url: buildCardmarketProductUrl(wrongId),
  });
  return { ...display, collectionKey: String(v3Card.cardId) };
}

test('Audit: jede Nicht-Pocket-Karte mit v3-ID loest trotz falscher gespeicherter URL auf die v3-ID auf', { skip }, (t) => {
  const { sets, index } = loadData();
  const idMap = buildV3CardmarketIdMap(index);
  const counts = { sets: 0, cards: 0, withV3Id: 0, indexMismatch: 0, indexOldRuleTolerated: 0, resolved: 0, matcherKeepsV3: 0, matcherChecked: 0 };
  const failures = [];

  for (const set of sets) {
    if (set.series === POCKET_SERIES) continue;
    const file = path.join(v3Dir, 'cards', `${set.id}.json`);
    if (!existsSync(file)) continue;
    counts.sets += 1;
    const v3Cards = readJson(file);
    const withId = [];
    for (const v3Card of v3Cards) {
      counts.cards += 1;
      // Erwartung aus der gemeinsamen Regel (primaryCardmarketProductId) auf der Kartendatei, nicht aus cm.
      const ruleId = String(primaryCardmarketProductId(v3Card) || '');
      if (!ruleId) continue;
      counts.withV3Id += 1;
      assert.equal(String(toCardRecord(v3Card, set).cardmarketProductId), ruleId, v3Card.id);
      const fromIndex = idMap.get(`id:${String(v3Card.id).toLowerCase()}`) || '';
      let expected = ruleId;
      if (fromIndex !== ruleId) {
        // Uebergang bis zum neuen API-Build: cm nach alter Regel (erste Variante, auch gestempelt) wird
        // nur toleriert, wenn genau das der Unterschied ist; die db_cards-Anreicherung liefert dann cm.
        const oldRule = String((v3Card.variants || []).find((v) => Number(v?.cardmarketId) > 0)?.cardmarketId || '');
        const stampedFirst = oldRule && oldRule === fromIndex
          && (v3Card.variants || []).find((v) => Number(v?.cardmarketId) > 0)?.stamp?.length > 0;
        if (stampedFirst) {
          counts.indexOldRuleTolerated += 1;
          expected = fromIndex;
        } else counts.indexMismatch += 1;
      }
      withId.push({ v3Card, expected });
    }
    if (!withId.length) continue;

    // falsche ID = v3-ID einer anderen Karte desselben Sets (wie beim alten Namens-Matcher)
    const records = withId.map(({ v3Card, expected }, i) => {
      const neighbour = withId[(i + 1) % withId.length].expected;
      return staleDbRecord(v3Card, neighbour !== expected ? neighbour : 1);
    });
    const enriched = attachV3CardmarketIds(records, idMap, { setId: set.id, language: 'de' });

    enriched.forEach((record, i) => {
      const { expected, v3Card } = withId[i];
      const url = buildCardmarketProductUrl(expected);
      const ok = resolveCardmarketProductId(record).productId === expected
        && resolveCardmarketProductId(record).source === 'v3'
        && resolveCardmarketLink(record, { language: 'de' }) === url
        && resolveDisplayCard(record).cardmarketUrl === url
        && record.cardmarketUrl === url
        && resolveItemCardmarketUrl({ card: { ...record, setId: set.id }, isReverseHolo: true }) === `${url}&isReverseHolo=Y`
        && resolveItemCardmarketUrl({ card: record, isReverseHolo: false }) === url;
      if (ok) counts.resolved += 1;
      else if (failures.length < 20) failures.push(`${v3Card.id}: ${record.cardmarketUrl}`);
    });

    // Matcher: v3-Karten behalten ihr Produkt, auch wenn Name/Nummer anders entscheiden wuerden.
    const expansionId = buildV3ExpansionIdMap(sets).get(String(set.id).toLowerCase());
    const payload = expansionId ? cardmarketPayload(expansionId) : null;
    if (payload) {
      const assignment = buildSetCardAssignmentMap(enriched, payload);
      const productIds = new Set(payload.cards.map((entry) => String(entry.cardmarketProductId)));
      enriched.forEach((record, i) => {
        if (!productIds.has(withId[i].expected)) return;
        counts.matcherChecked += 1;
        if (String(assignment.get(record)?.cardmarketProductId) === withId[i].expected) counts.matcherKeepsV3 += 1;
      });
    }
  }

  t.diagnostic(`Audit Karten: ${JSON.stringify(counts)}`);
  assert.deepEqual(failures, []);
  assert.equal(counts.resolved, counts.withV3Id);
  assert.equal(counts.indexMismatch, 0, 'search-index cm = primaryCardmarketProductId der Kartendatei (bis auf gestempelte erste Varianten)');
  assert.equal(counts.matcherKeepsV3, counts.matcherChecked);
  assert.ok(counts.withV3Id > 15000, `zu wenige Karten mit v3-ID: ${counts.withV3Id}`);
});

test('Audit: me55-150 -> 907757, me55-48 -> 907655 (Reverse-Holo-Suffix bleibt)', { skip }, () => {
  const { index } = loadData();
  const idMap = buildV3CardmarketIdMap(index);
  const v3Cards = readJson(path.join(v3Dir, 'cards', 'me55.json'));
  const pick = (id) => v3Cards.find((card) => card.id === id);
  const [card150, card48] = attachV3CardmarketIds(
    [staleDbRecord(pick('me55-150'), 907655), staleDbRecord(pick('me55-48'), 907655)],
    idMap,
    { setId: 'me55', language: 'de' }
  );
  assert.equal(resolveItemCardmarketUrl({ card: card150, isReverseHolo: true }), 'https://www.cardmarket.com/de/Pokemon/Products?idProduct=907757&isReverseHolo=Y');
  assert.equal(resolveItemCardmarketUrl({ card: card48, isReverseHolo: true }), 'https://www.cardmarket.com/de/Pokemon/Products?idProduct=907655&isReverseHolo=Y');
  assert.equal(resolveItemCardmarketUrl({ card: card150, isReverseHolo: false }, { language: 'en' }), 'https://www.cardmarket.com/en/Pokemon/Products?idProduct=907757');
});

test('Audit: Set-Expansion aus v3 ids.cardmarket schlaegt tracker.json', { skip }, (t) => {
  const { sets, tracker } = loadData();
  const expansionMap = buildV3ExpansionIdMap(sets);
  const counts = { sets: 0, withV3Expansion: 0, trackerAgrees: 0, trackerDiffers: 0, trackerMissing: 0, payloadMissing: 0 };
  const differs = [];
  for (const set of sets) {
    if (set.series === POCKET_SERIES) continue;
    counts.sets += 1;
    const v3Expansion = expansionMap.get(String(set.id).toLowerCase());
    if (!v3Expansion) continue;
    counts.withV3Expansion += 1;
    if (!existsSync(path.join(cmDir, 'sets', `${v3Expansion}.json`))) counts.payloadMissing += 1;
    const trackerExpansion = String(tracker.bySetId?.[String(set.id).replace(/^TCGDEX-/i, '').toLowerCase()] || '');
    if (!trackerExpansion) counts.trackerMissing += 1;
    else if (trackerExpansion === v3Expansion) counts.trackerAgrees += 1;
    else {
      counts.trackerDiffers += 1;
      if (differs.length < 15) differs.push(`${set.id}: v3 ${v3Expansion} / tracker ${trackerExpansion}`);
    }
    const inferred = inferCardmarketExpansionIdFromCards([{ setId: set.id }], {}, { trackerSetIndex: tracker, currentSetId: set.id, v3ExpansionId: v3Expansion });
    assert.equal(inferred, v3Expansion, set.id);
  }
  t.diagnostic(`Audit Sets: ${JSON.stringify(counts)}`);
  if (differs.length) t.diagnostic(`v3 != tracker: ${differs.join('; ')}`);
  assert.ok(counts.withV3Expansion > 100);
});
