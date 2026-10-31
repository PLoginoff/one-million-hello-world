/**
 * Tests for AnomalyScorer: seasonal slotting, baseline learning and
 * z-score flagging.
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { AnomalyScorer } from '../AnomalyScorer';
import { ManualAnalyticsClock2 } from '../types';

const HOUR = 3_600_000;
const DAY = 86_400_000;

describe('AnomalyScorer — slotting', () => {
  it('hour-of-day slots map timestamps correctly', () => {
    const s = new AnomalyScorer({ season: 'hour-of-day' });
    expect(s.slotOf(0)).toBe(0);
    expect(s.slotOf(HOUR * 5 + 100)).toBe(5);
    expect(s.slotOf(HOUR * 23 + 3_599_999)).toBe(23);
  });

  it('hour-of-week slots span 0..167', () => {
    const s = new AnomalyScorer({ season: 'hour-of-week' });
    expect(s.slotOf(0)).toBe(0);
    expect(s.slotOf(HOUR * 167)).toBe(167);
    expect(s.slotOf(HOUR * 168)).toBe(0); // wraps to next week
  });

  it('negative timestamps normalize into the cycle', () => {
    const s = new AnomalyScorer({ season: 'hour-of-day' });
    expect(s.slotOf(-HOUR)).toBe(23);
  });
});

describe('AnomalyScorer — baseline learning', () => {
  let clock: ManualAnalyticsClock2;
  let s: AnomalyScorer;

  beforeEach(() => {
    clock = new ManualAnalyticsClock2(0);
    s = new AnomalyScorer({ season: 'hour-of-day', alpha: 0.5, minSeasons: 3, clock });
  });

  it('does not flag during warm-up (minSeasons)', () => {
    // Feed the same hour slot twice — still under minSeasons.
    s.observe('m', 100, 0);
    const r = s.observe('m', 10_000, DAY); // same hour-of-day
    expect(r.anomalous).toBe(false);
    expect(r.z).toBeNaN();
  });

  it('flags a large deviation after warm-up', () => {
    // Teach the 0:00 slot that 100 is normal (EWMA converges).
    s.observe('m', 100, 0);
    s.observe('m', 100, DAY);
    s.observe('m', 100, 2 * DAY);
    s.observe('m', 100, 3 * DAY);
    const r = s.observe('m', 500, 4 * DAY); // spike in the same slot
    expect(r.anomalous).toBe(true);
    expect(r.z).toBeGreaterThan(3);
    expect(r.slot).toBe(0);
  });

  it('normal values in other slots are not flagged by slot-0 training', () => {
    for (let i = 0; i < 4; i++) s.observe('m', 100, i * DAY); // all 0:00
    // A different slot has no baseline → no flag even for a big value.
    const r = s.observe('m', 10_000, 4 * DAY + HOUR * 14);
    expect(r.anomalous).toBe(false);
    expect(r.z).toBeNaN();
    expect(r.slot).toBe(14);
  });

  it('score() peeks without mutating the baseline', () => {
    for (let i = 0; i < 4; i++) s.observe('m', 100, i * DAY);
    const before = s.baseline('m', 0)!.mean;
    s.score('m', 9999, 4 * DAY);
    expect(s.baseline('m', 0)!.mean).toBe(before);
  });

  it('baseline tracks slow drift without endless anomalies', () => {
    // Gradual rise: baseline should adapt so mid-range values stay ok.
    let flagged = 0;
    for (let i = 0; i < 12; i++) {
      const r = s.observe('m', 100 + i * 10, i * DAY);
      if (r.anomalous) flagged++;
    }
    // Some early flags possible while variance is tiny, but the
    // trend-adjusted mean should not flag every later point.
    expect(flagged).toBeLessThan(12);
  });

  it('zero-variance slots still flag huge deviations via sigma floor', () => {
    for (let i = 0; i < 4; i++) s.observe('m', 50, i * DAY);
    // sigma floor = 50·0.001 = 0.05 → z = 2/0.05 = 40 → anomalous.
    const r = s.observe('m', 52, 4 * DAY);
    expect(r.anomalous).toBe(true);
    expect(r.z).toBeGreaterThan(3);
  });

  it('baseline() reports slot stats after observations', () => {
    s.observe('m', 100, 0);
    s.observe('m', 200, DAY);
    const b = s.baseline('m', 0)!;
    expect(b.n).toBe(2);
    // EWMA with alpha=0.5: mean2 = 100 + 0.5·(200−100) = 150;
    // m2 = (1−α)·α·δ² = 0.25·100² = 2500 → stddev = 50
    expect(b.mean).toBeCloseTo(150, 6);
    expect(b.stddev).toBeCloseTo(50, 6);
  });

  it('rejects invalid alpha', () => {
    expect(() => new AnomalyScorer({ season: 'hour-of-day', alpha: 0 })).toThrow();
    expect(() => new AnomalyScorer({ season: 'hour-of-day', alpha: 1.5 })).toThrow();
  });

  it('metrics() lists tracked metrics', () => {
    s.observe('a', 1, 0);
    s.observe('b', 2, 0);
    expect(s.metrics().sort()).toEqual(['a', 'b']);
  });
});
