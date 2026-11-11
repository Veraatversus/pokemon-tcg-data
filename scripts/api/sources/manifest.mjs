// Pflegt sources/SOURCES.json: stabil sortierte Schluessel, 2 Leerzeichen, abschliessender Zeilenumbruch.
import fs from 'node:fs';
import path from 'node:path';

function sortKeys(value) {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((k) => [k, sortKeys(value[k])]));
  }
  return value;
}

export function updateSourcesManifest(file, name, entry) {
  let manifest = {};
  if (fs.existsSync(file)) manifest = JSON.parse(fs.readFileSync(file, 'utf8'));
  manifest[name] = entry;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(sortKeys(manifest), null, 2)}\n`);
}
