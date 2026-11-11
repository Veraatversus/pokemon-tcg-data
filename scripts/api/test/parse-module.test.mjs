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
for (const [bad, reason] of [["{ ...other }", "SpreadElement"], ["{ a: foo() }", "CallExpression"], ["{ a: `x${y}` }", "TemplateLiteral mit Ausdruck"], ["{ a: b + 1 }", "BinaryExpression"]]) {
  test(`lehnt ab: ${bad}`, () => assert.throws(() => parseTcgdexModule(`const c = ${bad}
export default c`, "bad.ts"), (e) => e instanceof TcgdexParseError && e.message.includes("bad.ts") && e.message.includes(reason)));
}

// Sicherheitsrelevante Ablehnungen: Fehlertyp, Dateipfad und Grund/Knotentyp pruefen.
const rejections = [
  ['__proto__ als Identifier', 'const c = { __proto__: 1 }\nexport default c', '__proto__'],
  ['__proto__ als String-Literal', 'const c = { "__proto__": 1 }\nexport default c', '__proto__'],
  ['__proto__ als Shorthand', 'const __proto__ = 1\nconst c = { __proto__ }\nexport default c', '__proto__'],
  ['Getter', 'const c = { get a() { return 1 } }\nexport default c', 'Property (get-Accessor)'],
  ['Setter', 'const c = { set a(v) {} }\nexport default c', 'Property (set-Accessor)'],
  ['Methode', 'const c = { a() {} }\nexport default c', 'Property (Methode)'],
  ['berechneter Schluessel', 'const a = "k"\nconst c = { [a]: 1 }\nexport default c', 'Property (berechneter Schluessel)'],
  ['Tagged Template', 'const c = { a: tag`x` }\nexport default c', 'TaggedTemplateExpression'],
  ['Regex-Literal', 'const c = { a: /x/ }\nexport default c', 'Literaltyp'],
  ['BigInt-Literal', 'const c = { a: 1n }\nexport default c', 'Literaltyp'],
  ['globaler Bezeichner process', 'const c = { a: process }\nexport default c', 'unbekannter Bezeichner process'],
  ['Bezeichner undefined', 'const c = { a: undefined }\nexport default c', 'unbekannter Bezeichner undefined'],
  ['zyklische Referenz', 'const a = b\nconst b = a\nexport default a', 'zyklische Referenz'],
  ['Syntaxfehler', 'const c = {\nexport default c', 'Syntaxfehler'],
  ['Unary !x', 'const x = 1\nconst c = { a: !x }\nexport default c', 'UnaryExpression'],
  ['Unary -x auf Bezeichner', 'const x = 1\nconst c = { a: -x }\nexport default c', 'UnaryExpression'],
];
for (const [name, src, reason] of rejections) {
  test(`lehnt ab: ${name}`, () => assert.throws(() => parseTcgdexModule(src, 'sec.ts'), (e) =>
    e instanceof TcgdexParseError && e.filePath === 'sec.ts' && e.message.includes('sec.ts') && e.message.includes(reason)));
}
