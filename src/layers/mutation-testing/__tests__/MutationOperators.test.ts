/**
 * MutationOperators tests — each operator's transformation semantics.
 */

import { describe, it, expect } from 'bun:test';
import { parse, emitNode } from '../engine/CodeModel';
import {
  generateMutants,
  defaultOperators,
  MutationEngine,
} from '../engine/index';
import type { MutantSpec } from '../engine/index';

function mutantsOf(src: string, operator?: string): readonly MutantSpec[] {
  const all = generateMutants(parse(src));
  return operator ? all.filter((m) => m.operator === operator) : all;
}

function applied(src: string, spec: MutantSpec): string {
  return MutationEngine.applyMutant(src, spec);
}

describe('arithmetic operator replacement', () => {
  it('mutates + to - and *', () => {
    const ms = mutantsOf('const r = a + b;', 'ArithmeticOperator');
    const results = ms.map((m) => applied('const r = a + b;', m));
    expect(results).toContain('const r = a - b;');
    expect(results).toContain('const r = a * b;');
  });

  it('mutates * / % **', () => {
    expect(mutantsOf('x = a * b;', 'ArithmeticOperator').length).toBe(2);
    expect(mutantsOf('x = a % b;', 'ArithmeticOperator').length).toBe(2);
    expect(mutantsOf('x = a ** b;', 'ArithmeticOperator').length).toBe(1);
  });
});

describe('relational operator replacement', () => {
  it('mutates < to distinct alternatives (<= is deduped with boundary op)', () => {
    const ms = mutantsOf('if (a < b) x();', 'RelationalOperator');
    const texts = ms.map((m) => m.mutatedText);
    // '<=' variant is claimed by ConditionalBoundary earlier in the
    // pipeline and deduplicated here — the remaining two survive.
    expect(texts).toContain('>=');
    expect(texts).toContain('>');
  });

  it('mutates === to !== and ==', () => {
    const ms = mutantsOf('const ok = a === b;', 'RelationalOperator');
    const texts = ms.map((m) => m.mutatedText);
    expect(texts).toContain('!==');
    expect(texts).toContain('==');
  });
});

describe('conditional boundary mutation', () => {
  it('toggles < to <= only', () => {
    const ms = mutantsOf('if (i < n) {}', 'ConditionalBoundary');
    expect(ms).toHaveLength(1);
    expect(applied('if (i < n) {}', ms[0])).toBe('if (i <= n) {}');
  });

  it('toggles >= to >', () => {
    const ms = mutantsOf('while (x >= 0) x--;', 'ConditionalBoundary');
    expect(applied('while (x >= 0) x--;', ms[0])).toContain('x > 0');
  });
});

describe('logical operator mutation', () => {
  it('swaps && and ||', () => {
    const ms = mutantsOf('if (a && b || c) {}', 'LogicalOperator');
    const texts = ms.map((m) => m.mutatedText).sort();
    expect(texts).toEqual(['&&', '||']);
  });

  it('mutates ?? to ||', () => {
    const ms = mutantsOf('const v = a ?? b;', 'LogicalOperator');
    expect(ms[0]?.mutatedText).toBe('||');
  });
});

describe('negation insertion', () => {
  it('negates if condition', () => {
    const ms = mutantsOf('if (ready) go();', 'NegationInsertion');
    expect(ms).toHaveLength(1);
    expect(applied('if (ready) go();', ms[0])).toBe('if (!(ready)) go();');
  });

  it('negates while and ternary conditions', () => {
    const w = mutantsOf('while (ok) tick();', 'NegationInsertion');
    expect(applied('while (ok) tick();', w[0])).toContain('!(ok)');
    const t = mutantsOf('const v = flag ? 1 : 2;', 'NegationInsertion');
    expect(applied('const v = flag ? 1 : 2;', t[0])).toBe('const v = !(flag) ? 1 : 2;');
  });
});

