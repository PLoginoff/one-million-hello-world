/**
 * ML feature-store engine2 tests — drift, lineage, consistency, cache.
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { ManualClock } from '../../../observability/engine';
import {
  ConsistencyChecker,
  DriftDetector,
  FeatureCache,
  FeatureLineageGraph,
  featureEquals,
  ks,
  psi,
} from '../../engine2';

// ------------------------------------------------------------------ drift

describe('DriftDetector', () => {
  it('psi ≈ 0 for identical distributions', () => {
    const ref = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    expect(psi(ref, ref)).toBeCloseTo(0, 9);
  });

  it('psi grows as distributions separate', () => {
    const ref = Array.from({ length: 1000 }, (_, i) => i % 10);
    const similar = Array.from({ length: 1000 }, (_, i) => (i % 10) + 0.01);
    const shifted = Array.from({ length: 1000 }, (_, i) => (i % 10) + 5);
    expect(psi(ref, similar)).toBeLessThan(psi(ref, shifted));
  });

  it('ks = 0 for identical, →1 for disjoint supports', () => {
    const a = [1, 2, 3, 4, 5];
    expect(ks(a, a)).toBe(0);
    const far = [100, 200, 300];
    expect(ks(a, far)).toBe(1);
  });

  it('evaluate flags drift over the threshold', () => {
    const d = new DriftDetector({ psiThreshold: 0.1 });
    d.setReference('age', Array.from({ length: 100 }, (_, i) => 20 + (i % 40)));
    const result = d.evaluate({
      feature: 'age',
      reference: [],
      current: Array.from({ length: 100 }, (_, i) => 50 + (i % 40)),
    });
    expect(result.drifted).toBe(true);
    expect(result.statistic).toBeGreaterThan(0.1);
  });

  it('evaluate uses stored reference when window.reference is empty', () => {
    const d = new DriftDetector({ psiThreshold: 0.25 });
    const ref = Array.from({ length: 200 }, (_, i) => i % 5);
    d.setReference('clicks', ref);
    const stable = d.evaluate({ feature: 'clicks', reference: [], current: ref });
    expect(stable.drifted).toBe(false);
  });

  it('driftedFeatures returns only the shifted features', () => {
    const d = new DriftDetector({ psiThreshold: 0.05 });
    const same = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const diff = [50, 60, 70, 80, 90, 100, 110, 120, 130, 140];
    const out = d.driftedFeatures([
      { feature: 'stable', reference: same, current: same },
      { feature: 'shifted', reference: same, current: diff },
    ]);
    expect(out.map((r) => r.feature)).toEqual(['shifted']);
  });
});

// ---------------------------------------------------------------- lineage

describe('FeatureLineageGraph', () => {
  let g: FeatureLineageGraph;
  beforeEach(() => {
    g = new FeatureLineageGraph();
    g.recordRun({
      pipelineId: 'etl-users',
      runId: 'run-1',
      startedMs: 0,
      inputs: ['users_table'],
      producedFeatures: ['age', 'country'],
      status: 'succeeded',
    });
    g.recordRun({
      pipelineId: 'etl-agg',
      runId: 'run-2',
      startedMs: 1,
      inputs: ['age', 'clicks_table'],
      producedFeatures: ['age_bucket', 'ctr_7d'],
      status: 'succeeded',
    });
  });

  it('producedBy lists runs newest-first', () => {
    g.recordRun({
      pipelineId: 'etl-users',
      runId: 'run-3',
      startedMs: 2,
      inputs: ['users_table'],
      producedFeatures: ['age'],
      status: 'succeeded',
    });
    const f = g.feature('age');
    expect(f.producedBy.map((r) => r.runId)).toEqual(['run-3', 'run-1']);
    expect(g.lastProducer('age')?.runId).toBe('run-3');
  });

  it('consumers link features to models', () => {
    g.recordConsumer('churn-v3', 'age');
    g.recordConsumer('churn-v3', 'ctr_7d');
    g.recordConsumer('ltv-v1', 'age');
    expect(g.impactedModels('age').sort()).toEqual(['churn-v3', 'ltv-v1']);
    expect(g.feature('ctr_7d').consumers).toEqual(['churn-v3']);
  });

  it('downstreamOf answers the blast-radius question', () => {
    g.recordConsumer('m1', 'age_bucket');
    g.recordConsumer('m2', 'ctr_7d');
    const d = g.downstreamOf('etl-agg');
    expect(d.features.sort()).toEqual(['age_bucket', 'ctr_7d']);
    expect(d.models).toEqual(['m1', 'm2']);
  });

  it('upstreamOf walks feature-as-input edges transitively', () => {
    const up = g.upstreamOf('age_bucket');
    // age_bucket <- run-2 reads [age, clicks_table]; age <- run-1 reads [users_table]
    expect(up).toEqual(['age', 'clicks_table', 'users_table']);
  });

  it('upstreamOf guards cycles', () => {
    g.recordRun({
      pipelineId: 'p',
      runId: 'r-cyc',
      startedMs: 3,
      inputs: ['age_bucket'],
      producedFeatures: ['age'],
      status: 'succeeded',
    });
    // age → age_bucket → age … must terminate.
    const up = g.upstreamOf('age');
    expect(up).toContain('age_bucket');
    expect(up).toContain('users_table');
  });
});

// ----------------------------------------------------------- consistency

describe('ConsistencyChecker', () => {
  const checker = new ConsistencyChecker();

  it('featureEquals handles scalars, vectors, nulls, undefined', () => {
    expect(featureEquals(5, 5)).toBe(true);
    expect(featureEquals([1, 2], [1, 2])).toBe(true);
    expect(featureEquals([1, 2], [1, 3])).toBe(false);
    expect(featureEquals(null, null)).toBe(true);
    expect(featureEquals(null, undefined)).toBe(false);
    expect(featureEquals(undefined, undefined)).toBe(true);
    expect(featureEquals('a', 'a')).toBe(true);
  });

  it('agreement = matched / checked', () => {
    const online: Record<string, number> = { e1: 1, e2: 2, e3: 3 };
    const offline: Record<string, number> = { e1: 1, e2: 2, e3: 9 };
    const r = checker.check(
      'score',
      ['e1', 'e2', 'e3'],
      (e) => online[e],
      (e) => offline[e],
      0,
    );
    expect(r.checked).toBe(3);
    expect(r.matched).toBe(2);
    expect(r.agreement).toBeCloseTo(2 / 3, 9);
  });

  it('missing offline against online is a mismatch', () => {
    const r = checker.check(
      'f',
      ['e1'],
      () => 5,
      () => undefined,
      0,
    );
    expect(r.mismatched).toBe(1);
    expect(r.agreement).toBe(0);
  });

  it('checkAll produces one report per feature', () => {
    const reports = checker.checkAll(
      ['a', 'b'],
      ['e1'],
      () => 1,
      () => 1,
      0,
    );
    expect(reports.length).toBe(2);
    expect(reports.every((r) => r.agreement === 1)).toBe(true);
  });
});

// ------------------------------------------------------------------ cache

describe('FeatureCache', () => {
  let clock: ManualClock;
  let cache: FeatureCache;

  beforeEach(() => {
    clock = new ManualClock(0);
    cache = new FeatureCache({ defaultTtlMs: 1_000, maxEntries: 3 }, clock);
  });

  it('serves hits without calling the loader', () => {
    let loads = 0;
    const loader = (): number => {
      loads += 1;
      return 42;
    };
    expect(cache.get('f', 'e', loader)).toBe(42);
    expect(cache.get('f', 'e', loader)).toBe(42);
    expect(loads).toBe(1);
    expect(cache.stats().hitRate).toBeCloseTo(0.5, 9);
  });

  it('honours per-feature TTL overrides', () => {
    cache.setFeatureTtl('realtime', 100);
    cache.setFeatureTtl('daily', 10_000);
    cache.put('realtime', 'e', 1);
    cache.put('daily', 'e', 2);
    clock.set(500);
    expect(cache.get('realtime', 'e', () => 99)).toBe(99); // expired → reload
    expect(cache.get('daily', 'e', () => 99)).toBe(2);     // still fresh
  });

  it('evicts the least-recently-used entry beyond maxEntries', () => {
    cache.put('f', 'e1', 1);
    cache.put('f', 'e2', 2);
    cache.put('f', 'e3', 3);
    // Touch e1 so it isn't the LRU.
    cache.get('f', 'e1', () => 1);
    cache.put('f', 'e4', 4); // evicts e2
    expect(cache.get('f', 'e2', () => undefined)).toBeUndefined();
    expect(cache.get('f', 'e1', () => undefined)).toBe(1);
    expect(cache.stats().evictions).toBe(1);
  });

  it('invalidateFeature drops all entries for that feature', () => {
    cache.put('f', 'a', 1);
    cache.put('f', 'b', 2);
    cache.put('g', 'a', 9);
    expect(cache.invalidateFeature('f')).toBe(2);
    expect(cache.get('f', 'a', () => 7)).toBe(7);
    expect(cache.get('g', 'a', () => 0)).toBe(9);
  });

  it('expired entries reload rather than serve stale', () => {
    cache.put('f', 'e', 1);
    clock.set(2_000);
    expect(cache.get('f', 'e', () => 5)).toBe(5);
    expect(cache.stats().misses).toBe(1);
  });

  it('sweep removes expired entries', () => {
    cache.put('f', 'a', 1);
    cache.put('f', 'b', 2);
    clock.set(2_000);
    expect(cache.sweep()).toBe(2);
    expect(cache.stats().entries).toBe(0);
  });
});
