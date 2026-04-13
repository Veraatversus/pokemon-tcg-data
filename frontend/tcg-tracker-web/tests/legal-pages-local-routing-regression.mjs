import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(__dirname, '..');
const appIndex = await readFile(path.join(appRoot, 'index.html'), 'utf8');

for (const fileName of ['landingpage.html', 'privacy.html', 'impressum.html']) {
  await assert.doesNotReject(
    access(path.join(appRoot, fileName)),
    `Im App-Ordner soll eine lokale Routing-Seite für ${fileName} existieren.`
  );
}

assert.ok(
  appIndex.includes('../../landingpage.html'),
  'Der App-Footer soll für die Landingpage auf die Root-Seite zeigen.'
);

assert.ok(
  appIndex.includes('../../privacy.html'),
  'Der App-Footer soll für Datenschutz auf die Root-Seite zeigen.'
);

assert.ok(
  appIndex.includes('../../kontakt.html'),
  'Der App-Footer soll für Kontakt auf die Root-Seite zeigen.'
);

console.log('✅ legal pages local routing regression ok');
