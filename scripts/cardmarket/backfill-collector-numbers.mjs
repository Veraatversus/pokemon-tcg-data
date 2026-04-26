import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { backfillCollectorNumbersInArtifactsDir } from './build-cardmarket-data.mjs';

function parseArgs(argv = []) {
  const setIds = [];
  let timeoutMs = 15000;

  for (let index = 0; index < argv.length; index += 1) {
    const token = String(argv[index] || '').trim();
    if (!token) continue;

    if (token === '--set') {
      const value = String(argv[index + 1] || '').trim();
      if (value) {
        value.split(',').map((item) => String(item || '').trim()).filter(Boolean).forEach((item) => setIds.push(item));
      }
      index += 1;
      continue;
    }

    if (token.startsWith('--set=')) {
      token.slice('--set='.length).split(',').map((item) => String(item || '').trim()).filter(Boolean).forEach((item) => setIds.push(item));
      continue;
    }

    if (token === '--timeout-ms') {
      const value = Number(argv[index + 1]);
      if (Number.isFinite(value) && value > 0) timeoutMs = value;
      index += 1;
      continue;
    }

    if (token.startsWith('--timeout-ms=')) {
      const value = Number(token.slice('--timeout-ms='.length));
      if (Number.isFinite(value) && value > 0) timeoutMs = value;
    }
  }

  return {
    setIds: Array.from(new Set(setIds)),
    timeoutMs,
  };
}

async function resolveDefaultOutputDirs(repoRoot) {
  const dirs = [path.join(repoRoot, 'cardmarket')];
  const frontendOutputDir = path.join(repoRoot, 'frontend', 'tcg-tracker-web', 'cardmarket');

  try {
    await fs.access(frontendOutputDir);
    dirs.push(frontendOutputDir);
  } catch {
    // local workspaces can omit the mirrored frontend artifacts
  }

  return dirs;
}

async function main() {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
  const outputDirs = await resolveDefaultOutputDirs(repoRoot);
  const options = parseArgs(process.argv.slice(2));

  let totalFilesUpdated = 0;
  let totalProductsAnnotated = 0;

  for (const outputDir of outputDirs) {
    const result = await backfillCollectorNumbersInArtifactsDir(outputDir, {
      setIds: options.setIds,
      fetchProductPage: (productId) => fetch(`https://www.cardmarket.com/de/Pokemon/Products?idProduct=${encodeURIComponent(productId)}`, {
        signal: AbortSignal.timeout(options.timeoutMs),
        headers: {
          'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36',
          accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'accept-language': 'de-DE,de;q=0.9,en;q=0.8',
          referer: 'https://www.cardmarket.com/de/Pokemon',
        },
      }).then((response) => {
        if (!response.ok) {
          throw new Error(`Failed to fetch Cardmarket product ${productId}: ${response.status} ${response.statusText}`);
        }
        return response.text();
      }),
    });
    totalFilesUpdated += result.filesUpdated;
    totalProductsAnnotated += result.productsAnnotated;
    console.log(`[cardmarket-backfill] ${outputDir}: ${result.filesUpdated} files updated, ${result.productsAnnotated} products annotated`);
  }

  console.log(`[cardmarket-backfill] done: ${totalFilesUpdated} files updated, ${totalProductsAnnotated} products annotated`);
}

const isDirectRun = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isDirectRun) {
  main().catch((error) => {
    console.error('[cardmarket-backfill] failed:', error);
    process.exitCode = 1;
  });
}