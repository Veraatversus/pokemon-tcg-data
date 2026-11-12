// Datei-I/O der Registry: <dir>/sets.json, <dir>/cards/<canonicalSetId>.json (dir = api/registry).
import fs from 'node:fs';
import path from 'node:path';

import { SAFE_ID } from './build-registry.mjs';

const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

// Schluessel rekursiv sortiert (Ganzzahl-Schluessel ordnet JS ohnehin numerisch voran).
export function sortKeys(value) {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort(cmp).map((k) => [k, sortKeys(value[k])]));
  }
  return value;
}

// Kompakt (eine Zeile), Schluessel sortiert wie toJson; fuer grosse Dateien (Suchindex).
export const toCompactJson = (value) => `${JSON.stringify(sortKeys(value))}\n`;

export const toJson = (value) => `${JSON.stringify(sortKeys(value), null, 2)}\n`;

// Set-IDs werden zu Dateinamen: nur sichere Zeichen, kein Pfadtrenner, kein fuehrender Punkt.
export function assertSafeSetId(id) {
  if (typeof id !== 'string' || !SAFE_ID.test(id)) {
    throw new Error(`Ungueltige Set-ID '${id}' (erlaubt: ${SAFE_ID.source}, wird als Dateiname verwendet)`);
  }
  return id;
}

export function readRegistry(dir) {
  const setsFile = path.join(dir, 'sets.json');
  if (!fs.existsSync(setsFile)) return null;
  const sets = JSON.parse(fs.readFileSync(setsFile, 'utf8'));
  const cards = {};
  for (const id of Object.keys(sets)) {
    assertSafeSetId(id);
    const file = path.join(dir, 'cards', `${id}.json`);
    if (!fs.existsSync(file)) throw new Error(`Registry unvollstaendig: Kartendatei fuer Set ${id} fehlt (${file})`);
    cards[id] = JSON.parse(fs.readFileSync(file, 'utf8'));
  }
  return { sets, cards };
}

export function writeRegistry(dir, registry) {
  for (const id of Object.keys(registry.sets)) assertSafeSetId(id);
  const cardsDir = path.join(dir, 'cards');
  fs.mkdirSync(cardsDir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'sets.json'), toJson(registry.sets));
  const wanted = new Set();
  for (const id of Object.keys(registry.sets).sort(cmp)) {
    const name = `${id}.json`;
    wanted.add(name);
    fs.writeFileSync(path.join(cardsDir, name), toJson(registry.cards?.[id] ?? {}));
  }
  for (const f of fs.readdirSync(cardsDir)) {
    if (f.endsWith('.json') && !wanted.has(f)) fs.rmSync(path.join(cardsDir, f));
  }
}
