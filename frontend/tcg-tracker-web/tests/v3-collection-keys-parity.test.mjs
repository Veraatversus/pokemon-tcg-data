// Paritaet Browser-Resolver <-> scripts/api/registry/build-registry.mjs gegen die echte Registry und die lokalen Fixtures.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCollectionKeyResolver } from '../js/data/v3-collection-keys.js';
import { resolveCollectionKey, findAmbiguousKey } from '../../../scripts/api/registry/build-registry.mjs';
import { readRegistry } from '../../../scripts/api/registry/registry-io.mjs';
import { parseCsv } from '../../../scripts/api/lib/csv.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const registry = readRegistry(path.join(root, 'api/registry'));
const cardsBySet = new Map(Object.entries(registry.cards));
const resolver = createCollectionKeyResolver(registry.sets, cardsBySet);

function compare(setKey, cardKey, failures) {
  const ref = resolveCollectionKey(registry, setKey, cardKey);
  const refAmb = findAmbiguousKey(registry, setKey, cardKey);
  const got = resolver.resolve(setKey, cardKey);
  const gotAmb = resolver.ambiguous(setKey, cardKey);
  const okR = JSON.stringify(ref ? { setId: ref.setId, collectionKey: ref.cardId } : null) === JSON.stringify(got);
  const okA = JSON.stringify(refAmb ? { setId: refAmb.setId, legacyKey: refAmb.legacyKey, collectionKeys: refAmb.cardIds } : null)
    === JSON.stringify(gotAmb);
  if (!okR || !okA) failures.push(`${setKey}\u0000${cardKey}`);
}

test('Paritaet ueber die komplette Registry (Aliase x Schluessel x Schreibweisen)', () => {
  assert.ok(registry && Object.keys(registry.sets).length > 0);
  const failures = [];
  let combos = 0;
  let resolved = 0;
  for (const [id, s] of Object.entries(registry.sets)) {
    const aliases = new Set(resolver.aliasesOf(id));
    for (const a of [...aliases]) { aliases.add(a.toLowerCase()); aliases.add(a.toUpperCase()); }
    const keys = new Set();
    for (const [ck, c] of Object.entries(registry.cards[id])) {
      for (const k of [ck, ...(c.keys?.pokemontcg ?? []), ...(c.keys?.tcgdex ?? []), c.ambiguousLegacyKey]) {
        if (k === undefined || k === null) continue;
        keys.add(k); keys.add(String(k).toLowerCase()); keys.add(String(k).toUpperCase());
      }
    }
    assert.ok(aliases.has(id) || aliases.has(id.toLowerCase()), `Alias-Liste enthaelt ${id}`);
    for (const a of aliases) for (const k of keys) {
      combos++;
      if (resolver.resolve(a, k)) resolved++;
      compare(a, k, failures);
    }
  }
  console.log(`# parity registry: sets=${Object.keys(registry.sets).length} combinations=${combos} resolved=${resolved} mismatches=${failures.length}`);
  assert.ok(combos > 0);
  assert.deepEqual(failures.slice(0, 20), []);
});

const fixtureDir = path.join(root, '.local/fixtures');
const fixtures = fs.existsSync(fixtureDir) ? fs.readdirSync(fixtureDir).filter((f) => f.endsWith('db_collection.csv')) : [];

test('Paritaet fuer jede Zeile der db_collection-Fixtures', (t) => {
  if (!fixtures.length) return t.skip('keine .local/fixtures/*db_collection.csv');
  for (const f of fixtures) {
    const rows = parseCsv(fs.readFileSync(path.join(fixtureDir, f), 'utf8'));
    const header = rows[0];
    const si = header.indexOf('setId');
    const ci = header.indexOf('cardId');
    assert.ok(si >= 0 && ci >= 0, 'Spalten setId/cardId');
    const failures = [];
    let n = 0, resolvedN = 0, ambN = 0;
    for (const row of rows.slice(1)) {
      if (row.length <= 1 && !row[0]) continue;
      n++;
      if (resolver.resolve(row[si], row[ci])) resolvedN++;
      else if (resolver.ambiguous(row[si], row[ci])) ambN++;
      compare(row[si], row[ci], failures);
    }
    console.log(`# parity fixture#${fixtures.indexOf(f)}: rows=${n} resolved=${resolvedN} ambiguous=${ambN} unresolved=${n - resolvedN - ambN} mismatches=${failures.length}`);
    assert.deepEqual(failures.slice(0, 20), []);
  }
});
