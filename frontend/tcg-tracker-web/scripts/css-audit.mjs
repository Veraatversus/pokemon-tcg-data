#!/usr/bin/env node
// CSS-Audit fuer css/** (Reihenfolge wie die <link>-Tags in index.html).
// Meldet:
//   1. Mehrfach definierte Selektoren je Medienabfrage (gleicher @media/@supports/@layer-Kontext),
//      getrennt nach "innerhalb einer Datei" und "dateiuebergreifend in Ladereihenfolge".
//   2. Anzahl !important je Datei.
//   3. Selektoren ohne Vorkommen in HTML/JS (Teilzeichenketten-Regel, siehe isTokenUsed).
// Aufruf: node scripts/css-audit.mjs [--json] [--verbose]
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = new Set(process.argv.slice(2));

// Kontext-At-Regeln: deren Inhalt sind wieder Regeln mit Selektoren.
const GROUPING_AT_RULES = new Set(['media', 'supports', 'layer', 'container', 'document', 'scope']);

function walk(dir, filter) {
  const out = [];
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name.startsWith('.')) continue;
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walk(full, filter));
    else if (filter(full)) out.push(full);
  }
  return out;
}

// Ladereihenfolge aus index.html; CSS-Dateien, die dort fehlen, kommen alphabetisch dahinter.
function cssFilesInLoadOrder() {
  const html = readFileSync(path.join(projectRoot, 'index.html'), 'utf8');
  const linked = [...html.matchAll(/<link[^>]+rel="stylesheet"[^>]+href="\.\/(css\/[^"?]+)/g)].map((m) => m[1]);
  const all = walk(path.join(projectRoot, 'css'), (f) => f.endsWith('.css'))
    .map((f) => path.relative(projectRoot, f).split(path.sep).join('/'));
  const rest = all.filter((f) => !linked.includes(f)).sort();
  return [...linked.filter((f) => all.includes(f)), ...rest];
}

// Kommentare durch Leerzeichen ersetzen (Zeilenumbrueche bleiben fuer Zeilennummern erhalten).
function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));
}

// Index der schliessenden Klammer zu src[start] === '{' (beachtet Strings).
function matchBrace(src, start) {
  let depth = 0;
  let quote = null;
  for (let i = start; i < src.length; i++) {
    const c = src[i];
    if (quote) {
      if (c === '\\') i++;
      else if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'") quote = c;
    else if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) return i; }
  }
  return src.length;
}

function lineAt(src, index) {
  let n = 1;
  for (let i = 0; i < index; i++) if (src.charCodeAt(i) === 10) n++;
  return n;
}

function normalizeSelectorList(text) {
  return text.split(',').map((s) => s.trim().replace(/\s+/g, ' ').replace(/\s*([>+~])\s*/g, ' $1 ')).join(', ');
}

function splitDeclarations(body) {
  const out = [];
  let buf = '';
  let depth = 0;
  let quote = null;
  for (let i = 0; i < body.length; i++) {
    const c = body[i];
    if (quote) { buf += c; if (c === '\\') { buf += body[++i] ?? ''; } else if (c === quote) quote = null; continue; }
    if (c === '"' || c === "'") quote = c;
    else if (c === '(') depth++;
    else if (c === ')') depth--;
    else if (c === ';' && depth === 0) { if (buf.trim()) out.push(buf.trim()); buf = ''; continue; }
    buf += c;
  }
  if (buf.trim()) out.push(buf.trim());
  return out.map((d) => {
    const idx = d.indexOf(':');
    const prop = d.slice(0, idx).trim().toLowerCase();
    const value = d.slice(idx + 1).trim();
    return { prop, value, important: /!\s*important\s*$/i.test(value) };
  });
}

