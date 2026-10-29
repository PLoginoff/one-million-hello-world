/**
 * Tests for SlidingWindowZScore.
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { SlidingWindowZScore } from '../strategies/SlidingWindowZScore';
import { TrafficEvent } from '../types/traffic';

const WIN_MS = 60_000; // 60 × 1s buckets

function ev(ip: string, at: number): TrafficEvent {
  return { srcIp: ip, protocol: 'HTTP', at };
}

/** Feed n events spread across a window at evenly-spaced timestamps. */
function feed(det: SlidingWindowZScore, ip: string, startAt: number, count: number) {
  for (let i = 0; i < count; i++) {
    det.inspect(ev(ip, startAt + Math.floor((i * WIN_MS) / count)));
  }
}

describe('SlidingWindowZScore', () => {
  let det: SlidingWindowZScore;

  beforeEach(() => {
    det = new SlidingWindowZScore({
      bucketMs: 1000,
      bucketCount: 60,
      zThreshold: 3,
      minHistory: 5,
    });
  });

  it('returns allow while history builds', () => {
    const r = det.inspect(ev('1.1.1.1', 0));
    expect(r.verdict).toBe('allow');
    expect(r.reasons[0]).toBe('insufficient-history');
  });

  it('builds a baseline from closed windows', () => {
    // Simulate 6 historical windows of ~100 events each.
    for (let w = 0; w < 6; w++) {
      feed(det, '9.9.9.9', w * WIN_MS, 100);
    }
    // Force the 7th window to close → baseline updated.
    det.closeWindow('9.9.9.9');
    const b = det.baseline('9.9.9.9')!;
    expect(b.n).toBeGreaterThanOrEqual(6);
    expect(b.mean).toBeCloseTo(100, -1); // within ±50
  });

  it('flags a sudden spike well above baseline', () => {
    const ip = '5.5.5.5';
    for (let w = 0; w < 6; w++) {
      feed(det, ip, w * WIN_MS, 100);
    }
    det.closeWindow(ip);
    // Next window: a flood of 2000 events in the first bucket.
    const base = 6 * WIN_MS;
    let last;
    for (let i = 0; i < 2000; i++) {
      last = det.inspect(ev(ip, base + i));
    }
    expect(last!.verdict).toBe('rate-limit');
    expect(last!.breakdown.z!).toBeGreaterThan(3);
  });

  it('does not flag normal-rate traffic', () => {
    const ip = '7.7.7.7';
    for (let w = 0; w < 6; w++) {
      feed(det, ip, w * WIN_MS, 100);
    }
    det.closeWindow(ip);
    const r = det.inspect(ev(ip, 6 * WIN_MS));
    expect(r.verdict).toBe('allow');
  });

  it('tracks distinct sources independently', () => {
    for (let w = 0; w < 6; w++) {
      feed(det, 'good', w * WIN_MS, 100);
      feed(det, 'bad', w * WIN_MS, 100);
    }
    det.closeWindow('good');
    det.closeWindow('bad');
    const base = 6 * WIN_MS;
    // bad spikes, good stays normal
    for (let i = 0; i < 2000; i++) {
      det.inspect(ev('bad', base + i));
    }
    const good = det.inspect(ev('good', base));
    expect(good.verdict).toBe('allow');
  });
});
