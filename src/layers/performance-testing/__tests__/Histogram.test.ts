/**
 * Histogram + arrival-rate model tests.
 */

import { describe, it, expect } from 'bun:test';
import { HdrHistogram, ArrivalRateModel } from '../engine/index';

describe('HdrHistogram', () => {
  it('records and reports percentiles within bucket resolution', () => {
    const h = new HdrHistogram({ lowest: 1, highest: 10_000, significantDigits: 2 });
    for (let i = 1; i <= 1000; i++) h.record(i);
    expect(h.total).toBe(1000);
    expect(h.min()).toBe(1);
    expect(h.max()).toBe(1000);
    // bucket resolution ~1% — p50 within a couple buckets of 500
    expect(h.percentile(50)).toBeGreaterThanOrEqual(500);
    expect(h.percentile(50)).toBeLessThanOrEqual(520);
    expect(h.percentile(99)).toBeGreaterThanOrEqual(990);
  });

  it('handles empty and sparse data', () => {
    const h = new HdrHistogram();
    expect(h.percentile(50)).toBeNaN();
    h.record(250);
    expect(h.percentile(99)).toBeGreaterThanOrEqual(250);
    expect(h.mean()).toBeGreaterThanOrEqual(250);
  });

  it('snapshot reports all percentiles', () => {
    const h = new HdrHistogram();
    for (let i = 0; i < 500; i++) h.record(10 + Math.random() * 90);
    const s = h.snapshot();
    expect(s.total).toBe(500);
    expect(s.p50).toBeLessThan(s.p99);
    expect(s.p999).toBeGreaterThanOrEqual(s.p99);
  });

  it('merges two histograms', () => {
    const a = new HdrHistogram({ lowest: 1, highest: 1000 });
    const b = new HdrHistogram({ lowest: 1, highest: 1000 });
    for (let i = 0; i < 50; i++) a.record(100);
    for (let i = 0; i < 50; i++) b.record(200);
    a.merge(b);
    expect(a.total).toBe(100);
    expect(a.percentile(50)).toBeGreaterThanOrEqual(100);
    expect(a.percentile(50)).toBeLessThanOrEqual(200);
  });
});

describe('ArrivalRateModel', () => {
  it('constant rate produces exact spacing', () => {
    const m = new ArrivalRateModel(100); // 100 rps → 10ms spacing
    const arrivals = m.constant(1000);
    expect(arrivals).toHaveLength(99); // t=10..990
    expect(arrivals[0]?.at).toBeCloseTo(10, 5);
    expect(arrivals[98]?.at).toBeCloseTo(990, 5);
  });

  it('poisson rate approximates expected count', () => {
    const m = new ArrivalRateModel(50); // 50/s → ~50 in 1000ms
    const arrivals = m.poisson(1000, 42);
    // Poisson mean 50, std ~7 — generous bounds
    expect(arrivals.length).toBeGreaterThan(35);
    expect(arrivals.length).toBeLessThan(65);
    // monotonic timestamps
    for (let i = 1; i < arrivals.length; i++) {
      expect(arrivals[i].at).toBeGreaterThan(arrivals[i - 1].at);
    }
  });

  it('poisson is deterministic per seed', () => {
    const m = new ArrivalRateModel(50);
    const a = m.poisson(1000, 7);
    const b = m.poisson(1000, 7);
    expect(a.map((x) => x.at)).toEqual(b.map((x) => x.at));
  });

  it('ramping rate increases arrival density', () => {
    const m = new ArrivalRateModel(200);
    const arrivals = m.ramping(2000, 10, 1000, 1);
    const firstHalf = arrivals.filter((a) => a.at < 1000).length;
    const secondHalf = arrivals.length - firstHalf;
    // end rate 200/s >> start 10/s — second half denser
    expect(secondHalf).toBeGreaterThan(firstHalf);
  });

  it('bursty produces periodic density spikes', () => {
    const m = new ArrivalRateModel(10);
    // 100ms bursts at 100rps every 500ms
    const arrivals = m.bursty(2000, 100, 100, 500, 2);
    const inBurst = arrivals.filter((a) => a.at % 500 < 100).length;
    const outBurst = arrivals.length - inBurst;
    const burstRate = inBurst / (2000 / 500 * 100 / 1000);
    const baseRate = outBurst / (2000 / 500 * 400 / 1000);
    expect(burstRate).toBeGreaterThan(baseRate * 2);
  });
});
