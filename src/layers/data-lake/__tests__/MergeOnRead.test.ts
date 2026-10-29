/**
 * Merge-on-read table tests.
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { MergeOnReadTable, recordKey } from '../engine/MergeOnRead';
import { LakeObjectStore } from '../engine/ZoneManager';

const KEY = ['id'] as const;

describe('recordKey', () => {
  it('single and composite keys', () => {
    expect(recordKey({ id: 1, x: 'a' }, ['id'])).toBe('[1]');
    expect(recordKey({ a: 1, b: 'x' }, ['a', 'b'])).toBe('[1,"x"]');
    expect(recordKey({ a: 1 }, ['a', 'b'])).toBe('[1,null]');
  });
});

describe('MergeOnReadTable', () => {
  let store: LakeObjectStore;
  let mor: MergeOnReadTable;

  beforeEach(() => {
    store = new LakeObjectStore();
    mor = new MergeOnReadTable(store, 'curated/users', { keyColumns: KEY });
    mor.initialise([
      { name: 'id', type: 'int32', nullable: false },
      { name: 'name', type: 'utf8', nullable: false },
    ]);
  });

  it('upserts create delta files', () => {
    mor.upsert([{ id: 1, name: 'ann' }, { id: 2, name: 'bob' }]);
    const stats = mor.fileStats();
    expect(stats.deltaFiles).toBe(1);
    const rows = mor.read();
    expect(rows.length).toBe(2);
  });

  it('newer upsert wins per key', () => {
    mor.upsert([{ id: 1, name: 'ann' }]);
    mor.upsert([{ id: 1, name: 'ann2' }]);
    const rows = mor.read();
    expect(rows.length).toBe(1);
    expect(rows[0].name).toBe('ann2');
  });

  it('delete tombstones keys', () => {
    mor.upsert([{ id: 1, name: 'a' }, { id: 2, name: 'b' }]);
    mor.delete([{ id: 1 }]);
    const rows = mor.read();
    expect(rows.length).toBe(1);
    expect(rows[0].id).toBe(2);
  });

  it('compaction merges deltas into a base file', () => {
    mor.upsert([{ id: 1, name: 'a' }]);
    mor.upsert([{ id: 1, name: 'b' }, { id: 2, name: 'c' }]);
    mor.delete([{ id: 1 }]);
    const before = mor.fileStats();
    expect(before.deltaFiles).toBe(3);
    mor.compact();
    const after = mor.fileStats();
    expect(after.baseFiles).toBe(1);
    expect(after.deltaFiles).toBe(0);
    const rows = mor.read();
    expect(rows.length).toBe(1);
    expect(rows[0].name).toBe('c');
  });

  it('time travel reads pre-compaction state', () => {
    mor.upsert([{ id: 1, name: 'a' }]);
    const v1 = mor.table.log.version;
    mor.upsert([{ id: 1, name: 'b' }]);
    const atV1 = mor.read({ asOfVersion: v1 });
    expect(atV1[0].name).toBe('a');
    expect(mor.read()[0].name).toBe('b');
  });

  it('needsCompaction fires past threshold', () => {
    const tiny = new MergeOnReadTable(store, 'curated/t2', { keyColumns: KEY, compactWhenDeltaBytesExceed: 10 });
    tiny.initialise([{ name: 'id', type: 'int32', nullable: false }]);
    expect(tiny.needsCompaction()).toBe(false);
    tiny.upsert([{ id: 1, name: 'x'.repeat(50) }]);
    expect(tiny.needsCompaction()).toBe(true);
  });
});
