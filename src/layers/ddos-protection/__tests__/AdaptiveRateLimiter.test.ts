/**
 * Tests for AdaptiveRateLimiter.
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { AdaptiveRateLimiter } from '../strategies/AdaptiveRateLimiter';
import { TrafficEvent } from '../types/traffic';

function ev(ip: string, at: number): TrafficEvent {
  return { srcIp: ip, protocol: 'HTTP', at };
}

describe('AdaptiveRateLimiter', () => {
  let rl: AdaptiveRateLimiter;

  beforeEach(() => {
    rl = new AdaptiveRateLimiter({
      baseRatePerSec: 10,
      minRatePerSec: 1,
      burstCapacity: 5,
      loadThreshold: 100,
      backoffFactor: 0.5,
      globalWindowMs: 1000,
    });
  });

  it('allows within burst capacity', () => {
    for (let i = 0; i < 5; i++) {
      expect(rl.inspect(ev('a', 0)).verdict).toBe('allow');
    }
    expect(rl.inspect(ev('a', 0)).verdict).toBe('rate-limit');
  });

  it('refills tokens over time', () => {
    for (let i = 0; i < 5; i++) {
      rl.inspect(ev('a', 0));
    }
    // After 500ms at 10/s → +5 tokens (capped).
    expect(rl.inspect(ev('a', 500)).verdict).toBe('allow');
  });

  it('per-source buckets are independent', () => {
    for (let i = 0; i < 5; i++) {
      rl.inspect(ev('a', 0));
    }
    expect(rl.inspect(ev('b', 0)).verdict).toBe('allow'); // fresh bucket
  });

  it('adapts rate down under high global load', () => {
    // Saturate the global window: 200 events in the first 200ms → rate
    // measured at t=1000 covers the last 1000ms = all 200 events > 100/s.
    for (let i = 0; i < 200; i++) {
      rl.inspect(ev(`i${i}`, i));
    }
    rl.tick(1000); // one window elapsed, triggers adaptation
    expect(rl.effectiveRate('a')).toBeLessThan(10);
  });

  it('rate recovers when load drops', () => {
    for (let i = 0; i < 200; i++) {
      rl.inspect(ev(`i${i}`, i));
    }
    rl.tick(1000); // adapt down under load
    const low = rl.effectiveRate('a');
    expect(low).toBeLessThan(10);
    // Next window is quiet → additive recovery toward base.
    rl.tick(2000);
    expect(rl.effectiveRate('a')).toBeGreaterThan(low);
  });

  it('respects minRatePerSec floor', () => {
    // Sustained high load pushes the rate toward the floor but never below.
    for (let i = 0; i < 200; i++) {
      rl.inspect(ev(`x${i}`, i));
    }
    rl.tick(1000);
    // Keep the global window full of fresh high-rate events at each tick.
    for (let round = 0; round < 8; round++) {
      const base = 2000 + round * 1000;
      for (let i = 0; i < 200; i++) {
        rl.inspect(ev(`r${round}-${i}`, base + i));
      }
      rl.tick(base + 500);
    }
    expect(rl.effectiveRate('a')).toBeGreaterThanOrEqual(1);
    expect(rl.effectiveRate('a')).toBeLessThanOrEqual(10);
  });
});
