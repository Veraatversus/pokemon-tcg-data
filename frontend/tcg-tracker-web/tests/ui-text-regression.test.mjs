import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const jsRoot = path.resolve(__dirname, '../js');

// app.js und die daraus ausgelagerten Module (Ansichten, App-Kern, UI-Helfer, Zusatzfunktionen,
// Sheets-Feedback und alle Feature-Module unter js/features/**).
async function listUiSourceFiles() {
  const inDir = async (dir, { recursive = false } = {}) => (await readdir(path.join(jsRoot, dir), { recursive }))
    .filter((name) => name.endsWith('.js'))
    .sort()
    .map((name) => path.join(jsRoot, dir, name));
  return [
    path.join(jsRoot, 'app.js'),
    ...(await inDir('views')),
    ...(await inDir('app')),
    path.join(jsRoot, 'ui', 'helpers.js'),
    path.join(jsRoot, 'ui', 'app-extras.js'),
    path.join(jsRoot, 'ui', 'sheets-feedback.js'),
    ...(await inDir('features', { recursive: true })),
  ];
}

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

test('app.js and extracted ui modules should not contain known broken ui labels from mojibake wave', async () => {
  const found = [];
  for (const file of await listUiSourceFiles()) {
    const source = await readFile(file, 'utf8');
    const relative = path.relative(jsRoot, file).split(path.sep).join('/');
    forbiddenSnippets
      .filter((snippet) => source.includes(snippet))
      .forEach((snippet) => found.push(`${relative}: ${snippet}`));
  }
  assert.deepEqual(
    found,
    [],
    `Found broken UI snippets: ${found.join(', ')}`
  );
});
