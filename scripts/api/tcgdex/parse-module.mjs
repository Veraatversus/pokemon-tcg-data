// Sicherer Parser fuer TCGdex-Datenmodule (TypeScript).
// Die Dateien stammen von Dritten und werden NIE ausgefuehrt: Typen werden
// entfernt, danach werden nur literale AST-Knoten ausgewertet.
import { stripTypeScriptTypes } from 'node:module';
import * as acorn from 'acorn';

export class TcgdexParseError extends Error {
  constructor(filePath, message) {
    super(`${filePath}: ${message}`);
    this.name = 'TcgdexParseError';
    this.filePath = filePath;
  }
}

export function parseTcgdexModule(source, filePath) {
  const fail = (msg) => { throw new TcgdexParseError(filePath, msg); };

  let ast;
  try {
    const js = stripTypeScriptTypes(source, { mode: 'strip' });
    ast = acorn.parse(js, { ecmaVersion: 'latest', sourceType: 'module' });
  } catch (e) {
    if (e instanceof TcgdexParseError) throw e;
    fail(`Syntaxfehler: ${e.message}`);
  }

  const imports = {};
  const locals = new Map(); // Name -> init-Knoten (lokale const)
  const resolving = new Set();

  const evalNode = (node) => {
    switch (node.type) {
      case 'Literal':
        if (node.regex || node.bigint !== undefined) fail(`nicht erlaubter Literaltyp (${node.type})`);
        return node.value;
      case 'TemplateLiteral':
        if (node.expressions.length > 0) fail('TemplateLiteral mit Ausdruck nicht erlaubt');
        return node.quasis[0].value.cooked;
      case 'UnaryExpression':
        if ((node.operator === '-' || node.operator === '+') && node.argument.type === 'Literal' && typeof node.argument.value === 'number') {
          return node.operator === '-' ? -node.argument.value : node.argument.value;
        }
        return fail(`nicht erlaubter Knoten UnaryExpression (${node.operator})`);
      case 'ArrayExpression':
        return node.elements.map((el) => {
          if (el === null) fail('Array-Luecke nicht erlaubt');
          return evalNode(el); // SpreadElement landet im default-Fall
        });
      case 'ObjectExpression': {
        const obj = {};
        for (const p of node.properties) {
          if (p.type !== 'Property' || p.kind !== 'init' || p.method || p.computed) fail(`nicht erlaubter Knoten ${p.type}`);
          let key;
          if (p.key.type === 'Identifier') key = p.key.name;
          else if (p.key.type === 'Literal') key = String(p.key.value);
          else fail(`nicht erlaubter Schluessel ${p.key.type}`);
          if (key === '__proto__') fail('Schluessel __proto__ nicht erlaubt');
          obj[key] = evalNode(p.value); // shorthand: value ist Identifier
        }
        return obj;
      }
      case 'Identifier': {
        if (Object.hasOwn(imports, node.name)) return { $import: imports[node.name] };
        if (locals.has(node.name)) {
          if (resolving.has(node.name)) fail(`zyklische Referenz ${node.name}`);
          resolving.add(node.name);
          try { return evalNode(locals.get(node.name)); } finally { resolving.delete(node.name); }
        }
        return fail(`unbekannter Bezeichner ${node.name}`);
      }
      default:
        return fail(`nicht erlaubter Knoten ${node.type}`);
    }
  };

  // Erster Durchlauf: Imports und lokale Konstanten sammeln.
  const collectDecl = (decl) => {
    if (decl.type !== 'VariableDeclaration') return;
    for (const d of decl.declarations) {
      if (d.id.type !== 'Identifier') fail(`nicht erlaubte Deklaration ${d.id.type}`);
      if (d.init) locals.set(d.id.name, d.init);
    }
  };
  for (const stmt of ast.body) {
    if (stmt.type === 'ImportDeclaration') {
      for (const s of stmt.specifiers) {
        if (s.type === 'ImportDefaultSpecifier' || s.type === 'ImportSpecifier') imports[s.local.name] = stmt.source.value;
      }
    } else if (stmt.type === 'ExportNamedDeclaration' && stmt.declaration) collectDecl(stmt.declaration);
    else collectDecl(stmt);
  }

  // Zweiter Durchlauf: Exporte auswerten.
  const exports = {};
  for (const stmt of ast.body) {
    if (stmt.type === 'ExportDefaultDeclaration') {
      exports.default = evalNode(stmt.declaration);
    } else if (stmt.type === 'ExportNamedDeclaration' && stmt.declaration) {
      if (stmt.declaration.type !== 'VariableDeclaration') fail(`nicht erlaubter Export ${stmt.declaration.type}`);
      for (const d of stmt.declaration.declarations) {
        if (!d.init) fail(`Export ohne Wert ${d.id.name}`);
        exports[d.id.name] = evalNode(d.init);
      }
    }
  }
  return { imports, exports };
}