// Liefert flache Liste aller Stilregeln mit Kontext (z. B. "@media (max-width: 600px)").
export function parseCss(source, file) {
  // BOM durch Leerzeichen ersetzen, damit Offsets zur Originalquelle passen.
  const src = stripComments(source.replace(/^﻿/, ' '));
  const rules = [];
  const parseBlock = (from, to, context, groups = []) => {
    let i = from;
    while (i < to) {
      const open = src.indexOf('{', i);
      const semi = src.indexOf(';', i);
      if (open === -1 || open >= to) break;
      if (semi !== -1 && semi < open && src.slice(i, semi).trim().startsWith('@')) { i = semi + 1; continue; }
      const prelude = src.slice(i, open).trim();
      const close = matchBrace(src, open);
      if (prelude.startsWith('@')) {
        const name = prelude.slice(1).split(/[\s(]/)[0].toLowerCase();
        if (GROUPING_AT_RULES.has(name)) {
          parseBlock(open + 1, close, [...context, prelude.replace(/\s+/g, ' ')]);
        }
        // @keyframes, @font-face usw. enthalten keine Selektoren.
      } else if (prelude) {
        const start = i + (src.slice(i, open).length - src.slice(i, open).trimStart().length);
        rules.push({
          file,
          line: lineAt(src, start),
          context: context.join(' | '),
          selector: normalizeSelectorList(prelude),
          declarations: splitDeclarations(src, open + 1, close),
          start,
          open,
          close,
          groups,
        });
      }
      i = close + 1;
    }
  };
  parseBlock(0, src.length, []);
  return rules;
}

// Klassen- und ID-Namen eines Selektors (ohne Inhalte von Attributselektoren).
export function selectorTokens(selector) {
  const cleaned = selector.replace(/\[[^\]]*\]/g, ' ').replace(/(["']).*?\1/g, ' ');
  const tokens = new Set();
  for (const m of cleaned.matchAll(/([.#])(-?[_a-zA-Z][\w-]*)/g)) tokens.add(m[2]);
  return [...tokens];
}

function buildCorpus() {
  const files = [
    ...walk(path.join(projectRoot, 'js'), (f) => f.endsWith('.js') || f.endsWith('.mjs')),
    ...walk(path.join(projectRoot, 'tests'), (f) => /\.(m?js|html|json)$/.test(f)),
    ...readdirSync(projectRoot).filter((f) => f.endsWith('.html')).map((f) => path.join(projectRoot, f)),
    path.join(projectRoot, 'service-worker.js'),
  ];
  return files.map((f) => readFileSync(f, 'utf8')).join('\n');
}

// Ein Token gilt als benutzt, wenn es als Teilzeichenkette vorkommt oder wenn ein
// Bindestrich-Praefix/-Suffix davon als String-Fragment im Code steht (z. B. 'is-' + state).
export function isTokenUsed(token, corpus) {
  if (corpus.includes(token)) return true;
  const parts = token.split('-');
  for (let k = 1; k < parts.length; k++) {
    const prefix = `${parts.slice(0, k).join('-')}-`;
    if (prefix.length > 1 && new RegExp(`${escapeRe(prefix)}(?:['"\`]|\\$\\{)`).test(corpus)) return true;
    const suffix = `-${parts.slice(k).join('-')}`;
    if (new RegExp(`['"\`}]${escapeRe(suffix)}`).test(corpus)) return true;
  }
  return false;
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function audit() {
  const files = cssFilesInLoadOrder();
  const rules = [];
  const importantByFile = {};
  for (const file of files) {
    const source = readFileSync(path.join(projectRoot, file), 'utf8');
    importantByFile[file] = (stripComments(source).match(/!\s*important/gi) || []).length;
    rules.push(...parseCss(source, file));
  }

  // Mehrfach-Selektoren: gleicher Kontext + gleiche Selektorliste.
  const groups = new Map();
  for (const rule of rules) {
    const key = `${rule.context}\u0000${rule.selector}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(rule);
  }
  const duplicates = [...groups.values()].filter((g) => g.length > 1).map((g) => ({
    context: g[0].context,
    selector: g[0].selector,
    sameFile: new Set(g.map((r) => r.file)).size === 1,
    occurrences: g.map((r) => `${r.file}:${r.line}`),
  }));
  const dupWithinFile = {};
  for (const d of duplicates) {
    if (d.sameFile) {
      const file = d.occurrences[0].split(':')[0];
      dupWithinFile[file] = (dupWithinFile[file] || 0) + 1;
    }
  }

  // Selektoren ohne Vorkommen: alle Klassen/IDs eines einzelnen Selektors fehlen im Code.
  const corpus = buildCorpus();
  const unused = [];
  for (const rule of rules) {
    for (const single of rule.selector.split(', ')) {
      const tokens = selectorTokens(single);
      if (!tokens.length) continue;
      if (tokens.every((t) => !isTokenUsed(t, corpus))) {
        unused.push({ selector: single, at: `${rule.file}:${rule.line}`, context: rule.context });
      }
    }
  }

  return {
    files,
    ruleCount: rules.length,
    duplicates,
    duplicateCount: duplicates.length,
    duplicateWithinFile: dupWithinFile,
    duplicateAcrossFiles: duplicates.filter((d) => !d.sameFile).length,
    importantByFile,
    importantTotal: Object.values(importantByFile).reduce((a, b) => a + b, 0),
    unused,
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = audit();
  if (args.has('--json')) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(`CSS-Audit: ${result.files.length} Dateien, ${result.ruleCount} Regeln`);
    console.log(`\nMehrfach definierte Selektoren (je Kontext): ${result.duplicateCount}`);
    console.log(`  innerhalb einer Datei: ${result.duplicateCount - result.duplicateAcrossFiles}`);
    for (const [file, n] of Object.entries(result.duplicateWithinFile)) console.log(`    ${file}: ${n}`);
    console.log(`  dateiuebergreifend: ${result.duplicateAcrossFiles}`);
    if (args.has('--verbose')) {
      for (const d of result.duplicates) {
        console.log(`    ${d.context ? `[${d.context}] ` : ''}${d.selector}\n      ${d.occurrences.join('  ')}`);
      }
    }
    console.log(`\n!important je Datei (gesamt ${result.importantTotal}):`);
    for (const [file, n] of Object.entries(result.importantByFile)) if (n) console.log(`  ${file}: ${n}`);
    console.log(`\nSelektoren ohne Vorkommen in HTML/JS: ${result.unused.length}`);
    for (const u of result.unused) console.log(`  ${u.at}  ${u.context ? `[${u.context}] ` : ''}${u.selector}`);
  }
}
