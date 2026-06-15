// Startet http-server (statische Dateien + Cardmarket-JSON) und den
// Cardmarket-Dev-Proxy parallel. Beide laufen in einem Concurrently-Prozess
// (kein extra-Dependency, simples node:child_process).
//
// Aufruf: `npm run start:dev:proxy`

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
// scripts/ → tcg-tracker-web/ → frontend/ → dev/ (3 levels up)
const repoRoot = resolve(__dirname, '..', '..', '..');

const procs = [
  {
    name: 'http-server',
    cmd: 'npx',
    args: ['http-server', '.', '-p', '8080', '-c-1', '--cors'],
    cwd: repoRoot
  },
  {
    name: 'cardmarket-proxy',
    cmd: 'node',
    args: ['scripts/dev-cardmarket-proxy.mjs'],
    cwd: __dirname + '/..'
  }
];

const children = [];
for (const proc of procs) {
  const child = spawn(proc.cmd, proc.args, {
    cwd: proc.cwd,
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: process.platform === 'win32'
  });
  const prefix = `[${proc.name}]`;
  child.stdout.on('data', (data) => {
    process.stdout.write(data.toString().split('\n').filter(Boolean).map((l) => `${prefix} ${l}\n`).join(''));
  });
  child.stderr.on('data', (data) => {
    process.stderr.write(data.toString().split('\n').filter(Boolean).map((l) => `${prefix} ${l}\n`).join(''));
  });
  child.on('exit', (code) => {
    console.log(`${prefix} exited with code ${code}`);
    if (code !== 0 && code !== null) {
      for (const c of children) if (c !== child) c.kill('SIGTERM');
      process.exit(code);
    }
  });
  children.push(child);
}

const shutdown = () => {
  for (const c of children) c.kill('SIGTERM');
  setTimeout(() => process.exit(0), 500);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
