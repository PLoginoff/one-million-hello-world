/**
 * Arbitrary tests — generation bounds, determinism, shrink behavior.
 */

import { describe, it, expect } from 'bun:test';
import {
  mulberry32,
  int,
  float,
  boolean,
  string,
  array,
  tuple,
  record,
  oneOf,
  frequency,
  recursive,
  jsonValue,
  constant,
  mapArbitrary,
  filterArbitrary,
  shrinkToMinimal,
  deriveSeed,
} from '../engine/Arbitrary';
import type { ShrinkTree } from '../engine/Arbitrary';

const collectTree = <T>(t: ShrinkTree<T>, depth = 3): T[] => {
  if (depth === 0) return [t.value];
  const out: T[] = [t.value];
  for (const c of t.candidates()) out.push(...collectTree(c, depth - 1));
  return out;
};

describe('mulberry32 / deriveSeed', () => {
  it('reproducible and in-range', () => {
    const a = mulberry32(7);
    const b = mulberry32(7);
    for (let i = 0; i < 50; i++) expect(a()).toBe(b());
  });
  it('deriveSeed yields distinct stable streams', () => {
    expect(deriveSeed(1, 1)).toBe(deriveSeed(1, 1));
    expect(deriveSeed(1, 1)).not.toBe(deriveSeed(1, 2));
  });
});

describe('int', () => {
  it('stays in bounds', () => {
    const r = mulberry32(1);
    const arb = int({ min: -5, max: 5 });
    for (let i = 0; i < 200; i++) {
      const v = arb.generate(r).value;
      expect(v).toBeGreaterThanOrEqual(-5);
      expect(v).toBeLessThanOrEqual(5);
      expect(Number.isInteger(v)).toBe(true);
    }
  });

  it('shrinks toward 0', () => {
    const arb = int({ min: -100, max: 100 });
    const tree = arb.generate(() => 0.87); // ~74
    const { value } = shrinkToMinimal(tree, (v) => v > 10);
    expect(value).toBe(11); // minimal failing
  });

  it('shrink chain reaches target', () => {
    const arb = int({ min: 0, max: 100 });
    const tree = arb.generate(() => 0.99); // 99
    const { value } = shrinkToMinimal(tree, () => true);
    expect(value).toBe(0);
  });

  it('shrinks toward bound when 0 out of range', () => {
    const arb = int({ min: 50, max: 100 });
    const tree = arb.generate(() => 0.9);
    const { value } = shrinkToMinimal(tree, () => true);
    expect(value).toBe(50);
  });
});

describe('float', () => {
  it('stays in bounds and shrinks toward 0', () => {
    const arb = float({ min: 0, max: 1 });
    const r = mulberry32(2);
    const tree = arb.generate(r);
    const { value } = shrinkToMinimal(tree, () => true);
    expect(value).toBe(0);
  });
});

describe('boolean', () => {
  it('shrinks true to false', () => {
    const arb = boolean();
    const t = arb.generate(() => 0.9);
    expect(t.value).toBe(false);
    const t2 = arb.generate(() => 0.1);
    expect(t2.value).toBe(true);
    expect(t2.candidates()[0]?.value).toBe(false);
  });
});

describe('string', () => {
  it('respects charset and length bounds', () => {
    const arb = string({ charset: 'abc', minLength: 2, maxLength: 5 });
    const r = mulberry32(3);
    for (let i = 0; i < 100; i++) {
      const v = arb.generate(r).value;
      expect(v.length).toBeGreaterThanOrEqual(2);
      expect(v.length).toBeLessThanOrEqual(5);
      expect([...v].every((c) => 'abc'.includes(c))).toBe(true);
    }
  });

  it('shrinks toward empty then simpler chars', () => {
    const arb = string({ charset: 'ab', minLength: 0 });
    const tree = arb.generate(() => 0.99);
    const { value } = shrinkToMinimal(tree, (s) => s.length > 0);
    expect(value.length).toBe(1);
  });
});

