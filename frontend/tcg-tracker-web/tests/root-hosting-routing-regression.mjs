import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(appRoot, '..', '..');

for (const fileName of ['index.html', 'landingpage.html', 'privacy.html', 'kontakt.html']) {
  await assert.doesNotReject(
    access(path.join(repoRoot, fileName)),
    `Im Repo-Root soll ${fileName} für GitHub-Pages/Root-Hosting vorhanden sein.`
  );
}

const appIndex = await readFile(path.join(appRoot, 'index.html'), 'utf8');
assert.ok(
  appIndex.includes('../../landingpage.html'),
  'Der App-Footer soll auf die Root-Landingpage zeigen.'
);
assert.ok(
  appIndex.includes('../../privacy.html'),
  'Der App-Footer soll auf die Root-Datenschutzseite zeigen.'
);
assert.ok(
  appIndex.includes('../../kontakt.html'),
  'Der App-Footer soll auf die Root-Kontaktseite zeigen.'
);

const config = await readFile(path.join(appRoot, 'js', 'core', 'config.js'), 'utf8');
assert.ok(
  config.includes("../../kontakt.html#projektkontakt"),
  'Support-Fallback-Links sollen auf die Root-Kontaktseite zeigen.'
);

console.log('✅ root hosting routing regression ok');
