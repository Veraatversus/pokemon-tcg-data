import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const htmlPath = path.resolve(__dirname, '..', 'index.html');
const html = await readFile(htmlPath, 'utf8');

assert.ok(
  html.includes('id="app-legal-footer"'),
  'Die App soll im Footer einen dezenten Bereich mit Links zu den neuen öffentlichen Seiten haben.'
);

assert.ok(
  html.includes('./privacy.html'),
  'Der Footer soll einen direkten Link zur Datenschutzerklärung enthalten.'
);

assert.ok(
  html.includes('./impressum.html'),
  'Der Footer soll einen direkten Link zum Impressum enthalten.'
);

console.log('✅ legal footer links regression ok');
