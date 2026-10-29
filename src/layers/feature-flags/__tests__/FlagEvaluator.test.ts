/**
 * Tests for the feature-flag engine: bucketing, targeting, segments,
 * dependencies, contexts, kill switches, analytics, progressive rollout.
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import {
  bucketFor,
  murmur3,
  variantForBucket,
  evalClause,
  compareSemver,
  flattenContext,
  EvalContext,
  FeatureFlag,
} from '../domain/flag-model';
import {
  FlagEvaluator,
  InMemoryFlagStore,
  CountingAnalytics,
  boolFlag,
} from '../implementations/FlagEvaluator';
import { ProgressiveRolloutStrategy, SegmentTargetingStrategy, currentPercentage } from '../strategies/ProgressiveRolloutStrategy';

const user = (key: string, attrs: Record<string, unknown> = {}): EvalContext => ({
  kind: 'user',
  key,
  attributes: attrs,
});

describe('Bucketing', () => {
  it('murmur3 is deterministic and well distributed', () => {
    expect(murmur3('hello')).toBe(murmur3('hello'));
    expect(murmur3('hello')).not.toBe(murmur3('hello!'));
    // Chi-square sanity on 1000 keys across 10 deciles — loose bound to
    // avoid flakiness; distribution should be roughly flat.
    const counts = new Array(10).fill(0);
    for (let i = 0; i < 1000; i++) {
      counts[Math.floor(murmur3(`user-${i}`) / (2 ** 32 / 10))]++;
    }
    const expected = 100;
    const chi2 = counts.reduce((s, c) => s + (c - expected) ** 2 / expected, 0);
    expect(chi2).toBeLessThan(30); // df=9, p<0.001 is ~27.9
  });

  it('bucketFor is sticky — same inputs, same bucket', () => {
    expect(bucketFor('f1', 'user', 'u-123')).toBe(bucketFor('f1', 'user', 'u-123'));
    expect(bucketFor('f1', 'user', 'u-123')).not.toBe(bucketFor('f2', 'user', 'u-123'));
    // salt decorrelates
    expect(bucketFor('f1', 'user', 'u-1', 'a')).not.toBe(bucketFor('f1', 'user', 'u-1', 'b'));
  });

  it('variantForBucket splits by weight deterministically', () => {
    const rollout = { weights: [{ variant: 'a', weight: 50 }, { variant: 'b', weight: 50 }] };
    const aBuckets = new Set<number>();
    for (let b = 0; b < 100; b++) {
      const v = variantForBucket(rollout, b);
      expect(v === 'a' || v === 'b').toBe(true);
      if (v === 'a') {
        aBuckets.add(b);
      }
    }
    expect(aBuckets.size).toBe(50); // buckets 0-49 → a
    expect(variantForBucket(rollout, 0)).toBe('a');
    expect(variantForBucket(rollout, 99)).toBe('b');
  });
});

describe('Clauses + semver', () => {
  const attrs = { country: 'FR', age: 30, email: 'a@corp.io', plan: 'pro', version: '2.1.0' };

  it('basic operators', () => {
    expect(evalClause({ attribute: 'country', op: 'eq', value: 'FR' }, attrs)).toBe(true);
    expect(evalClause({ attribute: 'country', op: 'in', value: ['FR', 'DE'] }, attrs)).toBe(true);
    expect(evalClause({ attribute: 'country', op: 'notIn', value: ['US'] }, attrs)).toBe(true);
    expect(evalClause({ attribute: 'age', op: 'gte', value: 18 }, attrs)).toBe(true);
    expect(evalClause({ attribute: 'email', op: 'endsWith', value: 'corp.io' }, attrs)).toBe(true);
    expect(evalClause({ attribute: 'missing', op: 'exists' }, attrs)).toBe(false);
    expect(evalClause({ attribute: 'missing', op: 'neq', value: 'x' }, attrs)).toBe(true);
  });

  it('semver comparisons', () => {
    expect(compareSemver('2.1.0', '2.0.9')).toBeGreaterThan(0);
    expect(compareSemver('1.10.0', '1.9.9')).toBeGreaterThan(0);
    expect(compareSemver('1.0.0', '1.0.0')).toBe(0);
    expect(compareSemver('1.0.0-alpha', '1.0.0')).toBeLessThan(0);
    expect(evalClause({ attribute: 'version', op: 'semverGte', value: '2.0.0' }, attrs)).toBe(true);
    expect(evalClause({ attribute: 'version', op: 'semverLt', value: '3.0.0' }, attrs)).toBe(true);
    expect(evalClause({ attribute: 'version', op: 'semverGt', value: '2.1.0' }, attrs)).toBe(false);
  });
});

describe('FlagEvaluator', () => {
  let store: InMemoryFlagStore;
  let analytics: CountingAnalytics;
  let evaluator: FlagEvaluator;

  beforeEach(() => {
    store = new InMemoryFlagStore();
    analytics = new CountingAnalytics();
    evaluator = new FlagEvaluator(store, { analytics });
  });

  it('boolean flag returns on/off with reasons', () => {
    store.putFlag(boolFlag('new-ui', { defaultVariant: 'on' }));
    expect(evaluator.boolValue('new-ui', user('u1'))).toBe(true);
    const e = evaluator.evaluate('new-ui', user('u1'));
    expect(e.reason).toBe('fallthrough');
    expect(e.variant).toBe('on');
    expect(e.value).toBe(true);
  });

  it('disabled and killed flags short-circuit', () => {
    store.putFlag(boolFlag('f1', { enabled: false }));
    store.putFlag(boolFlag('f2', { killed: true, defaultVariant: 'on' }));
    expect(evaluator.evaluate('f1', user('u')).reason).toBe('disabled');
    expect(evaluator.evaluate('f2', user('u')).reason).toBe('killed');
    expect(evaluator.boolValue('f2', user('u'))).toBe(false);
  });

  it('targeting rules match on attributes, first match wins', () => {
    store.putFlag(
      boolFlag('beta', {
        rules: [
          { clauses: [{ attribute: 'country', op: 'eq', value: 'FR' }], variant: 'on' },
          { clauses: [{ attribute: 'plan', op: 'eq', value: 'pro' }], variant: 'on' },
        ],
      })
    );
    expect(evaluator.boolValue('beta', user('u', { country: 'FR' }))).toBe(true);
    expect(evaluator.boolValue('beta', user('u', { plan: 'pro' }))).toBe(true);
    expect(evaluator.boolValue('beta', user('u', { country: 'US', plan: 'free' }))).toBe(false);
    const e = evaluator.evaluate('beta', user('u', { plan: 'pro' }));
    expect(e.ruleId).toBe(1);
    expect(e.reason).toBe('rule-match');
  });

  it('segments resolve via the store', () => {
    store.putSegment({
      id: 'internal',
      clauses: [{ attribute: 'email', op: 'endsWith', value: '@corp.io' }],
    });
    store.putFlag(boolFlag('staff-tools', { rules: [{ segments: ['internal'], variant: 'on' }] }));
    expect(evaluator.boolValue('staff-tools', user('u', { email: 'x@corp.io' }))).toBe(true);
    expect(evaluator.boolValue('staff-tools', user('u', { email: 'x@ext.io' }))).toBe(false);
    const e = evaluator.evaluate('staff-tools', user('u', { email: 'x@corp.io' }));
    expect(e.reason).toBe('segment-match');
  });

  it('percentage rollout is sticky and monotonic', () => {
    const flag: FeatureFlag = boolFlag('gradual', {
      rules: [
        {
          rollout: {
            weights: [
              { variant: 'on', weight: 25 },
              { variant: 'off', weight: 75 },
            ],
            salt: 'r1',
          },
        },
      ],
    });
    store.putFlag(flag);
    // Deterministic per user across evaluations.
    const results = new Map<string, boolean>();
    let onCount = 0;
    for (let i = 0; i < 400; i++) {
      const ctx = user(`u-${i}`);
      const v = evaluator.boolValue('gradual', ctx);
      results.set(`u-${i}`, v);
      if (v) {
        onCount++;
      }
      // Re-eval → identical (sticky).
      expect(evaluator.boolValue('gradual', ctx)).toBe(v);
    }
    // Roughly 25% ± a few percent.
    expect(onCount).toBeGreaterThan(60);
    expect(onCount).toBeLessThan(140);
  });

  it('dependency flags gate evaluation; cycles fail closed', () => {
    store.putFlag(boolFlag('base', { defaultVariant: 'on' }));
    store.putFlag(boolFlag('dependent', { requires: [{ flag: 'base' }], defaultVariant: 'on' }));
    expect(evaluator.boolValue('dependent', user('u'))).toBe(true);

    store.putFlag(boolFlag('base', { enabled: false }));
    const e = evaluator.evaluate('dependent', user('u'));
    expect(e.reason).toBe('dependency-unmet');
    expect(e.variant).toBe('off');

    // Cycle: a requires b, b requires a.
    store.putFlag(boolFlag('a', { requires: [{ flag: 'b' }], defaultVariant: 'on' }));
    store.putFlag(boolFlag('b', { requires: [{ flag: 'a' }], defaultVariant: 'on' }));
    expect(evaluator.evaluate('a', user('u')).reason).toBe('dependency-unmet');
  });

  it('context inheritance merges attributes child-over-parent', () => {
    const org: EvalContext = { kind: 'org', key: 'acme', attributes: { plan: 'enterprise', region: 'eu' } };
    const u: EvalContext = { kind: 'user', key: 'u1', attributes: { role: 'admin' }, parent: org };
    const flat = flattenContext(u);
    expect(flat.attributes).toEqual({ plan: 'enterprise', region: 'eu', role: 'admin' });

    store.putFlag(
      boolFlag('ent-only', {
        rules: [{ clauses: [{ attribute: 'plan', op: 'eq', value: 'enterprise' }], variant: 'on' }],
      })
    );
    expect(evaluator.boolValue('ent-only', u)).toBe(true);
    expect(evaluator.boolValue('ent-only', user('x', { plan: 'free' }))).toBe(false);
  });

  it('json payload flags return arbitrary values', () => {
    store.putFlag({
      key: 'checkout-config',
      type: 'json',
      enabled: true,
      variants: [
        { id: 'v1', value: { steps: 3, upsell: true } },
        { id: 'v2', value: { steps: 1, upsell: false } },
      ],
      defaultVariant: 'v2',
      offVariant: 'v2',
    });
    const v = evaluator.value<{ steps: number }>('checkout-config', user('u'));
    expect(v.steps).toBe(1);
  });

  it('analytics counts evaluations by flag, variant and reason', () => {
    store.putFlag(boolFlag('tracked', { defaultVariant: 'on' }));
    evaluator.evaluate('tracked', user('u'));
    evaluator.evaluate('tracked', user('u'));
    evaluator.evaluate('missing', user('u'));
    expect(analytics.forFlag('tracked')).toBe(2);
    expect(analytics.forVariant('tracked', 'on')).toBe(2);
    expect(analytics.forReason('missing', 'error')).toBe(1);
    expect(analytics.total()).toBe(3);
  });

  it('unknown flag evaluates to error/off', () => {
    const e = evaluator.evaluate('ghost', user('u'));
    expect(e.reason).toBe('error');
    expect(e.variant).toBe('off');
  });
});

describe('ProgressiveRolloutStrategy', () => {
  it('ramps percentage through stages — hold mode', () => {
    expect(currentPercentage({ stages: [{ atMs: 100, percentage: 10 }, { atMs: 200, percentage: 50 }] }, 50)).toBe(0);
    expect(currentPercentage({ stages: [{ atMs: 100, percentage: 10 }, { atMs: 200, percentage: 50 }] }, 150)).toBe(10);
    expect(currentPercentage({ stages: [{ atMs: 100, percentage: 10 }, { atMs: 200, percentage: 50 }] }, 500)).toBe(50);
  });

  it('linear mode interpolates between stages', () => {
    const s = { stages: [{ atMs: 0, percentage: 0 }, { atMs: 100, percentage: 100 }], mode: 'linear' as const };
    expect(currentPercentage(s, 50)).toBeCloseTo(50, 0);
    expect(currentPercentage(s, 25)).toBeCloseTo(25, 0);
  });

  it('increasing percentage never ejects already-included users', () => {
    const store = new InMemoryFlagStore();
    let now = 0;
    const ev = new FlagEvaluator(store);
    const strat = new ProgressiveRolloutStrategy(ev, store, { clock: () => now });
    store.putFlag(boolFlag('ramp'));
    const schedule = { stages: [{ atMs: 0, percentage: 10 }, { atMs: 1000, percentage: 80 }] };

    const included10 = new Set<string>();
    for (let i = 0; i < 300; i++) {
      const r = strat.evaluate('ramp', schedule, user(`u-${i}`));
      if (r.variant === 'on') {
        included10.add(`u-${i}`);
      }
    }
    now = 2000; // past stage 2 → 80%
    for (const u of included10) {
      expect(strat.evaluate('ramp', schedule, user(u)).variant).toBe('on');
    }
  });
});

describe('SegmentTargetingStrategy', () => {
  it('precomputes matching segments for a context', () => {
    const store = new InMemoryFlagStore();
    store.putSegment({ id: 'eu', clauses: [{ attribute: 'region', op: 'eq', value: 'eu' }] });
    store.putSegment({ id: 'pro', clauses: [{ attribute: 'plan', op: 'eq', value: 'pro' }] });
    const ev = new FlagEvaluator(store);
    const strat = new SegmentTargetingStrategy(ev, store);
    const segs = strat.matchingSegments(user('u', { region: 'eu' }));
    expect([...segs]).toEqual(['eu']);
  });

  it('evaluateAll returns a decision per flag', () => {
    const store = new InMemoryFlagStore();
    store.putFlag(boolFlag('a'));
    store.putFlag(boolFlag('b', { defaultVariant: 'on' }));
    const strat = new SegmentTargetingStrategy(new FlagEvaluator(store), store);
    const all = strat.evaluateAll(user('u'));
    expect(all.size).toBe(2);
    expect(all.get('b')?.variant).toBe('on');
  });
});
