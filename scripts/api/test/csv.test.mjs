import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCsv } from '../lib/csv.mjs';

test('parseCsv: einfache Zeilen', () => {
  assert.deepEqual(parseCsv('a,b\n1,2\n'), [['a', 'b'], ['1', '2']]);
});
test('parseCsv: CRLF und fehlender Zeilenumbruch am Ende', () => {
  assert.deepEqual(parseCsv('a,b\r\n1,2'), [['a', 'b'], ['1', '2']]);
});
test('parseCsv: Quotes, Kommas, Zeilenumbrueche und escaped Quotes', () => {
  assert.deepEqual(parseCsv('a,b\n"x,y","he said ""hi"""\n"l1\nl2",z\n'), [['a', 'b'], ['x,y', 'he said "hi"'], ['l1\nl2', 'z']]);
});
test('parseCsv: Leerzeilen bleiben als [""] erhalten, leere Felder ebenso', () => {
  assert.deepEqual(parseCsv('a,b\n\n1,\n,\n'), [['a', 'b'], [''], ['1', ''], ['', '']]);
});
test('parseCsv: leerer Text', () => {
  assert.deepEqual(parseCsv(''), []);
});
