/**
 * engine2 FeatureQualityMonitor tests.
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { ManualClock } from '../../../observability/engine';
import { FeatureQualityMonitor } from '../../engine2';

const HOUR = 3_600_000;

describe('FeatureQualityMonitor', () => {
  let clock: ManualClock;
  let q: FeatureQualityMonitor;

  beforeEach(() => {
    clock = new ManualClock(10_000);
    q = new FeatureQualityMonitor(HOUR, clock);
    q.expect({ feature: 'score', min: 0, max: 1, maxNullRate: 0.1, maxOutOfRangeRate: 0.1, maxStalenessMs: 30_000 });
  });

  it('clean writes produce no violations', () => {
    for (let i = 0; i < 10; i++) q.record('score', 0.5, 'number');
    const r = q.report('score');
    expect(r.writes).toBe(10);
    expect(r.violations.length).toBe(0);
    expect(r.nullRate).toBe(0);
  });

  it('null rate above the limit violates', () => {
    q.record('score', 0.5);
    q.record('score', null);
    q.record('score', null); // 2/3 nulls
    const r = q.report('score');
    expect(r.nullRate).toBeCloseTo(2 / 3, 9);
    const v = r.violations.find((x) => x.kind === 'null-rate');
    expect(v).toBeDefined();
  });

  it('out-of-range values are counted and rate-limited', () => {
    q.record('score', 0.5);
    q.record('score', 5); // > max 1
    q.record('score', -2); // < min 0
    const r = q.report('score');
    expect(r.outOfRangeCount).toBe(2);
    expect(r.violations.some((v) => v.kind === 'range-rate')).toBe(true);
  });

  it('stale feature violates when newest write ages past the limit', () => {
    q.record('score', 0.5, 'number', 10_000);
    clock.set(10_000 + 60_000); // 60s old > 30s limit
    const r = q.report('score');
    expect(r.stalenessMs).toBe(60_000);
    expect(r.violations.some((v) => v.kind === 'stale')).toBe(true);
  });

  it('type mismatches always violate', () => {
    q.record('score', 'not-a-number' as never, 'number');
    const r = q.report('score');
    expect(r.violations.some((v) => v.kind === 'type-mismatch')).toBe(true);
  });

  it('sliding window forgets old writes', () => {
    // 10 nulls at t=0 — bad.
    for (let i = 0; i < 10; i++) q.record('score', null, 'number', 0);
    clock.set(HOUR + 1);
    q.record('score', 0.5, 'number'); // one clean write in window
    const r = q.report('score');
    expect(r.writes).toBe(1);
    expect(r.nullRate).toBe(0);
  });

  it('undeclared features still get recorded with no violations', () => {
    q.record('undeclared', 'anything');
    const r = q.report('undeclared');
    expect(r.writes).toBe(1);
    expect(r.violations.length).toBe(0);
  });

  it('violations() aggregates across features', () => {
    q.expect({ feature: 'other', maxNullRate: 0 });
    q.record('score', null);
    q.record('other', null);
    const all = q.violations();
    expect(all.length).toBeGreaterThanOrEqual(2);
    expect(new Set(all.map((v) => v.feature))).toEqual(new Set(['score', 'other']));
  });
});
