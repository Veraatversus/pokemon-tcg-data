import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderCardmarketReportMd } from '../report/cardmarket-report.mjs';

test('Markdown-Report: Sets nach fehlenden Karten absteigend, Such-URL verlinkt, Gesamtzeile', () => {
  const md = renderCardmarketReportMd({
    totals: { cards: 30, missing: 4 },
    bySet: {
      a: { expansionId: 1, cards: 10, missing: 1, coverage: { cards: 10, withId: 9, bySource: { tcgdex: 9 } }, searchUrl: 'https://x/1' },
      b: { expansionId: null, cards: 10, missing: 3, coverage: { cards: 10, withId: 7, bySource: { tcgdex: 7 } }, searchUrl: null },
      c: { expansionId: 3, cards: 10, missing: 0, coverage: { cards: 10, withId: 10, bySource: {} }, searchUrl: 'https://x/3' },
    },
  });
  const lines = md.split('\n');
  assert.match(lines[0], /^# /);
  const rows = lines.filter((l) => /^\| (a|b|c) /.test(l));
  assert.deepEqual(rows.map((l) => l.split('|')[1].trim()), ['b', 'a', 'c']);
  assert.match(rows[1], /\[Suche\]\(https:\/\/x\/1\)/);
  assert.match(rows[0], /90|70 %/);
  assert.match(md, /30 Karten/);
});
