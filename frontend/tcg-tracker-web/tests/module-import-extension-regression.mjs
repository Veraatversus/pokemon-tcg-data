import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

const cardmarketDataPath = path.join(repoRoot, 'js', 'data', 'cardmarket-data.js');
const source = await readFile(cardmarketDataPath, 'utf8');

assert.equal(
  source.includes("./cardmarket-ui-helpers.mjs"),
  false,
  'Lokale Browser-Imports sollen keine .mjs-Endung verwenden, damit SimpleHTTP/localhost sie nicht als text/plain ausliefert.'
);

console.log('✅ module import extension regression ok');