describe('literal mutations', () => {
  it('flips booleans', () => {
    const ms = mutantsOf('const a = true; const b = false;', 'BooleanLiteral');
    expect(ms.map((m) => m.mutatedText)).toEqual(['false', 'true']);
  });

  it('mutates numbers: 0→1, 1→0, n→n+1', () => {
    const ms = mutantsOf('const a = 0, b = 1, c = 41;', 'NumericLiteral');
    expect(ms.map((m) => m.mutatedText)).toEqual(['1', '0', '42']);
  });

  it('mutates strings', () => {
    const ms = mutantsOf("const a = 'x', b = '';", 'StringLiteral');
    expect(ms.map((m) => m.mutatedText)).toEqual(["''", "'MUTANT'"]);
  });

  it('swaps null/undefined', () => {
    const ms = mutantsOf('const a = null, b = undefined;', 'NullLiteral');
    expect(ms.map((m) => m.mutatedText)).toEqual(['undefined', 'null']);
  });
});

describe('increment/decrement', () => {
  it('swaps postfix i++ to i--', () => {
    const ms = mutantsOf('i++;', 'IncrementDecrement');
    expect(applied('i++;', ms[0])).toBe('i--;');
  });
  it('swaps prefix --i to ++i', () => {
    const ms = mutantsOf('--i;', 'IncrementDecrement');
    expect(applied('--i;', ms[0])).toBe('++i;');
  });
});

describe('loop bound mutation', () => {
  it('produces off-by-one mutants on for loops', () => {
    const src = 'for (let i = 0; i < n; i++) sum();';
    const ms = mutantsOf(src, 'LoopBound');
    const texts = ms.map((m) => applied(src, m));
    expect(texts.some((t) => t.includes('i <= n'))).toBe(true);
    expect(texts.some((t) => t.includes('n - 1'))).toBe(true);
    expect(texts.some((t) => t.includes('let i = 1'))).toBe(true);
  });
});

describe('return value mutation', () => {
  it('replaces return value with undefined', () => {
    const ms = mutantsOf('function f() { return a + b; }', 'ReturnValue');
    const out = applied('function f() { return a + b; }', ms[0]);
    expect(out).toBe('function f() { return undefined; }');
  });
});

describe('array index mutation', () => {
  it('produces +1/-1 index shifts', () => {
    const src = 'const v = a[i];';
    const ms = mutantsOf(src, 'ArrayIndex');
    const texts = ms.map((m) => applied(src, m));
    expect(texts).toContain('const v = a[(i + 1)];');
    expect(texts).toContain('const v = a[(i - 1)];');
  });
});

describe('assignment operator mutation', () => {
  it('swaps += to -=', () => {
    const ms = mutantsOf('x += y;', 'AssignmentOperator');
    expect(applied('x += y;', ms[0])).toBe('x -= y;');
  });
});

describe('equality-to-assignment mutation', () => {
  it('turns a === b into (a = b)', () => {
    const ms = mutantsOf('if (a === b) {}', 'EqualityToAssignment');
    expect(ms).toHaveLength(1);
    expect(ms[0]?.mutatedText).toBe('(a = b)');
  });
});

describe('statement removal', () => {
  it('removes expression statements', () => {
    const ms = mutantsOf('foo();', 'StatementRemoval');
    expect(applied('foo();', ms[0])).toBe(';');
  });
});

describe('generateMutants — integration', () => {
  it('produces deterministic, deduplicated, position-tracked mutants', () => {
    const src = 'function f(a: number) { if (a > 0) { return a + 1; } return 0; }';
    const m1 = generateMutants(parse(src));
    const m2 = generateMutants(parse(src));
    expect(m1.map((x) => x.id)).toEqual(m2.map((x) => x.id));
    // dedup
    const keys = m1.map((x) => `${x.start}:${x.end}:${x.mutatedText}`);
    expect(new Set(keys).size).toBe(keys.length);
    // position tracking
    for (const m of m1) {
      expect(m.line).toBeGreaterThan(0);
      expect(src.slice(m.start, m.end)).toBe(m.originalText);
    }
  });

  it('does not mutate inside template literals or type declarations', () => {
    const m = mutantsOf('const s = `a${b + c}`; interface X { n: number }');
    expect(m.filter((x) => x.originalText.includes('${'))).toHaveLength(0);
    expect(m.every((x) => x.originalText !== 'X')).toBe(true);
  });

  it('supports custom operator subsets', () => {
    const ops = defaultOperators().filter((o) => o.name === 'BooleanLiteral');
    const m = generateMutants(parse('if (a > 0 && flag) x = true;'), ops);
    expect(m).toHaveLength(1);
    expect(m[0]?.mutatedText).toBe('false');
  });
});
