/**
 * Metrics engine tests — reservoir sampling, sliding windows, Welch t-test.
 */

import { describe, it, expect } from 'bun:test';
import {
  ReservoirSampler,
  SlidingThroughputWindow,
  ErrorRateTracker,
  mulberry32,
  randInt,
  randExponential,
  welchTTest,
  regularizedBeta,
  lgamma,
} from '../engine/Metrics';

describe('mulberry32', () => {
  it('is deterministic for a seed', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    for (let i = 0; i < 100; i++) expect(a()).toBe(b());
  });

  it('different seeds diverge', () => {
    const a = mulberry32(1);
    const b = mulberry32(2);
    const same = Array.from({ length: 20 }, () => a() === b()).filter(Boolean);
    expect(same.length).toBeLessThan(2);
  });

  it('produces values in [0,1)', () => {
    const r = mulberry32(7);
    for (let i = 0; i < 1000; i++) {
      const v = r();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe('rand helpers', () => {
  it('randInt stays in range', () => {
    const r = mulberry32(1);
    for (let i = 0; i < 500; i++) {
      const v = randInt(r, 3, 7);
      expect(v).toBeGreaterThanOrEqual(3);
      expect(v).toBeLessThanOrEqual(7);
      expect(Number.isInteger(v)).toBe(true);
    }
  });

  it('randExponential has approximately the right mean', () => {
    const r = mulberry32(1);
    const lambda = 0.01; // mean 100
    let sum = 0;
    const n = 5000;
    for (let i = 0; i < n; i++) sum += randExponential(r, lambda);
    expect(sum / n).toBeGreaterThan(85);
    expect(sum / n).toBeLessThan(115);
  });
});

describe('ReservoirSampler', () => {
  it('estimates percentiles of a known distribution', () => {
    const s = new ReservoirSampler(500, 1);
    for (let i = 1; i <= 1000; i++) s.record(i);
    const snap = s.snapshot();
    expect(snap.count).toBe(1000);
    expect(snap.min).toBeGreaterThanOrEqual(1);
    expect(snap.max).toBeLessThanOrEqual(1000);
    // reservoir is a uniform sample — percentiles approximate the true
    // distribution within sampling error
    expect(snap.p50).toBeGreaterThan(300);
    expect(snap.p50).toBeLessThan(700);
    expect(snap.p99).toBeGreaterThan(800);
  });

  it('is exact when stream fits in reservoir', () => {
    const s = new ReservoirSampler(100, 1);
    for (let i = 1; i <= 100; i++) s.record(i);
    const snap = s.snapshot();
    expect(snap.p50).toBe(50);
    expect(snap.min).toBe(1);
    expect(snap.max).toBe(100);
    expect(snap.mean).toBeCloseTo(50.5, 1);
  });

  it('handles empty and single-element', () => {
    const s = new ReservoirSampler(10, 1);
    expect(s.percentile(50)).toBeNaN();
    s.record(42);
    expect(s.percentile(99)).toBe(42);
  });

  it('is deterministic under a fixed seed', () => {
    const a = new ReservoirSampler(50, 99);
    const b = new ReservoirSampler(50, 99);
    for (let i = 0; i < 500; i++) {
      a.record(i * 1.7);
      b.record(i * 1.7);
    }
    expect(a.snapshot()).toEqual(b.snapshot());
  });
});

describe('SlidingThroughputWindow', () => {
  it('counts events in the window via injected clock', () => {
    let t = 0;
    const w = new SlidingThroughputWindow(1000, 10, () => t);
    w.record(5);
    expect(w.total()).toBe(5);
    expect(w.perSecond()).toBeCloseTo(5, 5);
    t = 500;
    w.record(5);
    expect(w.total()).toBe(10);
    t = 1100; // first events expired
    expect(w.total()).toBe(5);
  });

  it('expires all buckets after a full window', () => {
    let t = 0;
    const w = new SlidingThroughputWindow(1000, 10, () => t);
    w.record(3);
    t = 5000;
    expect(w.total()).toBe(0);
    expect(w.perSecond()).toBe(0);
  });
});

describe('ErrorRateTracker', () => {
  it('tracks sliding error ratio', () => {
    let t = 0;
    const e = new ErrorRateTracker(1000, () => t);
    for (let i = 0; i < 90; i++) e.recordSuccess();
    for (let i = 0; i < 10; i++) e.recordError('http5xx');
    expect(e.rate()).toBeCloseTo(0.1, 5);
    expect(e.totalErrors).toBe(10);
    expect(e.byClass().get('http5xx')).toBe(10);
    t = 2000;
    expect(e.rate()).toBe(0);
  });
});

describe('welchTTest', () => {
  it('detects clearly different means', () => {
    const a = Array.from({ length: 50 }, (_, i) => 100 + (i % 5));
    const b = Array.from({ length: 50 }, (_, i) => 200 + (i % 5));
    const r = welchTTest(a, b);
    expect(r.pValue).toBeLessThan(0.001);
    expect(r.t).toBeLessThan(0);
  });

  it('does not flag same-distribution samples', () => {
    const rand = mulberry32(3);
    const a = Array.from({ length: 60 }, () => 100 + rand() * 10);
    const b = Array.from({ length: 60 }, () => 100 + rand() * 10);
    const r = welchTTest(a, b);
    expect(r.pValue).toBeGreaterThan(0.05);
  });

  it('handles constant samples', () => {
    const r = welchTTest([5, 5, 5], [5, 5, 5]);
    expect(r.pValue).toBe(1);
    const r2 = welchTTest([5, 5, 5], [9, 9, 9]);
    expect(r2.pValue).toBe(0);
  });
});

describe('regularizedBeta / lgamma', () => {
  it('beta is 0/1 at bounds and monotonic', () => {
    expect(regularizedBeta(0, 2, 2)).toBe(0);
    expect(regularizedBeta(1, 2, 2)).toBe(1);
    const m = regularizedBeta(0.5, 2, 2);
    expect(m).toBeCloseTo(0.5, 6); // symmetric case
  });

  it('lgamma matches known values', () => {
    expect(lgamma(1)).toBeCloseTo(0, 10); // ln(1!) = 0
    expect(lgamma(5)).toBeCloseTo(Math.log(24), 10); // 4! = 24
    expect(lgamma(0.5)).toBeCloseTo(Math.log(Math.sqrt(Math.PI)), 10);
  });
});
