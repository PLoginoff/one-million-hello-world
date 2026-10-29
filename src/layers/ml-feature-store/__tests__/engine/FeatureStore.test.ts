/**
 * Feature store tests — online TTL, offline history, PIT join, transforms,
 * deterministic training sets, freshness monitoring.
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { ManualClock } from '../../../observability/engine/signals';
import {
  FeatureTypeError,
  FreshnessMonitor,
  OfflineStore,
  OnlineStore,
  TransformRegistry,
  Transforms,
  buildTrainingSet,
  pointInTimeJoin,
} from '../../engine';

const userAge = { name: 'age', type: 'int' as const, owner: 'ml', ttlMs: 60_000, defaultValue: 0 };
const userScore = { name: 'score', type: 'float' as const, owner: 'ml', ttlMs: 5_000 };
const userTags = { name: 'tags', type: 'string' as const, owner: 'ml', ttlMs: 0 };

describe('OnlineStore', () => {
  let clock: ManualClock;
  let store: OnlineStore;

  beforeEach(() => {
    clock = new ManualClock(1_000_000);
    store = new OnlineStore(clock);
    store.registerFeature(userAge);
    store.registerFeature(userScore);
    store.registerFeature(userTags);
  });

  it('stores and reads values', () => {
    store.put('user', 'u1', 'age', 33);
    expect(store.get('user', 'u1', 'age')).toBe(33);
  });

  it('returns default on missing key', () => {
    expect(store.get('user', 'ghost', 'age')).toBe(0);
  });

  it('expires values past TTL', () => {
    store.put('user', 'u1', 'score', 0.9);
    expect(store.get('user', 'u1', 'score')).toBe(0.9);
    clock.advance(6_000); // ttl=5000
    expect(store.get('user', 'u1', 'score')).toBeUndefined();
    expect(store.getStats().staleHits).toBe(1);
  });

  it('per-put TTL overrides the registered default', () => {
    // Registered TTL is 60s; override to 120s keeps it fresh past that.
    store.put('user', 'u1', 'age', 30, 120_000);
    clock.advance(61_000);
    expect(store.get('user', 'u1', 'age')).toBe(30);
  });

  it('validates types on write', () => {
    expect(() => store.put('user', 'u1', 'age', 'thirty')).toThrow(FeatureTypeError);
    expect(() => store.put('user', 'u1', 'tags', 42)).toThrow(FeatureTypeError);
  });

  it('batch getFeatures returns a vector', () => {
    store.put('user', 'u1', 'age', 40);
    store.put('user', 'u1', 'score', 0.5);
    const v = store.getFeatures('user', 'u1', ['age', 'score', 'tags']);
    expect(v).toEqual({ age: 40, score: 0.5, tags: undefined });
  });

  it('evictExpired removes stale entries', () => {
    store.put('user', 'u1', 'score', 0.1);
    store.put('user', 'u1', 'age', 40);
    clock.advance(6_000);
    expect(store.evictExpired()).toBe(1);
    expect(store.size()).toBe(1);
  });
});

describe('OfflineStore', () => {
  let store: OfflineStore;

  beforeEach(() => {
    store = new OfflineStore();
    store.registerFeature(userAge);
    store.registerFeature(userScore);
  });

  it('keeps a sorted history per entity', () => {
    store.append('u1', 300, { age: 31 });
    store.append('u1', 100, { age: 30 });
    store.append('u1', 200, { age: 30 });
    expect(store.history('u1').map((r) => r.timestampMs)).toEqual([100, 200, 300]);
  });

  it('asOf returns latest value per feature at or before T', () => {
    store.append('u1', 100, { age: 30, score: 0.1 });
    store.append('u1', 200, { score: 0.9 });
    store.append('u1', 300, { age: 31 });
    const at250 = store.asOf('u1', 250)!;
    expect(at250['age']).toBe(30); // not 31 — that's in the future
    expect(at250['score']).toBe(0.9);
    const at350 = store.asOf('u1', 350)!;
    expect(at350['age']).toBe(31);
  });

  it('asOf returns undefined for unknown entities', () => {
    expect(store.asOf('nobody', 100)).toBeUndefined();
  });
});

describe('pointInTimeJoin — no leakage', () => {
  it('joins labels to historical, not future, feature values', () => {
    const store = new OfflineStore();
    // Feature changes at t=100 (fraud) — a label at t=50 must NOT see it.
    store.append('u1', 50, { spend: 10 });
    store.append('u1', 100, { spend: 999 });
    const rows = pointInTimeJoin(store, [
      { entityId: 'u1', timestampMs: 50, label: 0 },
      { entityId: 'u1', timestampMs: 150, label: 1 },
    ]);
    expect(rows[0].features['spend']).toBe(10);
    expect(rows[1].features['spend']).toBe(999);
  });

  it('returns undefined features when no history predates the label', () => {
    const store = new OfflineStore();
    store.append('u1', 100, { x: 1 });
    const rows = pointInTimeJoin(store, [{ entityId: 'u1', timestampMs: 50, label: 0 }]);
    expect(rows[0].features['x']).toBeUndefined();
  });

  it('limits join to requested feature names', () => {
    const store = new OfflineStore();
    store.append('u1', 100, { a: 1, b: 2, c: 3 });
    const rows = pointInTimeJoin(store, [{ entityId: 'u1', timestampMs: 200, label: 1 }], ['a', 'c']);
    expect(Object.keys(rows[0].features).sort()).toEqual(['a', 'c']);
  });
});

describe('TransformRegistry', () => {
  it('applies transforms in dependency order', () => {
    const reg = new TransformRegistry();
    reg.register(Transforms.ratio('clicks', 'impressions', 'ctr'));
    reg.register(Transforms.log1p('ctr', 'log_ctr'));
    const out = reg.applyAll({ clicks: 50, impressions: 200 });
    expect(out['ctr']).toBeCloseTo(0.25);
    expect(out['log_ctr']).toBeCloseTo(Math.log1p(0.25));
  });

  it('detects dependency cycles', () => {
    const reg = new TransformRegistry();
    reg.register({ name: 'a', inputs: ['b'], output: 'a', apply: () => 1 });
    reg.register({ name: 'b', inputs: ['a'], output: 'b', apply: () => 1 });
    expect(() => reg.applyAll({})).toThrow(/cycle/);
  });

  it('bucketize assigns the right bucket', () => {
    const t = Transforms.bucketize('age', 'age_bucket', [18, 30, 65]);
    expect(t.apply({ age: 10 })).toBe(0);
    expect(t.apply({ age: 25 })).toBe(1);
    expect(t.apply({ age: 70 })).toBe(3);
  });
});

describe('buildTrainingSet', () => {
  it('produces deterministic ordering', () => {
    const rows = [
      { entityId: 'b', timestampMs: 200, label: 1, features: { f: 2 } },
      { entityId: 'a', timestampMs: 300, label: 0, features: { f: 3 } },
      { entityId: 'a', timestampMs: 100, label: 1, features: { f: 1 } },
    ];
    const set1 = buildTrainingSet(rows, ['f']);
    const set2 = buildTrainingSet([...rows].reverse(), ['f']);
    expect(set1.rows).toEqual(set2.rows);
    expect(set1.rows).toEqual([[1], [3], [2]]);
  });
});

describe('FreshnessMonitor', () => {
  it('flags stale features past maxAge', () => {
    const clock = new ManualClock(0);
    const store = new OnlineStore(clock);
    store.registerFeature(userScore);
    store.put('user', 'u1', 'score', 0.7);
    const monitor = new FreshnessMonitor(store, clock);
    monitor.watch('user', 'u1', 'score', 5_000);
    expect(monitor.report()[0].stale).toBe(false);
    clock.advance(6_000);
    const rep = monitor.report()[0];
    expect(rep.stale).toBe(true);
    expect(rep.ageMs).toBe(6_000);
  });

  it('flags never-written features as stale', () => {
    const clock = new ManualClock(0);
    const store = new OnlineStore(clock);
    const monitor = new FreshnessMonitor(store, clock);
    monitor.watch('user', 'ghost', 'anything', 1_000);
    expect(monitor.report()[0].stale).toBe(true);
  });
});
