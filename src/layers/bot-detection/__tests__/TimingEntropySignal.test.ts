/**
 * Tests for TimingEntropySignal.
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { TimingEntropySignal, stats } from '../strategies/TimingEntropySignal';
import { BotSignalInput } from '../types/request';

function ev(ip: string, at: number): BotSignalInput {
  return { clientIp: ip, headers: {}, at };
}

describe('stats', () => {
  it('computes mean/stddev/cv', () => {
    const s = stats([2, 4, 4, 4, 5, 5, 7, 9]);
    expect(s.mean).toBe(5);
    expect(s.stddev).toBeCloseTo(2, 5);
    expect(s.cv).toBeCloseTo(0.4, 5);
  });
  it('cv=0 for constant input', () => {
    expect(stats([5, 5, 5, 5]).cv).toBe(0);
  });
});

describe('TimingEntropySignal', () => {
  let sig: TimingEntropySignal;

  beforeEach(() => {
    sig = new TimingEntropySignal({ minSamples: 5, history: 20 });
  });

  it('insufficient samples → clean', () => {
    for (let i = 0; i < 4; i++) {
      const r = sig.evaluate(ev('a', i * 100));
      expect(r.reason).toContain('insufficient-samples');
    }
  });

  it('perfectly regular gaps → bot', () => {
    let last = 0;
    let lastResult;
    for (let i = 0; i < 12; i++) {
      lastResult = sig.evaluate(ev('bot', last));
      last += 100; // exactly 100ms between requests
    }
    expect(lastResult!.score).toBeGreaterThan(0.9);
  });

  it('human-like jittered gaps → clean', () => {
    const jittered = [0, 132, 305, 490, 750, 1020, 1400, 1900, 2300, 2800];
    let lastResult;
    for (const t of jittered) {
      lastResult = sig.evaluate(ev('human', t));
    }
    expect(lastResult!.score).toBeLessThan(0.5);
  });

  it('moderately regular gaps → suspicious', () => {
    // gap ~100ms with ±5ms jitter → cv ~0.05..0.15
    let t = 0;
    let lastResult;
    for (let i = 0; i < 10; i++) {
      lastResult = sig.evaluate(ev('maybe', t));
      t += 100 + (i % 3) * 4;
    }
    expect(lastResult!.score).toBeGreaterThan(0.4);
  });
});
