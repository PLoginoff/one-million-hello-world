/**
 * Tests for RequestFrequencySignal.
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { RequestFrequencySignal } from '../strategies/RequestFrequencySignal';
import { BotSignalInput } from '../types/request';

function ev(ip: string, at: number): BotSignalInput {
  return { clientIp: ip, headers: {}, at };
}

describe('RequestFrequencySignal', () => {
  let sig: RequestFrequencySignal;

  beforeEach(() => {
    sig = new RequestFrequencySignal({ windowMs: 10_000, burstThreshold: 5, sustainedThreshold: 20 });
  });

  it('low rate → clean', () => {
    for (let i = 0; i < 10; i++) {
      sig.evaluate(ev('a', i * 5000)); // 1 req per 5s
    }
    const r = sig.evaluate(ev('a', 50_000));
    expect(r.score).toBe(0);
  });

  it('sustained burst → high score', () => {
    let last = 0;
    for (let i = 0; i < 300; i++) {
      last = i * 10; // 100 req/s
      sig.evaluate(ev('b', last));
    }
    const r = sig.evaluate(ev('b', last + 1));
    expect(r.score).toBeGreaterThan(0.9);
  });

  it('burst threshold catches moderate floods', () => {
    for (let i = 0; i < 60; i++) {
      sig.evaluate(ev('c', i * 100)); // 10 req/s — above burst, below sustained
    }
    const r = sig.evaluate(ev('c', 6000));
    expect(r.score).toBeGreaterThan(0.5);
    expect(r.score).toBeLessThan(0.95);
  });

  it('window expires old events', () => {
    for (let i = 0; i < 300; i++) {
      sig.evaluate(ev('d', i * 10));
    }
    sig.tick(100_000); // advance past the window
    const r = sig.evaluate(ev('d', 200_000));
    expect(r.score).toBe(0);
  });
});
