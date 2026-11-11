import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { freezePokemontcg } from '../sources/freeze-pokemontcg.mjs';

test('freeze liefert Blob-Bytes des Commits, unabhängig von autocrlf und Working Tree', () => {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'freeze-'));
  const git = (...a) => execFileSync('git', a, { cwd: repo, encoding: 'utf8' }).trim();
  git('init', '-q');
  git('config', 'user.email', 't@example.com');
  git('config', 'user.name', 't');
  git('config', 'core.autocrlf', 'false');
  fs.mkdirSync(path.join(repo, 'cards', 'en'), { recursive: true });
  fs.writeFileSync(path.join(repo, 'cards', 'en', 'a.json'), '[\n  1\n]\n');
  fs.writeFileSync(path.join(repo, 'sets_en.txt'), 'x');
  fs.mkdirSync(path.join(repo, 'sets'));
  fs.writeFileSync(path.join(repo, 'sets', 'en.json'), '[]\n');
  git('add', '.');
  git('commit', '-q', '-m', 'x');
  const sha = git('rev-parse', 'HEAD');
  // Working Tree weicht ab (CRLF, autocrlf an)
  git('config', 'core.autocrlf', 'true');
  fs.writeFileSync(path.join(repo, 'cards', 'en', 'a.json'), '[\r\n  1\r\n]\r\n');
  const target = path.join(repo, 'out');
  freezePokemontcg({ repoRoot: repo, commit: sha, targetDir: target, paths: ['cards/en', 'sets/en.json'] });
  assert.equal(fs.readFileSync(path.join(target, 'cards', 'en', 'a.json'), 'utf8'), '[\n  1\n]\n');
  assert.equal(fs.readFileSync(path.join(target, 'sets', 'en.json'), 'utf8'), '[]\n');
  assert.ok(!fs.existsSync(path.join(target, 'sets_en.txt')));
});
