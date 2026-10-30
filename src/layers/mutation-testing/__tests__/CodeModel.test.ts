/**
 * CodeModel (tokenizer + parser) tests.
 */

import { describe, it, expect } from 'bun:test';
import { tokenize, parse, findNodes, emitNode, walk } from '../engine/CodeModel';
import type { TSNode } from '../engine/CodeModel';

describe('tokenize', () => {
  it('tokenizes numbers, strings, identifiers, keywords, punct', () => {
    const toks = tokenize('const x = 42 + "hi";');
    expect(toks.map((t) => t.kind)).toEqual([
      'keyword', 'identifier', 'punct', 'number', 'punct', 'string', 'punct', 'eof',
    ]);
    expect(toks[3]?.value).toBe('42');
    expect(toks[3]?.line).toBe(1);
  });

  it('tracks line/column across newlines', () => {
    const toks = tokenize('a\nb\n\nc');
    expect(toks[1]?.line).toBe(2);
    expect(toks[3]?.line).toBe(4);
  });

  it('handles comments, floats, hex, bigint, exponent', () => {
    const toks = tokenize('/* c */ 0xFF 1_000n 1.5e-3 // end');
    expect(toks[0]?.value).toBe('0xFF');
    expect(toks[1]?.value).toBe('1_000n');
    expect(toks[2]?.value).toBe('1.5e-3');
  });

  it('keeps template literals opaque', () => {
    const toks = tokenize('`a${b + c}d`');
    expect(toks[0]?.kind).toBe('template');
    expect(toks[0]?.value).toBe('`a${b + c}d`');
  });

  it('distinguishes regex from division', () => {
    const t1 = tokenize('const r = /ab+c/g;');
    expect(t1[3]?.kind).toBe('regex');
    const t2 = tokenize('x / y');
    expect(t2[1]?.kind).toBe('punct');
    expect(t2[1]?.value).toBe('/');
  });
});

describe('parse — statements', () => {
  it('parses function declarations with typed params and body', () => {
    const p = parse('function f(a: number, b: string): boolean { return a > 0; }');
    const fn = p.body[0];
    expect(fn?.kind).toBe('FunctionDecl');
    expect(fn?.children).toHaveLength(1);
    expect(fn?.children[0]?.kind).toBe('Block');
  });

  it('parses var decls, if/else, while, do-while', () => {
    const p = parse('let x = 1; if (x > 0) { x = 2; } else x = 3; while (x) x--; do x++; while (x);');
    const kinds = p.body.map((n) => n.kind);
    expect(kinds).toEqual(['VarDecl', 'IfStatement', 'WhileStatement', 'DoWhileStatement']);
  });

  it('parses classic for and for-of', () => {
    const p = parse('for (let i = 0; i < 10; i++) {} for (const x of xs) {}');
    expect(p.body[0]?.data?.operator).toBe('classic');
    expect(p.body[1]?.data?.operator).toBe('for-of');
  });

  it('parses classes with methods', () => {
    const p = parse('class A extends B { private x = 1; get v() { return this.x; } }');
    expect(p.body[0]?.kind).toBe('ClassDecl');
    const block = p.body[0]?.children[1];
    expect(block?.kind).toBe('Block');
  });

  it('parses try/catch/finally, switch, throw, break', () => {
    const p = parse('try { throw 1; } catch (e) { break; } finally {} switch (x) { case 1: break; default: }');
    expect(p.body[0]?.kind).toBe('TryStatement');
    expect(p.body[1]?.kind).toBe('SwitchStatement');
  });

  it('skips type-only constructs', () => {
    const p = parse('interface X { a: number }\ntype Y = { b: string };\nconst z = 1;');
    expect(p.body[2]?.kind).toBe('VarDecl');
  });

  it('parses arrow functions both forms', () => {
    const p = parse('const f = x => x * 2; const g = (a, b) => { return a + b; };');
    const arrows = findNodes(p, new Set(['ArrowFunction']));
    expect(arrows).toHaveLength(2);
  });
});

describe('parse — expressions', () => {
  const exprOf = (src: string): TSNode | undefined =>
    parse(`const _ = ${src};`).body[0]?.children.find((c) => c.kind !== 'Identifier');

  it('respects precedence: a + b * c', () => {
    const e = exprOf('1 + 2 * 3');
    expect(e?.kind).toBe('BinaryExpr');
    expect(e?.data?.operator).toBe('+');
    expect(e?.children[1]?.data?.operator).toBe('*');
  });

  it('parses ternary, assignment, logical', () => {
    expect(exprOf('a ? b : c')?.kind).toBe('ConditionalExpr');
    expect(exprOf('x += 1')?.data?.operator).toBe('+=');
    expect(exprOf('a && b || c')?.kind).toBe('LogicalExpr');
  });

  it('parses unary, update prefix/postfix', () => {
    expect(exprOf('!x')?.kind).toBe('UnaryExpr');
    expect(exprOf('++i')?.data?.prefix).toBe(true);
    expect(exprOf('i--')?.data?.prefix).toBe(false);
  });

  it('parses call/member/index chains', () => {
    const e = exprOf('a.b[0](1, 2)');
    expect(e?.kind).toBe('CallExpr');
  });

  it('parses literals', () => {
    const lits = findNodes(parse('const a = 1, b = "s", c = true, d = null;'), new Set(['Literal']));
    expect(lits.map((l) => l.data?.literalType)).toEqual(['number', 'string', 'boolean', 'null']);
  });
});

describe('walk & emitNode', () => {
  it('walks pre-order and can prune', () => {
    const p = parse('function f() { return a + b; }');
    const order: string[] = [];
    for (const top of p.body) {
      walk(top, (n) => {
        order.push(n.kind);
        return n.kind !== 'BinaryExpr';
      });
    }
    expect(order).toContain('FunctionDecl');
    expect(order).toContain('BinaryExpr');
    // pruned: BinaryExpr children not visited
    expect(order.filter((k) => k === 'Identifier').length).toBe(0);
  });

  it('emitNode reproduces source slices', () => {
    const src = 'const r = a * b + c;';
    const p = parse(src);
    const bin = findNodes(p, new Set(['BinaryExpr']))[0];
    expect(emitNode(p, bin)).toBe('a * b + c');
  });
});
