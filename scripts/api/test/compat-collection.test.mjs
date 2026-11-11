import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readRegistry } from '../registry/registry-io.mjs';
import { resolveCollectionKey, findAmbiguousKey, registryViolations } from '../registry/build-registry.mjs';
import { parseCsv } from '../lib/csv.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const registry = readRegistry(path.join(repoRoot, 'api', 'registry'));
const fixtureDir = path.join(repoRoot, '.local', 'fixtures');
const files = fs.existsSync(fixtureDir) ? fs.readdirSync(fixtureDir).filter((f) => f.endsWith('db_collection.csv')).sort() : [];

test('Registry ist vorhanden und verletzt keine Invarianten', () => {
  assert.ok(registry, 'api/registry fehlt');
  assert.deepEqual(registryViolations(registry), []);
});

test('Registry: kanonische Schluessel loesen auf genau ihre Karte auf', () => {
  const bad = [];
  let canonical = 0;
  for (const [setId, cards] of Object.entries(registry.cards)) {
    for (const [cid, c] of Object.entries(cards)) {
      canonical++;
      const r = resolveCollectionKey(registry, setId, cid);
      if (r?.setId !== setId || r?.cardId !== cid) bad.push(`${setId}/${cid} -> ${JSON.stringify(r)}`);
      for (const k of c.keys?.pokemontcg ?? []) {
        const r2 = resolveCollectionKey(registry, setId, k);
        if (r2 && (r2.setId !== setId || r2.cardId !== cid)) bad.push(`${setId}/${k} (pt-Alias von ${cid}) -> ${JSON.stringify(r2)}`);
        if (!r2 && !findAmbiguousKey(registry, setId, k)) bad.push(`${setId}/${k} (pt-Alias von ${cid}) loest nicht auf`);
      }
    }
  }
  assert.deepEqual(bad.slice(0, 20), []);
  assert.ok(canonical > 20000);
});

test('Registry: jeder Set-Alias und jedes mergedSubset erreicht mindestens eine Karte, nie eine fremde', (t) => {
  const bad = [];
  let aliasCount = 0;
  for (const [setId, set] of Object.entries(registry.sets)) {
    const cards = registry.cards[setId] ?? {};
    for (const a of [...(set.aliases ?? []), ...(set.mergedSubsets ?? [])]) {
      aliasCount++;
      let reachable = 0;
      const candidates = [];
      if (a.startsWith('TCGDEX-')) {
        const td = a.slice('TCGDEX-'.length);
        for (const [cid, c] of Object.entries(cards)) {
          for (const r of c.tcgdex ?? []) if (r.set === td) candidates.push([cid, r.localId]);
        }
      } else {
        for (const [cid, c] of Object.entries(cards)) {
          candidates.push([cid, cid]);
          for (const k of c.keys?.pokemontcg ?? []) {
            if (k !== cid && !findAmbiguousKey(registry, a, k)) candidates.push([cid, k]);
          }
        }
      }
      for (const [cid, key] of candidates) {
        const res = resolveCollectionKey(registry, a, key);
        if (!res) continue;
        if (res.setId !== setId) bad.push(`Alias ${a}/${key} -> fremdes Set ${res.setId}`);
        else if (res.cardId !== cid) bad.push(`Alias ${a}/${key}: erwartet ${setId}/${cid}, erhalten ${res.setId}/${res.cardId}`);
        else reachable++;
      }
      if (!reachable) bad.push(`Alias ${a} (Set ${setId}): keine Karte erreichbar (${candidates.length} Kandidaten)`);
    }
  }
  t.diagnostic(`Set-Aliase/mergedSubsets geprueft: ${aliasCount}`);
  assert.deepEqual(bad.slice(0, 20), []);
  assert.ok(aliasCount > 100);
});

