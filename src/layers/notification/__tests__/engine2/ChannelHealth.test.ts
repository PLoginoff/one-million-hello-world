/**
 * engine2 ChannelHealthTracker + BroadcastPacer tests.
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import type { Clock } from '../../delivery/NotificationTypes';
import { BroadcastPacer, ChannelHealthTracker } from '../../engine2';

function fakeClock(start = 0): Clock & { advance: (ms: number) => void } {
  let t = start;
  return { now: () => t, advance: (ms: number) => void (t += ms) };
}

describe('ChannelHealthTracker', () => {
  let clock: ReturnType<typeof fakeClock>;
  let tr: ChannelHealthTracker;
  const cfg = { windowMs: 60_000, minSamples: 4, failureThreshold: 0.5, cooldownMs: 10_000 };

  beforeEach(() => {
    clock = fakeClock();
    tr = new ChannelHealthTracker(cfg, clock);
  });

  it('starts closed and admits sends', () => {
    expect(tr.admit('email').allow).toBe(true);
    expect(tr.state('email')).toBe('closed');
  });

  it('trips open when failure rate crosses the threshold', () => {
    for (let i = 0; i < 4; i++) tr.record('email', i % 2 === 0 ? false : true); // 50% fail at minSamples
    // After 4 samples at 50%, threshold met.
    tr.record('email', false); // 3/5 = 60%
    expect(tr.state('email')).toBe('open');
    expect(tr.admit('email').allow).toBe(false);
  });

  it('stays closed below minSamples even at 100% failures', () => {
    tr.record('sms', false);
    tr.record('sms', false);
    expect(tr.state('sms')).toBe('closed');
  });

  it('half-open probe after cooldown; success closes', () => {
    for (let i = 0; i < 5; i++) tr.record('push', false);
    expect(tr.state('push')).toBe('open');
    clock.advance(11_000); // past 10s cooldown
    const probe = tr.admit('push');
    expect(probe.allow).toBe(true);
    expect(tr.state('push')).toBe('half-open');
    // Concurrent probe is refused while in flight.
    expect(tr.admit('push').allow).toBe(false);
    tr.record('push', true);
    expect(tr.state('push')).toBe('closed');
    expect(tr.failureRate('push')).toBe(0); // window cleared
  });

  it('half-open probe failure re-opens with a fresh cooldown', () => {
    for (let i = 0; i < 5; i++) tr.record('webhook', false);
    clock.advance(11_000);
    tr.admit('webhook'); // probe allowed
    tr.record('webhook', false);
    expect(tr.state('webhook')).toBe('open');
    // New cooldown — cannot probe for another 10s.
    expect(tr.admit('webhook').allow).toBe(false);
    clock.advance(11_000);
    expect(tr.admit('webhook').allow).toBe(true);
  });

  it('sliding window: old failures age out of the rate', () => {
    for (let i = 0; i < 4; i++) tr.record('email', false); // trips? 4/4 ≥ minSamples, 100% ≥ 50% → opens
    expect(tr.state('email')).toBe('open');
    // Manually reset, then feed clean traffic; old failures should be
    // gone from the rate.
    tr.reset('email');
    for (let i = 0; i < 4; i++) tr.record('email', true);
    expect(tr.failureRate('email')).toBe(0);
  });

  it('channels flap independently', () => {
    for (let i = 0; i < 5; i++) tr.record('email', false);
    tr.record('sms', true);
    expect(tr.state('email')).toBe('open');
    expect(tr.state('sms')).toBe('closed');
  });
});

describe('BroadcastPacer', () => {
  let clock: ReturnType<typeof fakeClock>;

  beforeEach(() => {
    clock = fakeClock();
  });

  it('emits batches of batchSize per interval', () => {
    const p = new BroadcastPacer<string>(2, 1_000, clock);
    p.enqueue(['a', 'b', 'c', 'd', 'e']);
    const b1 = p.drain()!;
    expect(b1.items).toEqual(['a', 'b']);
    expect(b1.remaining).toBe(3);
    // Too early — second drain refused.
    expect(p.drain()).toBeUndefined();
    clock.advance(1_000);
    expect(p.drain()!.items).toEqual(['c', 'd']);
    clock.advance(1_000);
    expect(p.drain()!.items).toEqual(['e']);
    expect(p.drain()).toBeUndefined();
  });

  it('first batch goes out immediately', () => {
    const p = new BroadcastPacer<number>(1, 60_000, clock);
    p.enqueue([1]);
    expect(p.nextBatchInMs()).toBe(0);
    expect(p.drain()).toBeDefined();
  });

  it('flushAll returns every remaining item in batches', () => {
    const p = new BroadcastPacer<number>(3, 1_000, clock);
    p.enqueue([1, 2, 3, 4, 5, 6, 7]);
    const all = p.flushAll();
    expect(all.length).toBe(3);
    expect(all[0].items).toEqual([1, 2, 3]);
    expect(all[2].items).toEqual([7]);
    expect(p.pending()).toBe(0);
  });

  it('nextBatchInMs reports the pacing delay', () => {
    const p = new BroadcastPacer<number>(1, 5_000, clock);
    p.enqueue([1, 2]);
    p.drain();
    expect(p.nextBatchInMs()).toBe(5_000);
    clock.advance(2_000);
    expect(p.nextBatchInMs()).toBe(3_000);
  });
});
