/**
 * Tests for ConsistentHashingStrategy (ring + vnodes).
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { ConsistentHashingStrategy, fnv1a32 } from '../strategies/ConsistentHashingStrategy';
import { createBackend, createPoolEntry, BackendPoolEntry } from '../types/backend';

function pool(n: number): BackendPoolEntry[] {
  return Array.from({ length: n }, (_, i) =>
    createPoolEntry(createBackend(`b${i}`, `10.0.0.${i}`, 8080))
  );
}

describe('fnv1a32', () => {
  it('is deterministic', () => {
    expect(fnv1a32('hello')).toBe(fnv1a32('hello'));
  });
  it('returns unsigned 32-bit', () => {
    const h = fnv1a32('test');
    expect(h).toBeGreaterThanOrEqual(0);
    expect(h).toBeLessThanOrEqual(0xffffffff);
  });
  it('different inputs → different hashes', () => {
    expect(fnv1a32('a')).not.toBe(fnv1a32('b'));
  });
});

describe('ConsistentHashingStrategy', () => {
  let strat: ConsistentHashingStrategy;

  beforeEach(() => {
    strat = new ConsistentHashingStrategy(50); // fewer vnodes for speed
  });

  it('has correct name', () => {
    expect(strat.name).toBe('consistent-hashing');
  });

  it('builds a ring with vnodes per member', () => {
    const entries = pool(4);
    entries.forEach((e) => strat.onBackendAdded(e));
    strat.rebuild();
    expect(strat.ringSize).toBe(4 * 50);
    const dist = strat.distribution();
    expect(dist.size).toBe(4);
    for (const e of entries) {
      expect(dist.get(e.backend.id)).toBe(50);
    }
  });

  it('routes the same key to the same backend', () => {
    const entries = pool(5);
    entries.forEach((e) => strat.onBackendAdded(e));
    const req = { affinityKey: 'user-12345' };
    const sel1 = strat.select(entries, req);
    const sel2 = strat.select(entries, req);
    const sel3 = strat.select(entries, req);
    expect(sel1!.backend.id).toBe(sel2!.backend.id);
    expect(sel2!.backend.id).toBe(sel3!.backend.id);
  });

  it('different keys spread across backends', () => {
    const entries = pool(4);
    entries.forEach((e) => strat.onBackendAdded(e));
    const picks = new Set<string>();
    for (let i = 0; i < 200; i++) {
      picks.add(strat.select(entries, { affinityKey: `key-${i}` })!.backend.id);
    }
    expect(picks.size).toBeGreaterThan(1); // should hit multiple backends
  });

  it('adding a backend remaps only a fraction of keys', () => {
    const entries = pool(4);
    entries.forEach((e) => strat.onBackendAdded(e));
    const keys = Array.from({ length: 400 }, (_, i) => `k${i}`);
    const before = new Map(keys.map((k) => [k, strat.select(entries, { affinityKey: k })!.backend.id]));

    const added = createPoolEntry(createBackend('b4', '10.0.0.4', 8080));
    const withNew = [...entries, added];
    strat.onBackendAdded(added);

    let moved = 0;
    for (const k of keys) {
      const after = strat.select(withNew, { affinityKey: k })!.backend.id;
      if (after !== before.get(k)) moved++;
    }
    // Ideal: 1/5 = 20%. Allow generous bound (<60%) — vastly better than modulo's ~80%.
    expect(moved / keys.length).toBeLessThan(0.6);
    expect(moved).toBeGreaterThan(0); // some keys DO move to the new node
  });

  it('skips unhealthy backends via next-vnode failover', () => {
    const entries = pool(3);
    entries.forEach((e) => strat.onBackendAdded(e));
    const key = 'sticky-key';
    const target = strat.select(entries, { affinityKey: key })!.backend.id;
    // Mark that backend unhealthy.
    const victim = entries.find((e) => e.backend.id === target)!;
    victim.status = 'unhealthy';
    const sel = strat.select(entries, { affinityKey: key })!;
    expect(sel.backend.id).not.toBe(target);
    // Same request again → same failover target (deterministic).
    const sel2 = strat.select(entries, { affinityKey: key })!;
    expect(sel2.backend.id).toBe(sel.backend.id);
  });

  it('falls back when no affinity key provided', () => {
    const entries = pool(3);
    entries.forEach((e) => strat.onBackendAdded(e));
    const sel = strat.select(entries, {})!;
    expect(sel.diagnostics?.fallback).toBe(true);
  });

  it('syncs membership lazily when used standalone', () => {
    const entries = pool(3);
    // Never called onBackendAdded — select() should self-sync.
    const sel = strat.select(entries, { affinityKey: 'k' });
    expect(sel).toBeDefined();
    expect(strat.memberCount).toBe(3);
  });

  it('returns undefined for empty pool', () => {
    expect(strat.select([], { affinityKey: 'k' })).toBeUndefined();
  });

  it('onBackendRemoved shrinks the ring', () => {
    const entries = pool(3);
    entries.forEach((e) => strat.onBackendAdded(e));
    strat.rebuild();
    expect(strat.ringSize).toBe(150);
    strat.onBackendRemoved(entries[0]);
    strat.rebuild();
    expect(strat.ringSize).toBe(100);
    expect(strat.memberCount).toBe(2);
  });
});