test('Registry: keys.tcgdex-Aliase loesen unter TCGDEX-<set> auf ihre Karte auf (oder sind mehrdeutig)', (t) => {
  const bad = [];
  let checked = 0;
  let ambiguousSkipped = 0;
  for (const [setId, cards] of Object.entries(registry.cards)) {
    const owners = new Map();
    for (const [cid, c] of Object.entries(cards)) {
      for (const r of c.tcgdex ?? []) {
        const k = `${r.set}|${r.localId}`;
        owners.set(k, [...(owners.get(k) ?? []), cid]);
      }
    }
    for (const [cid, c] of Object.entries(cards)) {
      for (const r of c.tcgdex ?? []) {
        if (!(c.keys?.tcgdex ?? []).includes(r.localId)) continue;
        checked++;
        const res = resolveCollectionKey(registry, `TCGDEX-${r.set}`, r.localId);
        if (res?.setId === setId && res.cardId === cid) continue;
        if (!res && owners.get(`${r.set}|${r.localId}`).length > 1) { ambiguousSkipped++; continue; }
        bad.push(`TCGDEX-${r.set}/${r.localId} (Karte ${setId}/${cid}) -> ${JSON.stringify(res)}`);
      }
    }
  }
  t.diagnostic(`keys.tcgdex geprueft: ${checked}, mehrdeutig uebersprungen: ${ambiguousSkipped}`);
  assert.deepEqual(bad.slice(0, 20), []);
  assert.ok(checked > 15000);
});

if (!files.length) {
  test('Sammlungs-Fixtures (.local/fixtures/*db_collection.csv)', { skip: 'keine privaten Fixtures vorhanden' }, () => {});
}

for (const file of files) {
  test(`Sammlungs-DB kompatibel: ${file}`, (t) => {
    const rows = parseCsv(fs.readFileSync(path.join(fixtureDir, file), 'utf8'));
    const header = rows.shift();
    const col = Object.fromEntries(header.map((h, i) => [h.trim(), i]));
    for (const k of ['setId', 'cardId', 'g', 'rh']) assert.ok(k in col, `Spalte ${k} fehlt`);
    const badValues = new Set();
    const isTrue = (v) => {
      const x = String(v ?? '').trim().toUpperCase();
      if (['TRUE', 'WAHR', '1'].includes(x)) return true;
      if (['FALSE', 'FALSCH', '0', ''].includes(x)) return false;
      badValues.add(JSON.stringify(x));
      return false;
    };

    let nonEmpty = 0;
    let resolved = 0;
    let ambiguous = 0;
    let orphaned = 0;
    const target = new Map();
    const orphanKeys = [];
    const stats = { g: 0, rh: 0, gResolved: 0, rhResolved: 0, gAmbiguous: 0, rhAmbiguous: 0 };
    for (const r of rows) {
      const setId = (r[col.setId] ?? '').trim();
      const cardId = (r[col.cardId] ?? '').trim();
      if (!setId && !cardId) continue;
      nonEmpty++;
      const g = isTrue(r[col.g]);
      const rh = isTrue(r[col.rh]);
      if (g) stats.g++;
      if (rh) stats.rh++;
      const res = resolveCollectionKey(registry, setId, cardId);
      if (res) {
        resolved++;
        if (g) stats.gResolved++;
        if (rh) stats.rhResolved++;
        const k = `${res.setId}/${res.cardId}`;
        target.set(k, (target.get(k) ?? 0) + 1);
      } else if (findAmbiguousKey(registry, setId, cardId)) {
        ambiguous++;
        if (g) stats.gAmbiguous++;
        if (rh) stats.rhAmbiguous++;
      } else {
        orphaned++;
        orphanKeys.push(`${setId}/${cardId}`);
      }
    }
    const merged = [...target.values()].filter((n) => n > 1);
    const mergedRows = merged.reduce((a, n) => a + n, 0);
    t.diagnostic(`${file}: Zeilen=${nonEmpty} aufgeloest=${resolved} mehrdeutig=${ambiguous} verwaist=${orphaned}`);
    t.diagnostic(`  g=${stats.g} (aufgeloest ${stats.gResolved}, mehrdeutig ${stats.gAmbiguous}) rh=${stats.rh} (aufgeloest ${stats.rhResolved}, mehrdeutig ${stats.rhAmbiguous})`);
    t.diagnostic(`  auf dieselbe kanonische Karte fallen: ${merged.length} Karten (${mergedRows} Zeilen)`);

    assert.deepEqual([...badValues].slice(0, 10), [], 'unbekannte Boolean-Werte in g/rh');
    assert.ok(nonEmpty > 0, 'Fixture ohne Zeilen');
    assert.ok(stats.g + stats.rh > 0, 'Fixture ohne g/rh-Eintraege');
    assert.equal(nonEmpty, resolved + ambiguous + orphaned);
    assert.deepEqual(orphanKeys.slice(0, 20), [], 'verwaiste Zeilen');
    assert.equal(orphaned, 0);
    assert.equal(stats.g, stats.gResolved + stats.gAmbiguous);
    assert.equal(stats.rh, stats.rhResolved + stats.rhAmbiguous);
  });
}
