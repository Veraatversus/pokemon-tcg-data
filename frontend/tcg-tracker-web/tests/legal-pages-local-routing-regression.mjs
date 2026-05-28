import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(__dirname, '..');
const appIndex = await readFile(path.join(appRoot, 'index.html'), 'utf8');

for (const fileName of ['index-landingpage.html', 'privacy.html', 'kontakt.html']) {
  await assert.doesNotReject(
    access(path.join(appRoot, fileName)),
    `Im App-Ordner soll eine lokale Routing-Seite für ${fileName} existieren.`
  );
}

assert.ok(
  appIndex.includes('./index-landingpage.html'),
  'Die App soll im Footer für die Landingpage auf index-landingpage.html zeigen.'
);

assert.ok(
  appIndex.includes('./privacy.html'),
  'Die App soll im Footer für Datenschutz auf privacy.html zeigen.'
);

assert.ok(
  appIndex.includes('./kontakt.html'),
  'Die App soll im Footer für Kontakt auf kontakt.html zeigen.'
);

console.log('✅ legal pages local routing regression ok');