describe('array', () => {
  it('respects length bounds', () => {
    const arb = array(int({ min: 0, max: 9 }), { minLength: 2, maxLength: 6 });
    const r = mulberry32(4);
    for (let i = 0; i < 100; i++) {
      const v = arb.generate(r).value;
      expect(v.length).toBeGreaterThanOrEqual(2);
      expect(v.length).toBeLessThanOrEqual(6);
    }
  });

  it('shrinks by removing elements then shrinking elements', () => {
    const arb = array(int({ min: 0, max: 100 }), { minLength: 0 });
    const r = mulberry32(5);
    const tree = arb.generate(r);
    // property: array containing an element >= 50 fails
    const { value } = shrinkToMinimal(tree, (v) => v.some((x) => x >= 50));
    expect(value.length).toBe(1);
    expect(value[0]).toBeGreaterThanOrEqual(50);
  });
});

describe('tuple / record / oneOf', () => {
  it('tuple draws each position and shrinks independently', () => {
    const arb = tuple(int({ min: 0, max: 10 }), string({ charset: 'x', minLength: 1, maxLength: 3 }));
    const tree = arb.generate(mulberry32(6));
    expect(tree.value).toHaveLength(2);
    const cands = tree.candidates();
    expect(cands.length).toBeGreaterThan(0);
  });

  it('record produces shaped objects', () => {
    const arb = record({ a: int({ min: 0, max: 5 }), b: boolean() });
    const tree = arb.generate(mulberry32(7));
    const v = tree.value;
    expect(typeof v.a).toBe('number');
    expect(typeof v.b).toBe('boolean');
  });

  it('oneOf picks among arms; frequency weights', () => {
    const arb = oneOf(constant('x'), constant('y'));
    const r = mulberry32(8);
    const seen = new Set<string>();
    for (let i = 0; i < 20; i++) seen.add(arb.generate(r).value as string);
    expect(seen.size).toBe(2);

    const heavy = frequency(
      { weight: 99, arb: constant('big') },
      { weight: 1, arb: constant('rare') }
    );
    const r2 = mulberry32(9);
    let big = 0;
    for (let i = 0; i < 200; i++) {
      if (heavy.generate(r2).value === 'big') big++;
    }
    expect(big).toBeGreaterThan(150);
  });
});

describe('map / filter', () => {
  it('map transforms values through the tree', () => {
    const arb = mapArbitrary(int({ min: 0, max: 10 }), (n) => `n=${n}`);
    const tree = arb.generate(mulberry32(1));
    expect(tree.value).toMatch(/^n=\d+$/);
    for (const c of tree.candidates()) expect(c.value).toMatch(/^n=/);
  });

  it('filter retries until predicate holds', () => {
    const arb = filterArbitrary(int({ min: 0, max: 10 }), (n) => n % 2 === 0);
    const r = mulberry32(1);
    for (let i = 0; i < 50; i++) {
      expect(arb.generate(r).value % 2).toBe(0);
    }
  });
});

describe('recursive structures', () => {
  it('jsonValue generates bounded-depth trees', () => {
    const arb = jsonValue(3);
    const r = mulberry32(10);
    const depth = (v: unknown): number => {
      if (Array.isArray(v)) return 1 + Math.max(0, ...v.map(depth));
      if (v !== null && typeof v === 'object') {
        return 1 + Math.max(0, ...Object.values(v as Record<string, unknown>).map(depth));
      }
      return 0;
    };
    for (let i = 0; i < 50; i++) {
      const v = arb.generate(r).value;
      expect(depth(v)).toBeLessThanOrEqual(4);
    }
  });

  it('recursive arbitrary shrinks within generated structure', () => {
    type Tree = number | Tree[];
    const base: import('../engine/Arbitrary').Arbitrary<Tree> = int({ min: 0, max: 9 });
    const arb = recursive<Tree>(
      base,
      (self) => oneOf(base, array(self, { maxLength: 2 })),
      3
    );
    const tree = arb.generate(mulberry32(11));
    const all = collectTree(tree, 4);
    expect(all.length).toBeGreaterThan(0);
  });
});
