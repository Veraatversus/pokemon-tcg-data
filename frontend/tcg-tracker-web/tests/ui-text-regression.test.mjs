import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const appJsPath = path.resolve(__dirname, '../js/app.js');

const forbiddenSnippets = [
  '?? Modus: Alle Sets',
  '?? Modus: Importierte Sets',
  '?? App installieren',
  '?? Live-Update empfangen',
  '?? App wurde aktualisiert',
  '?? Verbindung zu Google Sheets wiederhergestellt',
  '?? Keine Verbindung zu Google Sheets',
  '?? Keyboard Shortcuts',
  'Pok�mon TCG Tracker',
  'Neue Tabelle wird erstellt�',
  'Spreadsheet-ID wurde nicht zur�ckgegeben.',
  'Speichert�',
  'Bitte w�hlen�',
  '>???</button>',
  '? Importieren</button>',
  'Troph�enwand',
  'gl�nzt',
  'n�chsten Meilenstein',
  'f�r den aktuellen Filter',
  'ausw�hlen.'
];

test('app.js should not contain known broken ui labels from mojibake wave', async () => {
  const source = await readFile(appJsPath, 'utf8');
  const found = forbiddenSnippets.filter((snippet) => source.includes(snippet));
  assert.deepEqual(
    found,
    [],
    `Found broken UI snippets in app.js: ${found.join(', ')}`
  );
});
