/**
 * Tests for FlowController: adaptive concurrency limiting, FIFO
 * queueing with shedding, and the retry token budget.
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { FlowController, FlowShedError } from '../FlowController';
import { ManualGatewayClock3 } from '../types3';

describe('FlowController — admission', () => {
  let clock: ManualGatewayClock3;
  let fc: FlowController;

  beforeEach(() => {
    clock = new ManualGatewayClock3(0);
    fc = new FlowController({ clock, initialLimit: 2 });
  });

  it('grants up to the limit then sheds tryAcquire', () => {
    const a = fc.tryAcquire();
    const b = fc.tryAcquire();
    expect(a.granted).toBe(true);
    expect(b.granted).toBe(true);
    const c = fc.tryAcquire();
    expect(c.granted).toBe(false);
    if (!c.granted) expect(c.reason).toBe('over-limit');
    expect(fc.stats().shed).toBe(1);
  });

  it('release frees the slot for the next acquire', () => {
    const a = fc.tryAcquire();
    fc.tryAcquire();
    expect(fc.stats().inflight).toBe(2);
    if (a.granted) a.permit.release(10, true);
    expect(fc.stats().inflight).toBe(1);
    expect(fc.tryAcquire().granted).toBe(true);
  });

  it('double release is a no-op', () => {
    const a = fc.tryAcquire();
    if (a.granted) {
      a.permit.release(10, true);
      a.permit.release(10, true);
    }
    expect(fc.stats().inflight).toBe(0);
  });

  it('queued acquires resolve FIFO when slots free', async () => {
    const p1 = fc.tryAcquire();
    const p2 = fc.tryAcquire();
    const order: string[] = [];
    const w1 = fc.acquire().then(() => order.push('w1'));
    const w2 = fc.acquire().then(() => order.push('w2'));
    expect(fc.stats().queued).toBe(2);
    if (p1.granted) p1.permit.release(5, true);
    await w1;
    if (p2.granted) p2.permit.release(5, true);
    await w2;
    expect(order).toEqual(['w1', 'w2']);
  });

  it('queue overflow throws FlowShedError', async () => {
    const tight = new FlowController({ clock, initialLimit: 1, maxQueue: 1 });
    const p = tight.tryAcquire();
    const hanging = tight.acquire(); // queues
    await expect(tight.acquire()).rejects.toThrow(FlowShedError);
    expect(tight.stats().shed).toBe(1);
    if (p.granted) p.permit.release(1, true);
    await hanging;
  });
});

describe('FlowController — adaptive limit', () => {
  it('grows the limit additively on healthy latencies', () => {
    const fc = new FlowController({ initialLimit: 5, maxLimit: 10 });
    for (let i = 0; i < 3; i++) {
      const a = fc.tryAcquire();
      if (a.granted) a.permit.release(10, true);
    }
    expect(fc.currentLimit).toBe(8);
  });

  it('shrinks multiplicatively when latency exceeds the floor', () => {
    const fc = new FlowController({ initialLimit: 100, minLimit: 5 });
    // Establish the min-RTT floor.
    const a = fc.tryAcquire();
    if (a.granted) a.permit.release(10, true);
    expect(fc.currentLimit).toBe(101);
    // Now latency balloons to 100ms. The EWMA floor also drifts up
    // (0.1·100 + 0.9·10 = 19) → gradient = 19/100 → 101·0.19 ≈ 19.
    const b = fc.tryAcquire();
    if (b.granted) b.permit.release(100, true);
    expect(fc.currentLimit).toBeLessThanOrEqual(20);
    expect(fc.currentLimit).toBeGreaterThanOrEqual(5);
  });

  it('never drops below minLimit', () => {
    const fc = new FlowController({ initialLimit: 2, minLimit: 1 });
    const a = fc.tryAcquire();
    if (a.granted) a.permit.release(1, true);
    const b = fc.tryAcquire();
    if (b.granted) b.permit.release(10_000, true); // catastrophic
    expect(fc.currentLimit).toBe(1);
  });

  it('never exceeds maxLimit', () => {
    const fc = new FlowController({ initialLimit: 9, maxLimit: 10 });
    const a = fc.tryAcquire();
    if (a.granted) a.permit.release(5, true);
    const b = fc.tryAcquire();
    if (b.granted) b.permit.release(5, true);
    expect(fc.currentLimit).toBe(10);
  });

  it('minRtt floor updates via EWMA on higher samples', () => {
    const fc = new FlowController({ minRttAlpha: 0.5 });
    const a = fc.tryAcquire();
    if (a.granted) a.permit.release(10, true);
    const b = fc.tryAcquire();
    if (b.granted) b.permit.release(30, true);
    // floor = 0.5*30 + 0.5*10 = 20
    expect(fc.stats().minRttMs).toBeCloseTo(20, 6);
    const c = fc.tryAcquire();
    if (c.granted) c.permit.release(5, true); // new low snaps down
    expect(fc.stats().minRttMs).toBe(5);
  });
});

describe('FlowController — retry budget', () => {
  it('successes refill tokens at retryRatio', () => {
    const fc = new FlowController({ retryRatio: 0.5, maxRetryTokens: 10 });
    const start = fc.retryBalance;
    const a = fc.tryAcquire();
    if (a.granted) a.permit.release(10, true);
    expect(fc.retryBalance).toBeCloseTo(start + 0.5, 6);
    const b = fc.tryAcquire();
    if (b.granted) b.permit.release(10, true);
    expect(fc.retryBalance).toBeCloseTo(start + 1, 6);
  });

  it('consumeRetry drains the budget and fails at zero', () => {
    const fc = new FlowController({ retryRatio: 0, maxRetryTokens: 1 });
    // ratio 0 → seed = ceil(0*10) = 0 tokens; balance already 0
    expect(fc.consumeRetry()).toBe(false);
    // Earn one: can't — ratio 0 gives nothing. So seed differently:
    const fc2 = new FlowController({ retryRatio: 1, maxRetryTokens: 1 });
    expect(fc2.retryBalance).toBe(1); // capped at max
    expect(fc2.consumeRetry()).toBe(true);
    expect(fc2.consumeRetry()).toBe(false);
  });

  it('failed releases do not refill tokens', () => {
    const fc = new FlowController({ retryRatio: 1, maxRetryTokens: 10 });
    const start = fc.retryBalance;
    const a = fc.tryAcquire();
    if (a.granted) a.permit.release(10, false);
    expect(fc.retryBalance).toBe(start);
  });

  it('stats expose the full picture', async () => {
    const fc = new FlowController({ initialLimit: 1 });
    const a = fc.tryAcquire();
    const queued = fc.acquire(); // queues (limit 1 reached)
    const s = fc.stats();
    expect(s.limit).toBe(1);
    expect(s.inflight).toBe(1);
    expect(s.queued).toBe(1);
    expect(s.granted).toBe(1);
    if (a.granted) a.permit.release(5, true);
    await queued;
    expect(fc.stats().queued).toBe(0);
  });

  it('rejects invalid option bounds', () => {
    expect(() => new FlowController({ minLimit: 0 })).toThrow();
    expect(() => new FlowController({ minLimit: 10, maxLimit: 5 })).toThrow();
    expect(() => new FlowController({ retryRatio: -1 })).toThrow();
  });
});
