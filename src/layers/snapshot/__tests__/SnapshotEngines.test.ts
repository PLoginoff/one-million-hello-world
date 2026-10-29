/**
 * Snapshot Engines — version map, snapshot manager, retention, hash tree.
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { VersionMap } from '../implementations/VersionMap';
import {
  SnapshotManager,
  SnapshotIntegrityError,
  SnapshotNotFoundError,
} from '../implementations/SnapshotManager';
import { RetentionPolicy, type RetentionConfig } from '../implementations/RetentionPolicy';
import { HashTree, fnv1a64, hashBlock } from '../implementations/HashTree';
import type { StoredSnapshot } from '../implementations/SnapshotManager';

// -------------------------------------------------------------- version map

describe('VersionMap', () => {
  let map: VersionMap;
  beforeEach(() => {
    map = new VersionMap();
  });

  it('set/get round-trips values', () => {
    map.set('k1', { v: 1 });
    expect(map.get('k1')).toEqual({ v: 1 });
    expect(map.has('k1')).toBe(true);
  });

  it('getAt returns historical values', () => {
    const v1 = map.set('k', 'first');
    const v2 = map.set('k', 'second');
    const v3 = map.set('other', 'x');
    expect(map.getAt('k', v1).value).toBe('first');
    expect(map.getAt('k', v2).value).toBe('second');
    expect(map.getAt('k', v3).value).toBe('second'); // latest <= v3
  });

  it('delete tombstones the key', () => {
    map.set('k', 'v');
    const dv = map.delete('k');
    expect(map.has('k')).toBe(false);
    expect(map.getAt('k', dv - 1).exists).toBe(true);
    expect(map.getAt('k', dv).exists).toBe(false);
  });

  it('materializeAt returns the full state at a version', () => {
    map.set('a', 1);
    const v = map.set('b', 2);
    map.set('a', 99);
    map.delete('b');
    const at = map.materializeAt(v);
    expect(at.get('a')).toBe(1);
    expect(at.get('b')).toBe(2);
  });

  it('compact drops shadowed history', () => {
    map.set('k', 'v1');
    map.set('k', 'v2');
    map.set('k', 'v3');
    const before = map.historySize;
    const dropped = map.compact(2);
    expect(dropped).toBe(1);
    expect(map.historySize).toBe(before - 1);
    expect(map.getAt('k', 2).value).toBe('v2');
    expect(map.get('k')).toBe('v3');
  });

  it('keys and liveKeys enumerate correctly', () => {
    map.set('a', 1);
    map.set('b', 2);
    map.delete('a');
    expect(map.keys().sort()).toEqual(['a', 'b']);
    expect(map.liveKeys()).toEqual(['b']);
  });
});

// ---------------------------------------------------------------- snapshots

describe('SnapshotManager', () => {
  let map: VersionMap;
  let mgr: SnapshotManager;

  beforeEach(() => {
    map = new VersionMap();
    mgr = new SnapshotManager(map);
  });

  it('full snapshot restores exact state', () => {
    map.set('a', 1);
    map.set('b', 2);
    const snap = mgr.take({ kind: 'full' });
    map.set('a', 99);
    map.delete('b');
    const restored = mgr.restore(snap.id);
    expect(restored.get('a')).toBe(1);
    expect(restored.get('b')).toBe(2);
    expect(restored.size).toBe(2);
  });

  it('incremental captures only the delta', () => {
    map.set('a', 1);
    map.set('b', 2);
    const full = mgr.take({ kind: 'full', bucketCount: 4 });
    map.set('a', 10);       // changed
    map.set('c', 3);        // added
    map.delete('b');        // deleted
    const incr = mgr.take({ kind: 'incremental', parentId: full.id });
    expect(incr.kind).toBe('incremental');
    expect(incr.parentId).toBe(full.id);
    // Collect all changed keys in the delta.
    const deltaKeys = new Set<string>();
    for (const b of incr.blocks) for (const k of Object.keys(b.entries)) deltaKeys.add(k);
    expect(deltaKeys).toEqual(new Set(['a', 'b', 'c']));
    // Restore walks the chain.
    const restored = mgr.restore(incr.id);
    expect(restored.get('a')).toBe(10);
    expect(restored.get('c')).toBe(3);
    expect(restored.has('b')).toBe(false);
  });

  it('verifyAgainstLive oracle matches restore', () => {
    map.set('x', { deep: [1, 2, { y: 'z' }] });
    const full = mgr.take();
    map.set('x', { deep: [] });
    map.set('new', 1);
    const incr = mgr.take({ kind: 'incremental', parentId: full.id });
    expect(mgr.verifyAgainstLive(full.id)).toBe(true);
    expect(mgr.verifyAgainstLive(incr.id)).toBe(true);
  });

  it('point-in-time restore bypasses snapshots', () => {
    map.set('a', 1);
    const v = map.set('b', 2);
    map.set('a', 100);
    const pit = mgr.restorePointInTime(v);
    expect(pit.get('a')).toBe(1);
    expect(pit.get('b')).toBe(2);
  });

  it('verify detects tampered blocks', () => {
    map.set('a', 1);
    const snap = mgr.take();
    mgr.verify(snap.id); // passes
    // Tamper: mutate the stored block entries.
    const stored = mgr.get(snap.id);
    (stored.blocks[0]!.entries as Record<string, string>)['evil'] = '"x"';
    expect(() => mgr.verify(snap.id)).toThrow(SnapshotIntegrityError);
  });

  it('chainOf lists ancestors oldest→newest', () => {
    map.set('a', 1);
    const s1 = mgr.take();
    map.set('a', 2);
    const s2 = mgr.take({ kind: 'incremental', parentId: s1.id });
    map.set('a', 3);
    const s3 = mgr.take({ kind: 'incremental', parentId: s2.id });
    const chain = mgr.chainOf(s3.id);
    expect(chain.map((s) => s.id)).toEqual([s1.id, s2.id, s3.id]);
  });

  it('childrenOf finds direct dependents', () => {
    map.set('a', 1);
    const p = mgr.take();
    const c1 = mgr.take({ kind: 'incremental', parentId: p.id });
    const c2 = mgr.take({ kind: 'incremental', parentId: p.id });
    expect(mgr.childrenOf(p.id).map((s) => s.id).sort()).toEqual([c1.id, c2.id].sort());
  });

  it('flatten converts an incremental into a self-contained full', () => {
    map.set('a', 1);
    const s1 = mgr.take();
    map.set('a', 2);
    map.set('b', 3);
    const s2 = mgr.take({ kind: 'incremental', parentId: s1.id });
    const flat = mgr.flatten(s2.id);
    expect(flat.kind).toBe('full');
    expect(flat.parentId).toBeUndefined();
    // After deleting the parent, s2 still restores.
    mgr.delete(s1.id);
    const restored = mgr.restore(s2.id);
    expect(restored.get('a')).toBe(2);
    expect(restored.get('b')).toBe(3);
  });

  it('incremental without a parent throws', () => {
    expect(() => mgr.take({ kind: 'incremental' })).toThrow();
  });

  it('get on missing snapshot throws SnapshotNotFoundError', () => {
    expect(() => mgr.get('nope')).toThrow(SnapshotNotFoundError);
  });
});

// ---------------------------------------------------------------- hash tree

describe('HashTree', () => {
  it('root is deterministic for same input', () => {
    const hashes = ['a', 'b', 'c', 'd'].map((x) => fnv1a64(x));
    const t1 = new HashTree(hashes);
    const t2 = new HashTree(hashes);
    expect(t1.root).toBe(t2.root);
  });

  it('different inputs produce different roots', () => {
    const t1 = new HashTree(['a', 'b'].map(fnv1a64));
    const t2 = new HashTree(['a', 'c'].map(fnv1a64));
    expect(t1.root).not.toBe(t2.root);
  });

  it('handles odd leaf counts', () => {
    const t = new HashTree(['a', 'b', 'c'].map(fnv1a64));
    expect(t.blockCount).toBe(3);
    expect(t.root.length).toBeGreaterThan(0);
  });

  it('prove + verify round-trips for every leaf', () => {
    const hashes = ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map(fnv1a64);
    const tree = new HashTree(hashes);
    for (let i = 0; i < hashes.length; i++) {
      const proof = tree.prove(i);
      expect(HashTree.verify(proof)).toBe(true);
    }
  });

  it('proof fails on tampered block hash', () => {
    const hashes = ['a', 'b', 'c', 'd'].map(fnv1a64);
    const tree = new HashTree(hashes);
    const proof = tree.prove(1);
    const tampered = { ...proof, blockHash: fnv1a64('tampered') };
    expect(HashTree.verify(tampered)).toBe(false);
  });

  it('firstDivergence finds the first differing leaf', () => {
    const t1 = new HashTree(['a', 'b', 'c', 'd'].map(fnv1a64));
    const t2 = new HashTree(['a', 'b', 'X', 'd'].map(fnv1a64));
    expect(t1.firstDivergence(t2)).toBe(2);
    expect(t1.firstDivergence(t1)).toBe(-1);
  });

  it('hashBlock is deterministic', () => {
    expect(hashBlock('b0', 'k=v')).toBe(hashBlock('b0', 'k=v'));
    expect(hashBlock('b0', 'k=v')).not.toBe(hashBlock('b0', 'k=w'));
  });
});

// ---------------------------------------------------------------- retention

function makeSnap(id: string, takenAt: number, labels: string[] = [], parentId?: string): StoredSnapshot {
  return {
    id,
    kind: parentId ? 'incremental' : 'full',
    parentId,
    version: takenAt,
    takenAt,
    bucketCount: 4,
    blocks: [],
    rootHash: 'r',
    labels: new Set(labels),
  };
}

const DAY = 24 * 3600 * 1000;

describe('RetentionPolicy', () => {
  const cfg: RetentionConfig = {
    keepLast: 2,
    keepDaily: 3,
    keepWeekly: 1,
    keepMonthly: 1,
  };

  it('always keeps the newest keepLast snapshots', () => {
    const now = Date.now();
    const snaps = [
      makeSnap('s1', now - 10 * DAY),
      makeSnap('s2', now - 5 * DAY),
      makeSnap('s3', now - DAY),
      makeSnap('s4', now - 100),
    ];
    const policy = new RetentionPolicy({ ...cfg, keepDaily: 0, keepWeekly: 0, keepMonthly: 0 });
    const plan = policy.evaluate(snaps, now);
    const keepIds = plan.decisions.filter((d) => d.action === 'keep').map((d) => d.snapshotId);
    expect(keepIds).toEqual(['s4', 's3']);
  });

  it('daily tier keeps one snapshot per day', () => {
    const now = Date.UTC(2026, 9, 29, 12);
    const snaps = [
      makeSnap('a1', now - 1000),                       // today 12:00 - 1s
      makeSnap('a2', now - 3600_000),                   // today 11:00
      makeSnap('b1', now - DAY - 1000),                 // yesterday
      makeSnap('b2', now - DAY - 7200_000),             // yesterday earlier
      makeSnap('c1', now - 2 * DAY),                    // 2 days ago
    ];
    const policy = new RetentionPolicy({ keepLast: 0, keepDaily: 3, keepWeekly: 0, keepMonthly: 0 });
    const plan = policy.evaluate(snaps, now);
    const keep = plan.decisions.filter((d) => d.action === 'keep').map((d) => d.snapshotId);
    // One per day for 3 days: today (a1), yesterday (b1), day-2 (c1)
    expect(keep.sort()).toEqual(['a1', 'b1', 'c1'].sort());
  });

  it('weekly tier keeps one per ISO week', () => {
    const now = Date.UTC(2026, 9, 29, 12);
    const snaps = [
      makeSnap('w0', now - DAY),
      makeSnap('w1', now - 8 * DAY),
      makeSnap('w1b', now - 9 * DAY),
      makeSnap('w2', now - 15 * DAY),
    ];
    const policy = new RetentionPolicy({ keepLast: 0, keepDaily: 0, keepWeekly: 2, keepMonthly: 0 });
    const plan = policy.evaluate(snaps, now);
    const keep = plan.decisions.filter((d) => d.action === 'keep').map((d) => d.snapshotId);
    expect(keep.length).toBe(2);
    expect(keep).toContain('w0');
    expect(keep).toContain('w1');
  });

  it('labeled snapshots are always kept', () => {
    const now = Date.now();
    const snaps = [
      makeSnap('n1', now - 30 * DAY),
      makeSnap('labeled', now - 30 * DAY - 1, ['pre-migration']),
    ];
    const policy = new RetentionPolicy({ keepLast: 0, keepDaily: 0, keepWeekly: 0, keepMonthly: 0 });
    const plan = policy.evaluate(snaps, now);
    const labeled = plan.decisions.find((d) => d.snapshotId === 'labeled');
    expect(labeled?.action).toBe('keep');
    const n1 = plan.decisions.find((d) => d.snapshotId === 'n1');
    expect(n1?.action).toBe('delete');
  });

  it('minAge protects recent snapshots', () => {
    const now = Date.now();
    const snaps = [makeSnap('young', now - 1000), makeSnap('old', now - 100 * DAY)];
    const policy = new RetentionPolicy({ keepLast: 0, keepDaily: 0, keepWeekly: 0, keepMonthly: 0, minAgeMs: 60_000 });
    const plan = policy.evaluate(snaps, now);
    expect(plan.decisions.find((d) => d.snapshotId === 'young')?.action).toBe('keep');
    expect(plan.decisions.find((d) => d.snapshotId === 'old')?.action).toBe('delete');
  });

  it('deleteOrder puts children before parents', () => {
    const now = Date.now();
    const parent = makeSnap('p', now - 10 * DAY);
    const child = makeSnap('c', now - 9 * DAY, [], 'p');
    const policy = new RetentionPolicy({ keepLast: 0, keepDaily: 0, keepWeekly: 0, keepMonthly: 0 });
    const plan = policy.evaluate([parent, child], now);
    expect(plan.deleteOrder.indexOf('c')).toBeLessThan(plan.deleteOrder.indexOf('p'));
  });

  it('apply flattens surviving children of deleted parents', () => {
    const map = new VersionMap();
    map.set('a', 1);
    const mgr = new SnapshotManager(map);
    const now = Date.now();
    const s1 = mgr.take();
    // fake older timestamp
    (s1 as { takenAt: number }).takenAt = now - 10 * DAY;
    map.set('a', 2);
    const s2 = mgr.take({ kind: 'incremental', parentId: s1.id });
    (s2 as { takenAt: number }).takenAt = now - DAY;

    const policy = new RetentionPolicy({ keepLast: 1, keepDaily: 0, keepWeekly: 0, keepMonthly: 0 });
    const plan = policy.evaluate(mgr.list(), now);
    // s2 (newest) is kept; s1 marked for deletion.
    expect(plan.decisions.find((d) => d.snapshotId === s1.id)?.action).toBe('delete');
    policy.apply(mgr, plan);
    // s1 deleted, s2 flattened and still restorable.
    expect(mgr.has(s1.id)).toBe(false);
    const restored = mgr.restore(s2.id);
    expect(restored.get('a')).toBe(2);
  });
});
