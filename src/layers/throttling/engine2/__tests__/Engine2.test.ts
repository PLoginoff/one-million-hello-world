/**
 * Tests for Throttling engine2 — GeographicThrottle, TierThrottle,
 * BurstCreditThrottle, ThrottleChain, ThrottleAnalytics.
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { GeographicThrottle } from '../GeographicThrottle';
import { TierThrottle } from '../TierThrottle';
import { BurstCreditThrottle } from '../BurstCreditThrottle';
import { ThrottleChain } from '../ThrottleChain';
import { ThrottleAnalytics } from '../ThrottleAnalytics';
import { ManualThrottleClock2, ThrottleRule, ThrottleVerdict } from '../types';

describe('GeographicThrottle', () => {
  let clock: ManualThrottleClock2;
  let geo: GeographicThrottle;

  beforeEach(() => {
    clock = new ManualThrottleClock2(0);
    geo = new GeographicThrottle({
      rules: [
        { match: 'us-*', name: 'us', limit: 2 },
        { match: 'eu-west', name: 'euw', limit: 1 },
      ],
      defaultLimit: 3,
      windowMs: 1000,
      clock,
    });
  });

  it('applies region-specific limits', () => {
    expect(geo.evaluate({ region: 'us-east-1', key: 'k' }).allowed).toBe(true);
    expect(geo.evaluate({ region: 'us-west-2', key: 'k' }).allowed).toBe(true);
    const third = geo.evaluate({ region: 'us-east-1', key: 'k' });
    expect(third.allowed).toBe(false);
    expect(third.decidedBy).toBe('region:us');
  });

  it('tracks regions independently — eu denial does not touch us budget', () => {
    geo.evaluate({ region: 'eu-west', key: 'k' });
    expect(geo.evaluate({ region: 'eu-west', key: 'k' }).allowed).toBe(false);
    // same key, different region → separate budget
    expect(geo.evaluate({ region: 'us-east-1', key: 'k' }).allowed).toBe(true);
  });

  it('falls back to default limit for unmatched/absent regions', () => {
    geo.evaluate({ region: 'ap-south-1', key: 'k' });
    geo.evaluate({ region: 'ap-south-1', key: 'k' });
    geo.evaluate({ region: 'ap-south-1', key: 'k' });
    expect(geo.evaluate({ region: 'ap-south-1', key: 'k' }).allowed).toBe(false);
    geo.evaluate({ key: 'k2' });
    geo.evaluate({ key: 'k2' });
    geo.evaluate({ key: 'k2' });
    expect(geo.evaluate({ key: 'k2' }).allowed).toBe(false);
  });

  it('resets at window boundary', () => {
    geo.evaluate({ region: 'us-east-1', key: 'k' });
    geo.evaluate({ region: 'us-east-1', key: 'k' });
    expect(geo.evaluate({ region: 'us-east-1', key: 'k' }).allowed).toBe(false);
    clock.advance(1000);
    expect(geo.evaluate({ region: 'us-east-1', key: 'k' }).allowed).toBe(true);
  });
});

describe('TierThrottle', () => {
  let clock: ManualThrottleClock2;
  const planDb = new Map<string, string>([
    ['freekey', 'free'],
    ['prokey', 'pro'],
  ]);

  const make = () =>
    new TierThrottle({
      tiers: [
        { name: 'free', limit: 2 },
        { name: 'pro', limit: 5 },
      ],
      defaultTier: 'free',
      windowMs: 1000,
      lookupTier: (k) => planDb.get(k) ?? null,
      clock,
    });

  beforeEach(() => {
    clock = new ManualThrottleClock2(0);
  });

  it('enforces per-tier limits', () => {
    const t = make();
    t.evaluate('freekey');
    t.evaluate('freekey');
    const denied = t.evaluate('freekey');
    expect(denied.allowed).toBe(false);
    expect(denied.decidedBy).toBe('tier:free');
    for (let i = 0; i < 5; i++) expect(t.evaluate('prokey').allowed).toBe(true);
    expect(t.evaluate('prokey').allowed).toBe(false);
  });

  it('unknown keys fail closed to defaultTier', () => {
    const t = make();
    expect(t.tierOf('ghost')).toBe('free');
    t.evaluate('ghost');
    t.evaluate('ghost');
    expect(t.evaluate('ghost').allowed).toBe(false);
  });

  it('caches tier resolution within tierCacheMs', () => {
    let calls = 0;
    const t = new TierThrottle({
      tiers: [{ name: 'free', limit: 10 }],
      defaultTier: 'free',
      windowMs: 1000,
      lookupTier: () => {
        calls++;
        return 'free';
      },
      clock,
    });
    t.evaluate('k');
    t.evaluate('k');
    t.evaluate('k');
    expect(calls).toBe(1);
  });

  it('refresh() forces re-resolution after a plan change', () => {
    const t = make();
    t.evaluate('freekey');
    expect(t.tierOf('freekey')).toBe('free');
    planDb.set('freekey', 'pro');
    t.refresh('freekey');
    expect(t.tierOf('freekey')).toBe('pro');
    // counter already has 1 use this window; pro allows 5 → 4 more pass
    for (let i = 0; i < 4; i++) expect(t.evaluate('freekey').allowed).toBe(true);
    expect(t.evaluate('freekey').allowed).toBe(false);
  });
});

describe('BurstCreditThrottle', () => {
  let clock: ManualThrottleClock2;
  let b: BurstCreditThrottle;

  beforeEach(() => {
    clock = new ManualThrottleClock2(0);
    b = new BurstCreditThrottle({
      baseLimit: 2,
      windowMs: 1000,
      accrualRate: 1,
      maxCredits: 4,
      burstCost: 1,
      clock,
    });
  });

  it('enforces base limit within a window', () => {
    expect(b.evaluate('k').allowed).toBe(true);
    expect(b.evaluate('k').allowed).toBe(true);
    expect(b.evaluate('k').allowed).toBe(false);
  });

  it('banks unused capacity as credits across windows', () => {
    // Window 1: only 1 of 2 base used → 1 banked.
    b.evaluate('k');
    clock.advance(1000);
    // Window 2: settle happens → credits = 1. Use 2 base + check credits.
    expect(b.credits('k')).toBe(1);
    b.evaluate('k');
    b.evaluate('k');
    // Base exhausted → the banked credit covers one burst.
    const burst = b.evaluate('k');
    expect(burst.allowed).toBe(true);
    expect(burst.decidedBy).toBe('credit');
    // Credits empty now.
    expect(b.evaluate('k').allowed).toBe(false);
  });

  it('caps credit balance at maxCredits', () => {
    // Seen once (1 base used), then 5 idle windows: banks 1 + 4*2 = 9, capped at 4.
    b.evaluate('k');
    clock.advance(5000);
    expect(b.credits('k')).toBe(4);
  });

  it('accrualRate<1 keeps only a fraction of slack', () => {
    const half = new BurstCreditThrottle({
      baseLimit: 4,
      windowMs: 1000,
      accrualRate: 0.5,
      clock,
    });
    half.evaluate('k'); // 3 unused → 1.5 banked
    clock.advance(1000);
    expect(half.credits('k')).toBeCloseTo(1.5);
  });

  it('half-life decay shrinks hoarded credits', () => {
    const decaying = new BurstCreditThrottle({
      baseLimit: 2,
      windowMs: 1000,
      maxCredits: 100,
      halfLifeMs: 1000,
      clock,
    });
    decaying.evaluate('k'); // seen at t=0, uses 1 base token
    clock.advance(2000);
    // 2 elapsed windows bank 1 + 2 = 3; decay over 2000ms (2 half-lives) → 0.75
    expect(decaying.credits('k')).toBeCloseTo(0.75);
    clock.advance(1000);
    // +1 window banks 2 → 2.75; decay over another 1000ms → 1.375
    expect(decaying.credits('k')).toBeCloseTo(1.375);
  });
});

describe('ThrottleChain', () => {
  const allow = (name: string): ThrottleRule => ({
    name,
    evaluate: (key): ThrottleVerdict => ({ allowed: true, decidedBy: name }),
  });
  const deny = (name: string): ThrottleRule => ({
    name,
    evaluate: (key): ThrottleVerdict => ({
      allowed: false,
      decidedBy: name,
      reason: `${name} denied`,
    }),
  });

  it('short-circuits on first denial — later rules never run', () => {
    let ranSecond = false;
    const chain = new ThrottleChain();
    chain.add(deny('geo'));
    chain.add({
      name: 'tier',
      evaluate: (key) => {
        ranSecond = true;
        return { allowed: true, decidedBy: 'tier' };
      },
    });
    const v = chain.evaluate('k');
    expect(v.allowed).toBe(false);
    expect(ranSecond).toBe(false);
    expect(v.decidedBy).toContain('geo');
  });

  it('passes when all rules allow, returns tightest margin', () => {
    const chain = new ThrottleChain();
    chain.add({ name: 'a', evaluate: () => ({ allowed: true, decidedBy: 'a', remaining: 9 }) });
    chain.add({ name: 'b', evaluate: () => ({ allowed: true, decidedBy: 'b', remaining: 3 }) });
    const v = chain.evaluate('k');
    expect(v.allowed).toBe(true);
    expect(v.remaining).toBe(3);
  });

  it('records denials for breakdown', () => {
    const chain = new ThrottleChain();
    chain.add(deny('geo'));
    chain.evaluate('k1');
    chain.evaluate('k2');
    const bd = chain.denialBreakdown();
    expect(bd.get('geo')).toBe(2);
    expect(chain.lastDenials).toHaveLength(2);
  });
});

describe('ThrottleAnalytics', () => {
  let clock: ManualThrottleClock2;
  let a: ThrottleAnalytics;
  const ok: ThrottleVerdict = { allowed: true, decidedBy: 'ok' };
  const no: ThrottleVerdict = { allowed: false, decidedBy: 'tier:free', reason: 'x' };

  beforeEach(() => {
    clock = new ManualThrottleClock2(0);
    a = new ThrottleAnalytics({ bucketMs: 1000, bucketsKept: 3, clock });
  });

  it('ranks top consumers by volume', () => {
    a.record({ key: 'heavy', verdict: ok });
    a.record({ key: 'heavy', verdict: ok });
    a.record({ key: 'heavy', verdict: no });
    a.record({ key: 'light', verdict: ok });
    const top = a.topConsumers(1);
    expect(top[0].key).toBe('heavy');
    expect(top[0].total).toBe(3);
    expect(top[0].denied).toBe(1);
  });

  it('breaks down rejection reasons', () => {
    a.record({ key: 'k', verdict: no });
    a.record({ key: 'k', verdict: { allowed: false, decidedBy: 'region:us' } });
    a.record({ key: 'k2', verdict: no });
    const bd = a.rejectionBreakdown();
    expect(bd.find((r) => r.reason === 'tier:free')?.count).toBe(2);
    expect(bd.find((r) => r.reason === 'region:us')?.count).toBe(1);
  });

  it('drops buckets outside the retained window', () => {
    a.record({ key: 'old', verdict: ok });
    clock.advance(4000); // 4 buckets later, kept=3
    a.record({ key: 'new', verdict: ok });
    const top = a.topConsumers(10);
    expect(top.find((t) => t.key === 'old')).toBeUndefined();
    expect(top.find((t) => t.key === 'new')).toBeDefined();
  });

  it('rejectionSeries emits per-bucket timeline', () => {
    a.record({ key: 'k', verdict: no });
    clock.advance(1000);
    a.record({ key: 'k', verdict: { allowed: false, decidedBy: 'region:us' } });
    const series = a.rejectionSeries();
    expect(series).toHaveLength(2);
    expect(series[0].reasons[0].reason).toBe('tier:free');
    expect(series[1].reasons[0].reason).toBe('region:us');
  });
});
