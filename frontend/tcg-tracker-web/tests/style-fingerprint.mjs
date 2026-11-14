#!/usr/bin/env node
// CLI fuer den Stil-Fingerabdruck (kein *.test.mjs, laeuft nicht in der Unit-Suite).
//   node tests/style-fingerprint.mjs --url <url> --out <file.json> [--width 390|1280] [--theme light|dark] [--click <selector>]
//   node tests/style-fingerprint.mjs --all --outdir <dir> [--base <baseUrl>]   (alle ohne Anmeldung erreichbaren Ansichten x {390,1280} x {light,dark})
//   node tests/style-fingerprint.mjs --compare <a.json> <b.json>
// Theme: Die App hat keinen Theme-Schalter (body.dark ist fest), daher wird prefers-color-scheme per Playwright colorScheme emuliert.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { withBrowser, gotoReady, BASE_URL } from './smoke-utils.mjs';
import { collectStyleFingerprint, compareFingerprints } from './helpers/style-fingerprint.mjs';

const HEIGHTS = { 390: 844, 1280: 800 };
const VIEWS = [
  { name: 'startseite', path: 'index.html' },
  { name: 'landingpage', path: 'index-landingpage.html' },
  { name: 'privacy', path: 'privacy.html' },
  { name: 'kontakt', path: 'kontakt.html' },
  { name: 'dashboard-abgemeldet', path: 'index.html#dashboard' },
  { name: 'einstellungen', path: 'index.html', click: '#btn-open-settings' },
  { name: 'support-hub', path: 'index.html', click: '#btn-open-support-hub' },
];

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function capture(page, { url, width, theme, click }) {
  await page.setViewportSize({ width, height: HEIGHTS[width] || 800 });
  await page.emulateMedia({ colorScheme: theme });
  await gotoReady(page, url);
  if (click) {
    await page.click(click, { timeout: 8000 });
    await page.waitForTimeout(600);
  }
  return collectStyleFingerprint(page);
}

function save(file, data) {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(data, null, 1));
}

function runCompare(fa, fb) {
  const diffs = compareFingerprints(JSON.parse(readFileSync(fa, 'utf8')), JSON.parse(readFileSync(fb, 'utf8')));
  if (!diffs.length) { console.log('0 Abweichungen'); return 0; }
  const byPath = new Map();
  for (const d of diffs) { if (!byPath.has(d.path)) byPath.set(d.path, []); byPath.get(d.path).push(d); }
  for (const [path, list] of byPath) {
    console.log(path);
    for (const d of list) console.log(d.kind === 'property' ? `  ${d.prop}: ${d.a}  ->  ${d.b}` : `  ${d.kind}`);
  }
  console.log(`${diffs.length} Abweichungen in ${byPath.size} Pfaden`);
  return 1;
}

const cmp = process.argv.indexOf('--compare');
if (cmp >= 0) {
  process.exit(runCompare(process.argv[cmp + 1], process.argv[cmp + 2]));
}

if (process.argv.includes('--all')) {
  const base = (arg('base') || `${BASE_URL}/frontend/tcg-tracker-web`).replace(/\/$/, '');
  const outdir = arg('outdir');
  if (!outdir) { console.error('--outdir fehlt'); process.exit(2); }
  let count = 0;
  await withBrowser(async (page) => {
    for (const view of VIEWS) for (const width of [390, 1280]) for (const th of ['light', 'dark']) {
      try {
        const data = await capture(page, { url: `${base}/${view.path}`, width, theme: th, click: view.click });
        save(join(outdir, `${view.name}-${width}-${th}.json`), data);
        count++;
        console.log(`${view.name}-${width}-${th}: ${data.length} Elemente`);
      } catch (e) {
        console.error(`UEBERSPRUNGEN ${view.name}-${width}-${th}: ${e.message.split('\n')[0]}`);
      }
    }
  });
  console.log(`${count} Dateien geschrieben`);
} else {
  const url = arg('url');
  const out = arg('out');
  if (!url || !out) {
    console.error('Usage: --url <url> --out <file.json> [--width 390|1280] [--theme light|dark] [--click <sel>] | --all --outdir <dir> | --compare a b');
    process.exit(2);
  }
  await withBrowser(async (page) => {
    const data = await capture(page, { url, width: Number(arg('width') || 1280), theme: arg('theme') || 'dark', click: arg('click') });
    save(out, data);
    console.log(`${data.length} Elemente -> ${out}`);
  });
}
