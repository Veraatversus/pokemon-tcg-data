import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { runBuild } from '../build-api.mjs';
import { readRegistry } from '../registry/registry-io.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const apiV3 = path.join(repoRoot, 'api', 'v3');
const registry = readRegistry(path.join(repoRoot, 'api', 'registry'));
let tmp;
let result;
let built; // Map setId -> Map cardId -> card
let normal; // aus committetem api/v3
let metaBefore;
const metaFile = path.join(apiV3, 'meta.json');
const fileStamp = (f) => { const st = fs.statSync(f); return `${st.mtimeMs}:${st.size}:${createHash('sha256').update(fs.readFileSync(f)).digest('hex')}`; };

const loadDir = (dir) => {
  const m = new Map();
  for (const f of fs.readdirSync(path.join(dir, 'cards')).filter((x) => x.endsWith('.json'))) {
    m.set(f.slice(0, -5), new Map(JSON.parse(fs.readFileSync(path.join(dir, 'cards', f), 'utf8')).map((c) => [c.cardId, c])));
  }
  return m;
};

before(() => {
  metaBefore = fileStamp(metaFile);
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tcgdex-only-'));
  result = runBuild({ repoRoot, tcgdexOnly: true, outDir: tmp });
  built = loadDir(tmp);
  normal = loadDir(apiV3);
});
after(() => { if (tmp) fs.rmSync(tmp, { recursive: true, force: true }); });

test('TCGdex-only: gleiche Sets, Karten = Normalbuild minus pokemontcg-only-Registrykarten', (t) => {
  const expectedMissing = new Set();
  for (const [setId, cards] of Object.entries(registry.cards)) {
    for (const [cid, c] of Object.entries(cards)) {
      if (c.pokemontcg != null && !(c.tcgdex ?? []).length) expectedMissing.add(`${setId}/${cid}`);
    }
  }
  const keys = (m) => new Set([...m].flatMap(([s, cards]) => [...cards.keys()].map((c) => `${s}/${c}`)));
  const builtKeys = keys(built);
  const normalKeys = keys(normal);
  t.diagnostic(`Sets: tcgdex-only=${built.size} normal=${normal.size}; Karten: tcgdex-only=${builtKeys.size} normal=${normalKeys.size}; pokemontcg-only in Registry=${expectedMissing.size}`);
  assert.deepEqual([...built.keys()].sort(), [...normal.keys()].sort());
  const expected = new Set([...normalKeys].filter((k) => !expectedMissing.has(k)));
  const missing = [...expected].filter((k) => !builtKeys.has(k));
  const extra = [...builtKeys].filter((k) => !expected.has(k));
  assert.deepEqual({ missing: missing.slice(0, 20), extra: extra.slice(0, 20) }, { missing: [], extra: [] });
  assert.equal(normalKeys.size - builtKeys.size, expectedMissing.size);
  assert.equal(result.cards, builtKeys.size);
});

test('TCGdex-only: Pflichtfelder jeder Karte', (t) => {
  // `images` fehlt laut Build-Design (Warnung missingImages) bei Karten ohne jede Bildquelle. Im tcgdex-only-Build
  // fehlen zusaetzlich Bilder, die im Normalbuild nur von pokemontcg stammen (wird nur geloggt).
  const bad = [];
  let noImage = 0;
  let onlyPtImage = 0;
  for (const [s, cards] of built) {
    for (const [id, c] of cards) {
      for (const f of ['name', 'number', 'supertype', 'legalities']) {
        if (c[f] == null || c[f] === '') bad.push(`${s}/${id}:${f}`);
      }
      if (!c.images?.small) {
        noImage++;
        if (normal.get(s)?.get(id)?.images?.small) onlyPtImage++;
      }
    }
  }
  t.diagnostic(`Karten ohne Bildquelle: ${noImage}; Build-Warnung: ${result.missingImages.total}; davon im Normalbuild mit pokemontcg-Bild: ${onlyPtImage}`);
  assert.deepEqual(bad.slice(0, 20), []);
  assert.equal(noImage, result.missingImages.total);
});

test('TCGdex-only: schreibt weder nach api/v3 noch in die Registry', () => {
  assert.equal(fileStamp(metaFile), metaBefore, 'api/v3/meta.json veraendert');
  assert.ok(fs.existsSync(path.join(tmp, 'sets.json')));
  assert.ok(fs.existsSync(path.join(tmp, 'meta.json')));
  assert.deepEqual(readRegistry(path.join(repoRoot, 'api', 'registry')), registry);
});
