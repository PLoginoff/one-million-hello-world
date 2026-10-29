/**
 * CDC processor & state store tests.
 */

import { describe, it, expect } from 'bun:test';
import { CdcProcessor, KeyedStateStore, diffSnapshots } from '../engine/CdcEngine';

describe('KeyedStateStore', () => {
  it('put/get/delete', () => {
    const s = new KeyedStateStore();
    s.put('k1', { v: 1 });
    expect(s.get('k1')).toEqual({ v: 1 });
    s.delete('k1');
    expect(s.get('k1')).toBeUndefined();
  });

  it('TTL expiry', () => {
    let now = 1000;
    const s = new KeyedStateStore(() => now);
    s.put('k', { v: 1 }, 500);
    expect(s.get('k')).toBeDefined();
    now = 1600;
    expect(s.get('k')).toBeUndefined();
  });

  it('scanPrefix enumerates composite keys', () => {
    const s = new KeyedStateStore();
    s.put('us|1', { v: 1 });
    s.put('us|2', { v: 2 });
    s.put('eu|1', { v: 3 });
    const us = s.scanPrefix('us|');
    expect(us.length).toBe(2);
  });
});

describe('CdcProcessor', () => {
  it('applies insert/update/delete in order', () => {
    const c = new CdcProcessor();
    c.ingestAll([
      { position: 1, key: 'a', op: 'insert', row: { v: 1 } },
      { position: 2, key: 'a', op: 'update', row: { w: 2 } },
      { position: 3, key: 'b', op: 'insert', row: { v: 9 } },
      { position: 4, key: 'a', op: 'delete' },
    ]);
    const snap = c.snapshot();
    expect(snap.get('a')).toBeUndefined();
    expect(snap.get('b')).toEqual({ v: 9 });
    expect(c.isTombstoned('a')).toBe(true);
    expect(c.appliedCount).toBe(4);
  });

  it('update merges fields preserving others', () => {
    const c = new CdcProcessor();
    c.ingestAll([
      { position: 1, key: 'a', op: 'insert', row: { x: 1, y: 2 } },
      { position: 2, key: 'a', op: 'update', row: { y: 20 } },
    ]);
    expect(c.snapshot().get('a')).toEqual({ x: 1, y: 20 });
  });

  it('buffers out-of-order events and drains contiguously', () => {
    const c = new CdcProcessor();
    c.ingest({ position: 1, key: 'a', op: 'insert', row: { v: 1 } });
    // position 3 arrives before 2
    c.ingest({ position: 3, key: 'a', op: 'update', row: { v: 30 } });
    expect(c.appliedCount).toBe(1); // 3 buffered
    c.ingest({ position: 2, key: 'a', op: 'update', row: { v: 20 } });
    expect(c.appliedCount).toBe(3); // 2 applied, 3 drained
    expect(c.highWaterMark).toBe(3);
    expect(c.snapshot().get('a')).toEqual({ v: 30 });
  });

  it('drops stale positions', () => {
    const c = new CdcProcessor();
    c.ingest({ position: 5, key: 'a', op: 'insert', row: { v: 1 } });
    c.ingest({ position: 3, key: 'b', op: 'insert', row: { v: 2 } }); // stale
    expect(c.droppedCount).toBe(1);
  });

  it('force-applies when reorder buffer overflows', () => {
    const c = new CdcProcessor({ reorderBufferSize: 2 });
    c.ingest({ position: 1, key: 'a', op: 'insert', row: { v: 1 } });
    c.ingest({ position: 5, key: 'a', op: 'update', row: { v: 5 } });
    c.ingest({ position: 6, key: 'a', op: 'update', row: { v: 6 } });
    c.ingest({ position: 7, key: 'a', op: 'update', row: { v: 7 } }); // buffer>2 → force apply 5
    expect(c.appliedCount).toBeGreaterThanOrEqual(2);
  });
});

describe('diffSnapshots', () => {
  it('reports added/updated/removed', () => {
    const before = new Map<string, Record<string, unknown>>([
      ['a', { v: 1 }],
      ['b', { v: 2 }],
    ]);
    const after = new Map<string, Record<string, unknown>>([
      ['b', { v: 20 }],
      ['c', { v: 3 }],
    ]);
    const diff = diffSnapshots(before, after);
    const kinds = new Map(diff.map((d) => [d.key, d.kind]));
    expect(kinds.get('a')).toBe('removed');
    expect(kinds.get('b')).toBe('updated');
    expect(kinds.get('c')).toBe('added');
  });
});
