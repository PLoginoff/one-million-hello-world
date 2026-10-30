/**
 * Workload distribution tests.
 */

import { describe, it, expect } from 'bun:test';
import {
  lognormal,
  pareto,
  normal,
  mixture,
  withJitter,
  dependencyChain,
  cacheModel,
  stampedeCache,
  apiWorkload,
  dbWorkload,
  mulberry32,
} from '../engine/index';

describe('base distributions', () => {
  it('lognormal median is approximately preserved', () => {
    const s = lognormal(100, 0.5);
    const r = mulberry32(1);
    const vals = Array.from({ length: 3000 }, () => s(r));
    vals.sort((a, b) => a - b);
    const median = vals[1500];
    expect(median).toBeGreaterThan(85);
    expect(median).toBeLessThan(115);
    // right-skewed: mean > median
    const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
    expect(mean).toBeGreaterThan(median);
  });

  it('pareto is heavy-tailed with min bound', () => {
    const s = pareto(10, 1.5);
    const r = mulberry32(2);
    const vals = Array.from({ length: 2000 }, () => s(r));
    for (const v of vals) expect(v).toBeGreaterThanOrEqual(10);
    // tail exists: some values >> min
    expect(Math.max(...vals)).toBeGreaterThan(50);
    expect(Math.min(...vals)).toBeLessThan(15);
  });

  it('normal centers on mean, non-negative', () => {
    const s = normal(50, 10);
    const r = mulberry32(3);
    const vals = Array.from({ length: 1000 }, () => s(r));
    for (const v of vals) expect(v).toBeGreaterThanOrEqual(0);
    const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
    expect(mean).toBeGreaterThan(45);
    expect(mean).toBeLessThan(55);
  });

  it('mixture picks branches by weight', () => {
    const s = mixture([
      { weight: 90, sampler: () => 10 },
      { weight: 10, sampler: () => 1000 },
    ]);
    const r = mulberry32(4);
    let tens = 0;
    for (let i = 0; i < 1000; i++) if (s(r) === 10) tens++;
    expect(tens).toBeGreaterThan(820);
    expect(tens).toBeLessThan(980);
  });

  it('withJitter perturbs around base', () => {
    const s = withJitter(() => 100, 0.2);
    const r = mulberry32(5);
    const vals = Array.from({ length: 500 }, () => s(r));
    const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
    expect(mean).toBeGreaterThan(90);
    expect(mean).toBeLessThan(110);
    expect(new Set(vals).size).toBeGreaterThan(50);
  });
});

describe('dependencyChain', () => {
  it('parallel = max of calls', () => {
    const s = dependencyChain(3, () => 100, 'parallel', 5);
    expect(s(mulberry32(1))).toBe(105);
  });
  it('sequential = sum of calls', () => {
    const s = dependencyChain(3, () => 100, 'sequential');
    expect(s(mulberry32(1))).toBe(300);
  });
  it('k-of-n picks k-th fastest', () => {
    const rand = mulberry32(7);
    const s = dependencyChain(5, lognormal(50, 0.5), 'k-of-n', 0, 1);
    const v = s(rand);
    // 1-of-5 hedged request — should be fast
    expect(v).toBeLessThan(60);
  });
});

describe('cache models', () => {
  it('hitRate splits latency', () => {
    const s = cacheModel({ hitMs: 1, missMs: 100, hitRate: 0.9 });
    const r = mulberry32(6);
    let hits = 0;
    for (let i = 0; i < 1000; i++) if (s(r) === 1) hits++;
    expect(hits).toBeGreaterThan(850);
    expect(hits).toBeLessThan(950);
  });

  it('stampede forces misses after TTL', () => {
    const s = stampedeCache({ hitMs: 1, missMs: 100, hitRate: 0.95, stampedeN: 3, ttlMs: 1000 });
    const r = mulberry32(7);
    // at t=0 the window is fresh — first call triggers TTL expiry → stampede
    const l1 = s(r, 0);   // miss (stampede)
    const l2 = s(r, 100); // miss
    const l3 = s(r, 200); // miss
    const l4 = s(r, 300); // hit (stampede exhausted, rand decides)
    expect([l1, l2, l3]).toEqual([100, 100, 100]);
    void l4;
  });
});

describe('preset workloads', () => {
  it('apiWorkload produces realistic spread', () => {
    const s = apiWorkload();
    const r = mulberry32(8);
    const vals = Array.from({ length: 1000 }, () => s(r));
    vals.sort((a, b) => a - b);
    expect(vals[500]).toBeLessThan(50);   // median fast
    expect(vals[990]).toBeGreaterThan(vals[500]); // tail exists
  });
  it('dbWorkload skews fast', () => {
    const s = dbWorkload();
    const r = mulberry32(9);
    const vals = Array.from({ length: 1000 }, () => s(r));
    vals.sort((a, b) => a - b);
    expect(vals[900]).toBeLessThan(10);
  });
});
