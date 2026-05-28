import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const configPath = path.join(rootDir, 'version.config.json');
const configRaw = await readFile(configPath, 'utf8');
const config = JSON.parse(configRaw);
const appVersion = String(config?.appVersion || '').trim();

if (!appVersion) {
  throw new Error('version.config.json enthält keine appVersion');
}

const exts = new Set(['.js', '.html']);
const skipDirs = new Set(['node_modules', '.git', '.playwright-profile']);

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (skipDirs.has(entry.name)) continue;
      files.push(...await walk(fullPath));
      continue;
    }
    if (!entry.isFile()) continue;
    if (!exts.has(path.extname(entry.name))) continue;
    files.push(fullPath);
  }

  return files;
}

function normalizeVersionQueries(source, version) {
  return source.replace(/\?v=[A-Za-z0-9._-]+/g, `?v=${version}`);
}

const files = await walk(rootDir);
let changedCount = 0;

for (const filePath of files) {
  const source = await readFile(filePath, 'utf8');
  const normalized = normalizeVersionQueries(source, appVersion);
  if (normalized === source) continue;
  await writeFile(filePath, normalized, 'utf8');
  changedCount += 1;
}

console.log(`sync-version-query: appVersion=${appVersion}`);
console.log(`sync-version-query: files changed=${changedCount}`);
