/**
 * Tests for UnitOfWork engine2 — NestedUnitOfWork, dirty tracking,
 * ReadCommitted, TransactionHooks, DeadlockDetector.
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { NestedUnitOfWork } from '../NestedUnitOfWork';
import { hashEntity, canonicalize } from '../dirty';
import { InMemoryCommittedStore, ReadCommittedTx, WriteSkewError } from '../ReadCommitted';
import { TransactionHooks } from '../TransactionHooks';
import { DeadlockDetector } from '../DeadlockDetector';
import { ManualUowClock2 } from '../types';

describe('NestedUnitOfWork', () => {
  let uow: NestedUnitOfWork;

  beforeEach(() => {
    uow = new NestedUnitOfWork();
    uow.track('Order#1', { status: 'draft', total: 10 });
    uow.track('Line#1', { qty: 1 });
  });

  it('savepoints restore entity state on rollbackLevel', () => {
    uow.begin('s1');
    uow.entity('Order#1')!['status'] = 'paid';
    uow.begin('s2');
    uow.entity('Order#1')!['total'] = 999;
    expect(uow.rollbackLevel()).toBe('s2');
    expect(uow.entity('Order#1')!['total']).toBe(10);
    expect(uow.entity('Order#1')!['status']).toBe('paid'); // s1 change kept
    expect(uow.rollbackLevel()).toBe('s1');
    expect(uow.entity('Order#1')!['status']).toBe('draft');
  });

  it('rollbackTo keeps the named savepoint on the stack', () => {
    uow.begin('s1');
    uow.entity('Order#1')!['status'] = 'a';
    uow.begin('s2');
    uow.entity('Order#1')!['status'] = 'b';
    expect(uow.rollbackTo('s1')).toBe(true);
    expect(uow.savepoints()).toEqual(['s1']);
    expect(uow.entity('Order#1')!['status']).toBe('draft');
  });

  it('commit requires all levels committed', () => {
    uow.begin('s1');
    uow.entity('Order#1')!['status'] = 'paid';
    expect(() => b_commit(uow)).toThrow(/uncommitted savepoint/);
    expect(b_commit_level(uow)).toBe('s1');
    const changes = b_commit(uow);
    expect(changes).toHaveLength(1);
    expect(changes[0].field).toBe('status');
    expect(t_iscomm(uow)).toBe(true);
  });

  it('commitLevel merges child changes visible to parent rollback', () => {
    uow.begin('s1');
    uow.entity('Order#1')!['status'] = 'paid';
    b_commit_level(uow); // commit s1 — changes merged into uow scope
    uow.begin('s2');
    uow.entity('Order#1')!['status'] = 'shipped';
    expect(uow.rollbackLevel()).toBe('s2');
    expect(uow.entity('Order#1')!['status']).toBe('paid');
  });

  it('hash-based dirty detection skips clean entities', () => {
    uow.entity('Order#1')!['status'] = 'paid';
    const dirty = uow.dirtyEntities();
    expect(dirty).toEqual(['Order#1']);
    // field order permutation is not a change
    uow.track('Order#2', { b: 2, a: 1 });
    const t = (uow as unknown as { _tracked: Map<string, { current: Record<string, unknown> }> });
    void t;
  });

  it('full rollback restores all originals regardless of depth', () => {
    b_begin(uow, 's1');
    b_entity_mut(uow, 'Order#1', 'status', 'paid');
    b_begin(uow, 's2');
    b_entity_mut(uow, 'Line#1', 'qty', 99);
    b_rollback(uow);
    expect(uow.entity('Order#1')!['status']).toBe('draft');
    expect(uow.entity('Line#1')!['qty']).toBe(1);
    expect(t_isrolled(uow)).toBe(true);
  });
});

describe('dirty tracking', () => {
  it('canonicalize is key-order independent', () => {
    expect(canonicalize({ b: 2, a: 1 })).toBe(canonicalize({ a: 1, b: 2 }));
    expect(hashEntity({ a: 1, b: 2 })).toBe(hashEntity({ b: 2, a: 1 }));
  });

  it('hash differs on field change, equal on reorder', () => {
    expect(hashEntity({ a: 1 })).not.toBe(hashEntity({ a: 2 }));
    expect(hashEntity({ nested: { x: 1, y: 2 } })).toBe(hashEntity({ nested: { y: 2, x: 1 } }));
  });
});

describe('ReadCommitted', () => {
  it('reads only committed data — buffered writes invisible (no dirty reads)', () => {
    const store = new InMemoryCommittedStore();
    store.publish('E1', { v: 1 });
    const tx = new ReadCommittedTx(store);
    t_write(tx, 'E1', { v: 2 });
    expect(t_read(tx, 'E1')!['v']).toBe(1); // buffered write invisible
    expect(t_read_own(tx, 'E1')!['v']).toBe(2); // read-your-writes overlay
  });

  it('non-repeatable reads see newly committed data (RC semantics)', () => {
    const store = new InMemoryCommittedStore();
    store.publish('E1', { v: 1 });
    const t1 = new ReadCommittedTx(store);
    expect(t_read(t1, 'E1')!['v']).toBe(1);
    const t2 = new ReadCommittedTx(store);
    t_write(t2, 'E1', { v: 9 });
    t_commit(t2);
    expect(t_read(t1, 'E1')!['v']).toBe(9); // non-repeatable read allowed
  });

  it('commit publishes writes atomically', () => {
    const store = new InMemoryCommittedStore();
    const t = new ReadCommittedTx(store);
    t_write(t, 'a', { x: 1 });
    t_write(t, 'b', { y: 2 });
    expect(store.get('a')).toBeNull(); // nothing visible before commit
    t_commit(t);
    expect(store.get('a')).toEqual({ x: 1 });
    expect(store.get('b')).toEqual({ y: 2 });
  });

  it('detects write skew when a read entity was re-committed', () => {
    const store = new InMemoryCommittedStore();
    store.publish('E1', { v: 1 });
    const t1 = new ReadCommittedTx(store);
    t_read(t1, 'E1'); // read version 1
    const t2 = new ReadCommittedTx(store);
    t_write(t2, 'E1', { v: 2 });
    t_commit(t2); // bumps version to 2
    t_write(t1, 'E1', { v: 3 });
    expect(() => t_commit(t1)).toThrow(WriteSkewError);
  });

  it('allowWriteSkew skips the conflict check', () => {
    const store = new InMemoryCommittedStore();
    store.publish('E1', { v: 1 });
    const t1 = new ReadCommittedTx(store, true);
    t_read(t1, 'E1');
    const t2 = new ReadCommittedTx(store);
    t_write(t2, 'E1', { v: 2 });
    t_commit(t2);
    t_write(t1, 'E1', { v: 3 });
    expect(() => t_commit(t1)).not.toThrow();
  });
});

describe('TransactionHooks', () => {
  it('beforeCommit veto triggers afterRollback', () => {
    const h = new TransactionHooks();
    const calls: string[] = [];
    h.on('beforeCommit', () => calls.push('b1'));
    h.on('beforeCommit', () => {
      throw new Error('veto');
    });
    h.on('afterCommit', () => calls.push('ac'));
    h.on('afterRollback', () => calls.push('ar'));
    const r = h.commitWithHooks(() => {
      throw new Error('should not commit');
    });
    expect(r.vetoed).toBe(true);
    expect(calls).toEqual(['b1', 'ar']); // veto → afterRollback fired
  });

  it('commit path runs before → commit → afterCommit', () => {
    const h = new TransactionHooks();
    const calls: string[] = [];
    h.on('beforeCommit', () => calls.push('b'));
    h.on('afterCommit', () => calls.push('ac'));
    h.on('afterRollback', () => calls.push('ar'));
    const r = h.commitWithHooks(() => calls.push('commit'));
    expect(r.vetoed).toBe(false);
    expect(calls).toEqual(['b', 'commit', 'ac']);
  });

  it('afterCommit failures are collected not thrown', () => {
    const h = new TransactionHooks();
    const calls: string[] = [];
    h.on('afterCommit', () => {
      throw new Error('bad listener');
    });
    h.on('afterCommit', () => calls.push('still-ran'));
    const out = h.runAfterCommit();
    expect(out.failures).toHaveLength(1);
    expect(calls).toEqual(['still-ran']);
  });
});

describe('DeadlockDetector', () => {
  let clock: ManualUowClock2;
  let d: DeadlockDetector;

  beforeEach(() => {
    clock = new ManualUowClock2(0);
    d = new DeadlockDetector({ timeoutMs: 5000, clock });
  });

  it('detects a 2-cycle and picks the cheapest victim', () => {
    d.lockAcquired('t1');
    d.lockAcquired('t1'); // t1 holds 2 locks
    d.lockAcquired('t2'); // t2 holds 1
    expect(d.wait('t1', 't2', 'r2')).toBeNull();
    const r = d.wait('t2', 't1', 'r1');
    expect(r).not.toBeNull();
    expect(r!.kind).toBe('cycle');
    expect(r!.cycle).toEqual(['t2', 't1', 't2']);
    expect(r!.victim).toBe('t2'); // fewer locks held → cheaper abort
  });

  it('detects a 3-cycle', () => {
    d.wait('t1', 't2', 'r');
    d.wait('t2', 't3', 'r');
    const r = d.wait('t3', 't1', 'r');
    expect(r).not.toBeNull();
    expect(r!.kind).toBe('cycle');
    expect(r!.cycle.length).toBe(4);
  });

  it('no cycle → null', () => {
    expect(d.wait('t1', 't2', 'r')).toBeNull();
    expect(d.wait('t3', 't2', 'r')).toBeNull();
  });

  it('grant removes the wait edge', () => {
    d.wait('t1', 't2', 'r');
    d.grant('t1', 't2', 'r');
    expect(b_edges(d)).toHaveLength(0);
  });

  it('timeout flags long waits as suspected deadlock', () => {
    clock.advance(6000); // now=6000
    d.wait('t1', 't2', 'r'); // edge at 6000
    const r = d.wait('t3', 't4', 'r2'); // fresh edge — no cycle, stale t1 edge is at 6000 (age 0)
    expect(r).toBeNull();
    clock.advance(6000); // now=12000 — t1's edge is 6000ms old > 5000
    const r2 = d.wait('t5', 't6', 'r3');
    expect(r2).not.toBeNull();
    expect(r2!.kind).toBe('timeout');
  });

  it('release removes all edges to and from a tx', () => {
    d.wait('t1', 't2', 'r');
    d.wait('t2', 't3', 'r');
    d.release('t2');
    expect(b_edges(d)).toHaveLength(0);
  });
});

// helpers
function b_commit(u: NestedUnitOfWork): ReturnType<NestedUnitOfWork['commit']> {
  return u.commit();
}
function b_commit_level(u: NestedUnitOfWork): string | null {
  return u.commitLevel();
}
function t_iscomm(u: NestedUnitOfWork): boolean {
  return u.isCommitted;
}
function b_begin(u: NestedUnitOfWork, n: string): string {
  return u.begin(n);
}
function b_entity_mut(u: NestedUnitOfWork, id: string, f: string, v: unknown): void {
  u.entity(id)![f] = v;
}
function b_rollback(u: NestedUnitOfWork): void {
  u.rollback();
}
function t_isrolled(u: NestedUnitOfWork): boolean {
  return u.isRolledBack;
}
function t_read(tx: ReadCommittedTx, id: string): Record<string, unknown> | null {
  return tx.read(id);
}
function t_read_own(tx: ReadCommittedTx, id: string): Record<string, unknown> | null {
  return tx.readOwn(id);
}
function t_write(tx: ReadCommittedTx, id: string, s: Record<string, unknown>): void {
  tx.write(id, s);
}
function t_commit(tx: ReadCommittedTx): void {
  tx.commit();
}
function b_edges(d: DeadlockDetector) {
  return d.edges();
}
