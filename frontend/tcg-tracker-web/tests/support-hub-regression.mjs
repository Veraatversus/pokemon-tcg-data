import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const htmlPath = path.resolve(__dirname, '..', 'index.html');
const componentsPath = path.resolve(__dirname, '..', 'js', 'ui', 'components.js');

const [html, components] = await Promise.all([
  readFile(htmlPath, 'utf8'),
  readFile(componentsPath, 'utf8')
]);

assert.ok(
  html.includes('id="btn-open-support-hub"'),
  'Im App-Footer soll ein sichtbarer, aber dezenter Einstieg für Feedback und Zugang vorhanden sein.'
);

assert.ok(
  html.includes('id="dialog-support-hub"'),
  'Die App soll ein dediziertes Support-/Zugangs-Dialogfenster bereitstellen.'
);

assert.ok(
  html.includes('Bug melden') && html.includes('Feature wünschen') && html.includes('Zugang beantragen'),
  'Der Support-Hub soll die drei Kernpfade Bug, Feature und Zugang direkt erklären.'
);

assert.ok(
  components.includes('Feedback & Zugang'),
  'Im Einstellungsdialog soll es ebenfalls einen Einstieg zu Feedback und Zugang geben.'
);

console.log('✅ support hub regression ok');
