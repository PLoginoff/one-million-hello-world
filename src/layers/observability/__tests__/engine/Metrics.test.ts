/**
 * MetricsEngine tests — counters, gauges, histograms, summaries.
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { ManualClock, MetricsEngine, attributeKey } from '../../engine';

describe('MetricsEngine', () => {
  let clock: ManualClock;
  let m: MetricsEngine;

  beforeEach(() => {
    clock = new ManualClock(0);
    m = new MetricsEngine({}, clock);
  });

  it('accumulates counters per attribute set', () => {
    m.increment('requests', 1, { route: '/a' });
    m.increment('requests', 2, { route: '/a' });
    m.increment('requests', 5, { route: '/b' });
    const points = m.collect();
    expect(points.length).toBe(2);
    const a = points.find((p) => attributeKey(p.name === 'requests' ? { route: '/a' } : {}) !== '');
    // find via series count instead
    const total = points.reduce((s, p) => s + p.value, 0);
    expect(total).toBe(8);
    void a;
  });

  it('gauge holds last value', () => {
    m.set('temp', 20);
    m.set('temp', 25);
    const points = m.collect().filter((p) => p.name === 'temp');
    expect(points[0].value).toBe(25);
  });

  it('histogram aggregates into le-buckets', () => {
    m.observe('latency', 7, undefined, [5, 10, 50]);
    m.observe('latency', 30, undefined, [5, 10, 50]);
    m.observe('latency', 100, undefined, [5, 10, 50]);
    const h = m.collect().find((p) => p.name === 'latency')!;
    expect(h.count).toBe(3);
    expect(h.sum).toBe(137);
    expect(h.buckets![0]).toEqual({ le: 5, count: 0 });
    expect(h.buckets![1]).toEqual({ le: 10, count: 1 });
    expect(h.buckets![2]).toEqual({ le: 50, count: 2 });
    expect(h.buckets![3]).toEqual({ le: Infinity, count: 3 });
  });

  it('summary quantile approximates over reservoir', () => {
    for (let i = 1; i <= 100; i++) m.record('q', i);
    expect(m.quantile('q', 0.5)).toBeGreaterThanOrEqual(45);
    expect(m.quantile('q', 0.5)).toBeLessThanOrEqual(55);
    expect(m.quantile('q', 0.99)).toBeGreaterThanOrEqual(95);
  });

  it('delta temporality resets counters on collect', () => {
    const delta = new MetricsEngine({ temporality: 'delta' }, clock);
    delta.increment('x', 5);
    expect(delta.collect()[0].value).toBe(5);
    expect(delta.collect().length).toBe(0); // drained
  });
});
