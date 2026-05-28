import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const jsRoot = path.join(projectRoot, 'js');

const IMPORT_RE = /(?:import|export)\s+(?:[^'";]*?\s+from\s+)?['"]([^'"\n]+)['"]/g;

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await walk(fullPath));
      continue;
    }
    if (entry.isFile() && entry.name.endsWith('.js')) {
      files.push(fullPath);
    }
  }

  return files;
}

function stripQuery(specifier) {
  const queryIndex = specifier.indexOf('?');
  return queryIndex >= 0 ? specifier.slice(0, queryIndex) : specifier;
}

async function fileExists(filePath) {
  try {
    const info = await stat(filePath);
    return info.isFile();
  } catch {
    return false;
  }
}

async function resolveLocalImport(importerPath, specifier) {
  const normalized = stripQuery(specifier);
  const baseResolved = path.resolve(path.dirname(importerPath), normalized);

  if (path.extname(baseResolved)) {
    return (await fileExists(baseResolved)) ? baseResolved : null;
  }

  const withJs = `${baseResolved}.js`;
  if (await fileExists(withJs)) return withJs;

  const asIndex = path.join(baseResolved, 'index.js');
  if (await fileExists(asIndex)) return asIndex;

  return null;
}

function toRel(targetPath) {
  return path.relative(projectRoot, targetPath).replace(/\\/g, '/');
}

function collectCycles(graph) {
  const color = new Map();
  const parent = new Map();
  const stack = [];
  const cycles = [];

  function visit(node) {
    color.set(node, 1);
    stack.push(node);

    for (const next of graph.get(node) || []) {
      const nextColor = color.get(next) || 0;
      if (nextColor === 0) {
        parent.set(next, node);
        visit(next);
      } else if (nextColor === 1) {
        const cycle = [];
        let cursor = stack[stack.length - 1];
        cycle.push(next);
        while (cursor && cursor !== next) {
          cycle.push(cursor);
          cursor = parent.get(cursor);
        }
        cycle.push(next);
        cycle.reverse();
        cycles.push(cycle);
      }
    }

    stack.pop();
    color.set(node, 2);
  }

  for (const node of graph.keys()) {
    if ((color.get(node) || 0) === 0) visit(node);
  }

  const unique = new Map();
  for (const cycle of cycles) {
    const key = cycle.join(' -> ');
    unique.set(key, cycle);
  }

  return [...unique.values()];
}

async function main() {
  const sourceFiles = await walk(jsRoot);
  const unresolved = [];
  const graph = new Map();

  for (const filePath of sourceFiles) {
    const source = await readFile(filePath, 'utf8');
    const importerRel = toRel(filePath);
    const edges = [];

    IMPORT_RE.lastIndex = 0;
    for (const match of source.matchAll(IMPORT_RE)) {
      const specifier = match[1] || '';
      if (!specifier.startsWith('.')) continue;

      const resolved = await resolveLocalImport(filePath, specifier);
      if (!resolved) {
        unresolved.push({ importer: importerRel, specifier });
        continue;
      }

      const resolvedRel = toRel(resolved);
      edges.push(resolvedRel);
    }

    graph.set(importerRel, edges);
  }

  const cycles = collectCycles(graph);

  if (unresolved.length === 0 && cycles.length === 0) {
    console.log('Import health check OK: keine toten Imports, keine Zyklus-Abhaengigkeiten.');
    return;
  }

  if (unresolved.length > 0) {
    console.error('Tote Imports gefunden:');
    for (const item of unresolved) {
      console.error(`- ${item.importer} -> ${item.specifier}`);
    }
  }

  if (cycles.length > 0) {
    console.error('Zyklische Abhaengigkeiten gefunden:');
    for (const cycle of cycles) {
      console.error(`- ${cycle.join(' -> ')}`);
    }
  }

  process.exitCode = 1;
}

main().catch((err) => {
  console.error('Import health check failed:', err);
  process.exitCode = 1;
});
