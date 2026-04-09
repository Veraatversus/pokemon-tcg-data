import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(__dirname, '..');
const indexHtml = await readFile(path.join(appRoot, 'index.html'), 'utf8');
const componentsJs = await readFile(path.join(appRoot, 'js', 'ui', 'components.js'), 'utf8');

assert.ok(
  indexHtml.includes('data-dashboard-view="not-imported"'),
  'Das vereinheitlichte Filtermenü soll weiterhin einen Dashboard-Filter für nicht importierte Sets anbieten.'
);

assert.ok(
  indexHtml.includes('data-dashboard-view="favorites"'),
  'Das vereinheitlichte Filtermenü soll weiterhin einen Dashboard-Filter für Favoriten anbieten.'
);

assert.ok(
  !componentsJs.includes("key: 'notImported'"),
  'Der Schnellfilter-Bereich soll keinen zweiten separaten „Nicht importiert“-Button mehr rendern.'
);

assert.ok(
  !componentsJs.includes("key: 'favoritesOnly'"),
  'Der Schnellfilter-Bereich soll keinen zweiten separaten Favoriten-Button mehr rendern.'
);

assert.ok(
  indexHtml.includes('dashboard-discovery-bar'),
  'Das Dashboard soll einen gemeinsamen Such-/Filter-Container statt zwei getrennten Menüs verwenden.'
);

assert.ok(
  indexHtml.includes('dashboard-filter-rail'),
  'Alle Filterfunktionen sollen in einer gemeinsamen Filterleiste zusammenlaufen.'
);

assert.ok(
  !indexHtml.includes('dashboard-filter-group--status'),
  'Es soll keinen separat abgesetzten zweiten Statusfilter-Block mehr geben.'
);

console.log('✅ dashboard unified filter regression ok');