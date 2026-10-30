/**
 * Gen fluent API tests.
 */

import { describe, it, expect } from 'bun:test';
import {
  Gen,
  genRecord,
  genTuple,
  property,
  PropertyRunner,
  mulberry32,
} from '../engine/index';

describe('Gen factories + basic combinators', () => {
  it('int/float/boolean/string draw within spec', () => {
    expect(Gen.int({ min: 1, max: 5 }).sample(50, 1).every((v) => v >= 1 && v <= 5)).toBe(true);
    expect(Gen.float({ min: 0, max: 1 }).sample(50, 1).every((v) => v >= 0 && v <= 1)).toBe(true);
    expect(Gen.boolean().sample(20, 1).every((v) => typeof v === 'boolean')).toBe(true);
    expect(Gen.string({ charset: 'ab', maxLength: 5 }).sample(20, 1)
      .every((v) => [...v].every((c) => 'ab'.includes(c)))).toBe(true);
  });

  it('map transforms output', () => {
    const g = Gen.int({ min: 0, max: 9 }).map((n) => `n=${n}`);
    for (const v of g.sample(30, 2)) expect(v).toMatch(/^n=\d$/);
  });

  it('filter applies predicates', () => {
    const g = Gen.int({ min: 0, max: 20 }).filter((n) => n % 3 === 0);
    for (const v of g.sample(50, 3)) expect(v % 3).toBe(0);
  });

  it('zip produces pairs with independent shrinking', () => {
    const g = Gen.int({ min: 0, max: 10 }).zip(Gen.string({ charset: 'x', maxLength: 4 }));
    for (const [n, s] of g.sample(30, 4)) {
      expect(n).toBeGreaterThanOrEqual(0);
      expect([...s].every((c) => c === 'x')).toBe(true);
    }
  });

  it('array/list sizing', () => {
    const g = Gen.int({ min: 0, max: 9 }).list(4);
    for (const v of g.sample(20, 5)) expect(v).toHaveLength(4);
    const g2 = Gen.int({ min: 0, max: 9 }).array({ minLength: 2, maxLength: 6 });
    for (const v of g2.sample(20, 5)) {
      expect(v.length).toBeGreaterThanOrEqual(2);
      expect(v.length).toBeLessThanOrEqual(6);
    }
  });

  it('optional/nullable inject absence', () => {
    const g = Gen.int({ min: 0, max: 5 }).optional();
    const vals = g.sample(200, 6);
    expect(vals.some((v) => v === undefined)).toBe(true);
    expect(vals.some((v) => typeof v === 'number')).toBe(true);
    const n = Gen.int({ min: 0, max: 5 }).nullable();
    const nv = n.sample(200, 6);
    expect(nv.some((v) => v === null)).toBe(true);
  });

  it('or/weighted unions', () => {
    const g = Gen.constant('a').or(Gen.constant('b'));
    const vals = new Set(g.sample(40, 7));
    expect(vals.size).toBe(2);
    const w = Gen.constant('heavy').weighted(Gen.constant('light'), 1, 99);
    const wv = w.sample(200, 8);
    const heavy = wv.filter((v) => v === 'heavy').length;
    expect(heavy).toBeGreaterThan(160);
  });

  it('flatMap draws dependent values', () => {
    // array whose length is drawn first, then that many elements
    const g = Gen.int({ min: 1, max: 4 }).flatMap((len) =>
      Gen.int({ min: 0, max: 9 }).list(len)
    );
    for (const v of g.sample(50, 9)) {
      expect(v.length).toBeGreaterThanOrEqual(1);
      expect(v.length).toBeLessThanOrEqual(4);
    }
  });

  it('shrinkWith appends candidates', () => {
    const g = Gen.int({ min: 0, max: 100 }).shrinkWith((v) => [v - 100]);
    const tree = g.arbitrary.generate(() => 0.9);
    const cands = tree.candidates();
    expect(cands.some((c) => c.value === tree.value - 100)).toBe(true);
  });
});

describe('genRecord / genTuple', () => {
  it('builds shaped objects', () => {
    const g = genRecord({
      id: Gen.int({ min: 0, max: 100 }),
      name: Gen.string({ charset: 'a', maxLength: 3 }),
      active: Gen.boolean(),
    });
    for (const v of g.sample(20, 1)) {
      expect(typeof v.id).toBe('number');
      expect(typeof v.name).toBe('string');
      expect(typeof v.active).toBe('boolean');
    }
  });

  it('builds tuples', () => {
    const g = genTuple(Gen.int({ min: 0, max: 5 }), Gen.boolean(), Gen.string({ charset: 'z', maxLength: 2 }));
    for (const v of g.sample(20, 2)) {
      expect(v).toHaveLength(3);
      expect(typeof v[0]).toBe('number');
      expect(typeof v[1]).toBe('boolean');
      expect(v[2]).toMatch(/^z*$/);
    }
  });
});

describe('Gen integrates with PropertyRunner', () => {
  it('Gen arbitraries plug into properties', async () => {
    const g = genRecord({ a: Gen.int({ min: 0, max: 50 }), b: Gen.int({ min: 0, max: 50 }) });
    const p = property('sum', [g.arbitrary] as const, (v) => v.a + v.b >= 0);
    const report = await new PropertyRunner({ cases: 50 }).check(p, 1);
    expect(report.status).toBe('passed');
  });

  it('shrinks Gen-derived counterexamples', async () => {
    const g = Gen.int({ min: 0, max: 100 });
    const p = property('small', [g.arbitrary] as const, (n) => n < 3);
    const report = await new PropertyRunner({ cases: 100 }).check(p, 5);
    expect(report.status).toBe('failed');
    expect(report.failure?.counterexample).toBe(3);
  });
});

describe('draw / sample determinism', () => {
  it('draw gives a single deterministic value', () => {
    const g = Gen.int({ min: 0, max: 1000 });
    expect(g.draw(42)).toBe(g.draw(42));
    expect(g.draw(42)).not.toBe(g.draw(43));
  });
});
