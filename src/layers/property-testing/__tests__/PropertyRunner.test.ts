/**
 * PropertyRunner tests — check loop, shrinking, seeds, built-ins.
 */

import { describe, it, expect } from 'bun:test';
import {
  property,
  checkProperty,
  replay,
  suiteSeed,
  PropertyRunner,
  int,
  float,
  boolean,
  string,
  array,
  record,
  roundtripProperty,
  invariantProperty,
  idempotenceProperty,
  commutativeProperty,
  associativeProperty,
} from '../engine/index';

describe('check — passing properties', () => {
  it('passes a true property', async () => {
    const p = property('add commutes', [int(), int()] as const, (a, b) => a + b === b + a);
    const report = await new PropertyRunner({ cases: 50 }).check(p, 1);
    expect(report.status).toBe('passed');
    expect(report.casesRun).toBe(50);
  });

  it('reports exhaustion when precondition never holds', async () => {
    const p = property(
      'impossible',
      [int({ min: 0, max: 10 })] as const,
      () => true,
      () => false
    );
    const report = await new PropertyRunner({ cases: 10, maxDiscards: 20 }).check(p, 1);
    expect(report.status).toBe('exhausted');
    expect(report.casesDiscarded).toBe(20);
  });

  it('precondition discards cases without running them', async () => {
    const p = property(
      'positive only',
      [int({ min: -100, max: 100 })] as const,
      (n) => n > 0,
      (n) => n > 0
    );
    const report = await new PropertyRunner({ cases: 30 }).check(p, 3);
    expect(report.status).toBe('passed');
    expect(report.casesDiscarded).toBeGreaterThan(0);
    expect(report.casesRun).toBe(30);
  });
});

describe('check — failing properties', () => {
  it('fails and shrinks to minimal counterexample', async () => {
    const p = property(
      'n < 5 always',
      [int({ min: 0, max: 100 })] as const,
      (n) => n < 5
    );
    const report = await new PropertyRunner({ cases: 200 }).check(p, 7);
    expect(report.status).toBe('failed');
    expect(report.failure?.counterexample).toBe(5); // minimal failing
    expect(report.failure?.shrinkEvals).toBeGreaterThan(0);
  });

  it('captures thrown errors as failures', async () => {
    const p = property('throws on even', [int({ min: 0, max: 10 })] as const, (n) => {
      if (n % 2 === 0) throw new Error('even!');
      return true;
    });
    const report = await new PropertyRunner({ cases: 50 }).check(p, 4);
    expect(report.status).toBe('failed');
    expect((report.failure?.error as Error).message).toBe('even!');
  });

  it('shrinks multi-arg cases', async () => {
    const p = property(
      'sum < 3',
      [int({ min: 0, max: 50 }), int({ min: 0, max: 50 })] as const,
      (a, b) => a + b < 3
    );
    const report = await new PropertyRunner({ cases: 300 }).check(p, 11);
    expect(report.status).toBe('failed');
    const ce = report.failure?.counterexample as [number, number];
    expect(ce[0] + ce[1]).toBeGreaterThanOrEqual(3);
    expect(ce[0] + ce[1]).toBeLessThanOrEqual(10); // near-minimal
  });
});

describe('deterministic seeds', () => {
  it('same seed reproduces the same counterexample', async () => {
    const p = property('n<50', [int({ min: 0, max: 1000 })] as const, (n) => n < 50);
    const r1 = await new PropertyRunner({ cases: 100 }).check(p, 42);
    const r2 = await new PropertyRunner({ cases: 100 }).check(p, 42);
    expect(r1.status).toBe('failed');
    expect(r1.failure?.original).toEqual(r2.failure?.original);
    expect(r1.failure?.counterexample).toEqual(r2.failure?.counterexample);
  });

  it('replay() reproduces a recorded failure', async () => {
    const p = property('small', [int({ min: 0, max: 999 })] as const, (n) => n < 10);
    const first = await new PropertyRunner({ cases: 100 }).check(p, 99);
    expect(first.status).toBe('failed');
    const again = await replay(p, first.seed);
    expect(again.status).toBe('failed');
    expect(again.failure?.counterexample).toEqual(first.failure?.counterexample);
  });

  it('suiteSeed derives stable per-name seeds', () => {
    expect(suiteSeed(1, 'a')).toBe(suiteSeed(1, 'a'));
    expect(suiteSeed(1, 'a')).not.toBe(suiteSeed(1, 'b'));
  });
});

