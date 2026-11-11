import test from 'node:test';
import assert from 'node:assert/strict';
import { parseTcgdexModule, TcgdexParseError } from '../tcgdex/parse-module.mjs';

test('Karte mit Apostroph, Arrays, negativer Zahl, Template ohne Ausdruck', () => {
  const src = `import { Card } from "../../../interfaces"\nimport Set from "../151"\nconst card: Card = { set: Set, name: { en: "McDonald's", de: \`Glurak\` }, hp: 330, x: -1, types: ["Fire"], variants: [{ type: 'holo', thirdParty: { cardmarket: 733601 } }] }\nexport default card`;
  const { imports, exports } = parseTcgdexModule(src, 'x.ts');
  assert.equal(imports.Set, '../151');
  assert.deepEqual(exports.default.set, { $import: '../151' });
  assert.equal(exports.default.name.en, "McDonald's");
  assert.equal(exports.default.name.de, 'Glurak');
  assert.equal(exports.default.x, -1);
  assert.equal(exports.default.variants[0].thirdParty.cardmarket, 733601);
});
test('benannter Export (legals.ts-Form)', () => {
  const { exports } = parseTcgdexModule(`import { Filter } from '../interfaces'\nexport const standard: Filter = { includes: { regulationMark: ['H','I'] } }`, 'legals.ts');
  assert.deepEqual(exports.standard.includes.regulationMark, ['H', 'I']);
});
for (const bad of ['{ ...other }', '{ a: foo() }', '{ a: `x${y}` }', '{ a: b + 1 }']) {
  test(`lehnt ab: ${bad}`, () => assert.throws(() => parseTcgdexModule(`const c = ${bad}\nexport default c`, 'bad.ts'), (e) => e instanceof TcgdexParseError && e.message.includes('bad.ts')));
}
