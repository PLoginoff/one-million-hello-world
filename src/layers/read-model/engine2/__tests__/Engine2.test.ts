/**
 * Tests for ReadModel engine2 — VersionedStore, ShardedStore,
 * TtlProjectionStore, MaterializedAggregates, ConsistencyTokens.
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { VersionedStore, UnreadableRowError } from '../VersionedStore';
import { ShardedStore } from '../ShardedStore';
import { TtlProjectionStore } from '../TtlProjectionStore';
import { MaterializedAggregates } from '../MaterializedAggregates';
import { ConsistencyTokens, parseToken, formatToken } from '../ConsistencyTokens';
import { ManualRmClock2, ProjectionRow } from '../types';

const row = (
  projection: string,
  key: string,
  payload: Record<string, unknown>,
  version = 1,
  pos = 0
): ProjectionRow => ({
  projection,
  key,
  version,
  payload,
  writtenAtMs: 0,
  sourcePosition: pos,
});

describe('VersionedStore', () => {
  let s: VersionedStore;

  beforeEach(() => {
    s = new VersionedStore();
    s.registerMigration('users', 1, (p) => ({ ...p, fullName: p['name'] }));
    s.registerMigration('users', 2, (p) => {
      const { name: _n, ...rest } = p;
      return { ...rest, active: true };
    });
  });

  it('reads v1 row migrated to v3 through the chain', () => {
    s.put(row('users', 'u1', { name: 'Ann' }, 1));
    const r = s.get('users', 'u1', 3);
    expect(r).not.toBeNull();
    // v2 dropped `name`, kept `fullName`, added `active`.
    expect(r!.payload).toEqual({ fullName: 'Ann', active: true });
    expect(r!.migrationsApplied).toEqual([1, 2]);
    // Stored row untouched.
    expect(r!.row.version).toBe(1);
    expect(r!.row.payload).toEqual({ name: 'Ann' });
  });

  it('throws UnreadableRowError on a migration gap', () => {
    s.put(row('users', 'u1', { name: 'A' }, 1));
    expect(() => s.get('users', 'u1', 4)).toThrow(UnreadableRowError);
    try {
      s.get('users', 'u1', 4);
    } catch (e) {
      const err = e as UnreadableRowError;
      expect(err.missingStep).toBe(3);
      expect(err.projection).toBe('users');
    }
  });

  it('get returns null for absent rows', () => {
    expect(s.get('users', 'nope', 1)).toBeNull();
  });

  it('upgradeInPlace rewrites the stored row', () => {
    s.put(row('users', 'u1', { name: 'B' }, 1));
    expect(s.upgradeInPlace('users', 'u1', 2)).toBe(2);
    const r = s.get('users', 'freekey' === 'x' ? 'x' : 'u1', 2);
    expect(r!.row.version).toBe(2);
    expect(r!.migrationsApplied).toEqual([]);
    expect(r!.payload['fullName']).toBe('B');
  });

  it('rejects unsupported down-migration', () => {
    s.put(row('users', 'u1', { fullName: 'A', name: 'A' }, 2));
    expect(() => s.get('users', 'u1', 1)).toThrow(UnreadableRowError);
  });
});

describe('ShardedStore', () => {
  it('routes every key to exactly one shard deterministically', () => {
    const s = new ShardedStore(8);
    const k = 'entity-42';
    const shard = s.shardOf(k);
    expect(shard).toBeGreaterThanOrEqual(0);
    expect(shard).toBeLessThan(8);
    expect(s.shardOf(k)).toBe(shard); // deterministic
  });

  it('put/get/delete hit the right shard', () => {
    const s = new ShardedStore(8);
    const r = row('orders', 'o1', { status: 'open' });
    s.put(r);
    expect(s.get('orders', 'o1')).toBe(r);
    expect(s.shardContents('o1')).toContain(r);
    expect(s.delete('orders', 'o1')).toBe(true);
    expect(s.get('orders', 'o1')).toBeNull();
  });

  it('distributes keys across shards', () => {
    const s = new ShardedStore(4);
    for (let i = 0; i < 400; i++) s.put(row('p', `k${i}`, {}));
    const dist = s.distribution();
    expect(dist.reduce((a, b) => a + b, 0)).toBe(400);
    for (const n of dist) {
      expect(n).toBeGreaterThan(30); // ~100 avg, allow variance
    }
  });

  it('reshard moves rows and keeps them readable', () => {
    const s = new ShardedStore(4);
    const rows = Array.from({ length: 50 }, (_, i) => row('p', `k${i}`, { v: i }));
    rows.forEach((r) => s.put(r));
    const moved = s.reshard(8);
    expect(moved).toBe(50); // all rows re-placed
    expect(s.shardCount).toBe(8);
    for (const r of rows) expect(s.get('p', r.key)).toBe(r);
    expect(s.distribution().reduce((a, x) => a + x, 0)).toBe(50);
  });

  it('scan iterates every stored row', () => {
    const s = new ShardedStore(4);
    for (let i = 0; i < 20; i++) s.put(row('p', `k${i}`, {}));
    expect([...s.scan()]).toHaveLength(20);
  });
});

describe('TtlProjectionStore', () => {
  let clock: ManualRmClock2;

  beforeEach(() => {
    clock = new ManualRmClock2(0);
  });

  it('serves fresh rows, marks expired as stale', () => {
    const s = new TtlProjectionStore({ ttlMs: 1000, clock });
    s.put(row('p', 'k', { v: 1 }));
    expect(s.get('p', 'k').fresh).toBe(true);
    clock.advance(1500);
    const r = s.get('p', 'k');
    expect(r.fresh).toBe(false);
    expect(r.stale).toBe(true);
    expect(r.row).not.toBeNull();
    expect(s.getFresh('p', 'k')).toBeNull();
  });

  it('absent rows are neither fresh nor stale', () => {
    const s = new TtlProjectionStore({ ttlMs: 1000, clock });
    const r = s.get('p', 'nope');
    expect(r.fresh).toBe(false);
    expect(r.stale).toBe(false);
    expect(r.row).toBeNull();
  });

  it('sliding mode extends expiry on read', () => {
    const s = new TtlProjectionStore({ ttlMs: 1000, mode: 'sliding', clock });
    s.put(row('p', 'k', {}));
    clock.advance(800);
    expect(s.get('p', 'k').fresh).toBe(true); // resets expiry to 1800
    clock.advance(800); // 1600 — read resets expiry to 2600
    expect(s.get('p', 'k').fresh).toBe(true);
    clock.advance(1200); // 2800 — past reset expiry 2600
    expect(s.get('p', 'k').stale).toBe(true);
  });

  it('sweep physically removes expired rows', () => {
    const s = new TtlProjectionStore({ ttlMs: 1000, clock });
    s.put(row('p', 'a', {}));
    s.put(row('p', 'b', {}));
    clock.advance(1500);
    expect(s.sweep()).toBe(2);
    expect(s.size).toBe(0);
    expect(s.sweptCount).toBe(2);
  });
});

describe('MaterializedAggregates', () => {
  const order = (key: string, status: string, total: number): ProjectionRow =>
    row('orders', key, { status, total });

  it('maintains counts per group on writes and deletes', () => {
    const agg = new MaterializedAggregates();
    agg.register({ name: 'by_status', projection: 'orders', groupBy: 'status', kind: 'count' });
    b_onwrite(agg, order('o1', 'open', 10));
    b_onwrite(agg, order('o2', 'open', 20));
    b_onwrite(agg, order('o3', 'paid', 30));
    expect(agg.value('by_status', 'open')).toBe(2);
    expect(t_val(agg, 'by_status', 'paid')).toBe(1);
    b_ondelete(agg, row2('orders', 'o2', { status: 'open', total: 20 }));
    expect(t_val(agg, 'by_status', 'open')).toBe(1);
  });

  it('sum aggregates field values and updates on write', () => {
    const t = new MaterializedAggregates();
    t.register({ name: 'rev', projection: 'orders', groupBy: 'status', kind: 'sum', field: 'total' });
    b_onwrite(t, row2('orders', 'o1', { status: 'open', total: 10 }));
    b_onwrite(t, row2('orders', 'o2', { status: 'open', total: 20 }));
    expect(t.value('rev', 'open')).toBe(30);
    // update o2 to paid — pass new row and old row so the old group's
    // contribution is removed
    b_onwrite2(t, row2('orders', 'o2', { status: 'paid', total: 25 }), row2('orders', 'o2', { status: 'open', total: 20 }));
    expect(t.value('rev', 'open')).toBe(10);
    expect(t.value('rev', 'paid')).toBe(25);
  });

  it('min/max recompute when the extreme row leaves', () => {
    const t = new MaterializedAggregates();
    t.register({ name: 'maxTot', projection: 'orders', groupBy: 'status', kind: 'max', field: 'total' });
    b_onwrite(t, row2('orders', 'o1', { status: 'open', total: 10 }));
    b_onwrite(t, row2('orders', 'o2', { status: 'open', total: 99 }));
    b_onwrite(t, row2('orders', 'o3', { status: 'open', total: 50 }));
    expect(t.value('maxTot', 'open')).toBe(99);
    b_ondelete(t, row2('orders', 'o2', { status: 'open', total: 99 }));
    expect(t.value('maxTot', 'open')).toBe(50);
  });

  it('rebuild backfills aggregates from a row scan', () => {
    const t = new MaterializedAggregates();
    t.register({ name: 'by_status', projection: 'orders', groupBy: 'status', kind: 'count' });
    t.rebuild([order('o1', 'open', 1), order('o2', 'paid', 2), order('o3', 'paid', 3)]);
    expect(t.value('by_status', 'paid')).toBe(2);
    expect(t.groups('by_status').get('open')).toBe(1);
  });
});

describe('ConsistencyTokens', () => {
  let clock: ManualRmClock2;
  let ct: ConsistencyTokens;

  beforeEach(() => {
    clock = new ManualRmClock2(0);
    ct = new ConsistencyTokens(clock);
  });

  it('issues and parses single-stream tokens', () => {
    const t = ct.issue('', 42);
    expect(t).toBe('42');
    expect(parseToken(t).get('')).toBe(42);
  });

  it('round-trips multi-stream tokens', () => {
    const t = formatToken({ s1: 10, s2: 20 });
    const m = parseToken(t);
    expect(m.get('s1')).toBe(10);
    expect(m.get('s2')).toBe(20);
    expect(() => parseToken('bogus')).toThrow();
  });

  it('satisfiedBy requires every stream to reach its position', () => {
    ct.advance('s1', 100);
    const t = formatToken({ s1: 100, s2: 5 });
    expect(ct.satisfiedBy(t)).toBe(false);
    ct.advance('s2', 5);
    expect(ct.satisfiedBy(t)).toBe(true);
  });

  it('splitConsistent separates fresh from stale rows', () => {
    const rows = [
      row('p', 'a', {}, 1, 5),
      row('p', 'b', {}, 1, 50),
      row('p', 'c', {}, 1, 100),
    ];
    const { consistent, stale } = ct.splitConsistent('40', rows);
    expect(consistent.map((r) => r.key)).toEqual(['b', 'c']);
    expect(stale.map((r) => t_key(r))).toEqual(['a']);
  });

  it('pendingStreams lists streams behind the token', () => {
    ct.advance('s1', 100);
    const t = formatToken({ s1: 100, s2: 7 });
    expect(ct.pendingStreams(t)).toEqual(['s2']);
  });

  it('lagMs measures projection lag for a position', () => {
    ct.advance('', 50);
    clock.advance(250);
    expect(ct.lagMs(50)).toBe(250);
    expect(ct.lagMs(999)).toBeNull();
  });
});

// helpers

function t_val(t: MaterializedAggregates, agg: string, gk: string): number {
  return t.value(agg, gk);
}
function b_onwrite(t: MaterializedAggregates, r: ProjectionRow): void {
  t.onWrite(r);
}
function b_onwrite2(t: MaterializedAggregates, r: ProjectionRow, old: ProjectionRow): void {
  t.onWrite(r, old);
}
function b_ondelete(t: MaterializedAggregates, r: ProjectionRow): void {
  t.onDelete(r);
}
function row2(p: string, k: string, pl: Record<string, unknown>): ProjectionRow {
  return { projection: p, key: k, version: 1, payload: pl, writtenAtMs: 0, sourcePosition: 0 };
}
function t_key(r: ProjectionRow): string {
  return r.key;
}