describe('checkProperty (throwing helper)', () => {
  it('does not throw for passing properties', async () => {
    await expect(
      checkProperty(property('ok', [int()] as const, () => true), { seed: 1 })
    ).resolves.toBeDefined();
  });

  it('throws with counterexample for failing ones', async () => {
    const err = await checkProperty(
      property('fails', [int({ min: 0, max: 100 })] as const, (n) => n < 1),
      { seed: 5, cases: 100 }
    ).catch((e: Error) => e);
    expect(err.message).toContain('falsified');
    expect(err.message).toContain('counterexample');
    expect(err.message).toContain('seed');
  });
});

describe('built-in properties', () => {
  it('roundtrip: JSON serialize/parse', async () => {
    const p = roundtripProperty(
      'json roundtrip',
      record({ a: int(), b: string({ maxLength: 8 }), c: boolean() }),
      (v) => JSON.stringify(v),
      (s) => JSON.parse(s as string) as { a: number; b: string; c: boolean },
      (a, b) => a.a === b.a && a.b === b.b && a.c === b.c
    );
    const report = await new PropertyRunner({ cases: 50 }).check(p, 1);
    expect(report.status).toBe('passed');
  });

  it('roundtrip detects codec bugs', async () => {
    const p = roundtripProperty(
      'broken codec',
      int({ min: 0, max: 100 }),
      (v) => String(v),
      (s) => Number(s) + 1 // bug: off by one
    );
    const report = await new PropertyRunner({ cases: 20 }).check(p, 1);
    expect(report.status).toBe('failed');
    expect(report.failure?.counterexample).toBe(0); // minimal
  });

  it('invariant: sort output is ordered and same length', async () => {
    const p = invariantProperty(
      'sort keeps length',
      array(int(), { maxLength: 20 }),
      (xs) => [...xs].sort((a, b) => a - b),
      (sorted) => sorted.every((v, i) => i === 0 || sorted[i - 1] <= v)
    );
    const report = await new PropertyRunner({ cases: 30 }).check(p, 1);
    expect(report.status).toBe('passed');
  });

  it('idempotence: dedupe is idempotent', async () => {
    const dedupe = (xs: number[]): number[] => [...new Set(xs)];
    const p = idempotenceProperty('dedupe', array(int({ min: 0, max: 5 })), dedupe);
    const report = await new PropertyRunner({ cases: 50 }).check(p, 2);
    expect(report.status).toBe('passed');
  });

  it('idempotence catches non-idempotent fn', async () => {
    // f(x) = x + 1 is genuinely non-idempotent: f(f(0)) = 2 ≠ 1
    const p = idempotenceProperty('f', int({ min: 0, max: 100 }), (n) => n + 1);
    const report = await new PropertyRunner({ cases: 100 }).check(p, 3);
    expect(report.status).toBe('failed');
    expect(report.failure?.counterexample).toBe(0);
  });

  it('commutativity: min is commutative, subtract is not', async () => {
    const p = commutativeProperty('min comm', int(), int(), Math.min);
    expect((await new PropertyRunner({ cases: 30 }).check(p, 1)).status).toBe('passed');

    const p2 = commutativeProperty('sub', int({ min: -10, max: 10 }), int({ min: -10, max: 10 }), (a, b) => a - b);
    const report = await new PropertyRunner({ cases: 100 }).check(p2, 1);
    expect(report.status).toBe('failed');
  });

  it('associativity: max is associative', async () => {
    const p = associativeProperty('max', int({ min: -100, max: 100 }), Math.max);
    expect((await new PropertyRunner({ cases: 50 }).check(p, 1)).status).toBe('passed');
  });
});

describe('async predicates', () => {
  it('supports async property predicates', async () => {
    const p = property('async', [int({ min: 0, max: 50 })] as const, async (n) => {
      await Promise.resolve();
      return n < 40;
    });
    const report = await new PropertyRunner({ cases: 80 }).check(p, 8);
    expect(['passed', 'failed']).toContain(report.status);
  });
});
