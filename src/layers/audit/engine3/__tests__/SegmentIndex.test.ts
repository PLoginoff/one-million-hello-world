/**
 * Tests for SegmentIndex: seq lookup, time-range queries, gap
 * analysis and continuity checks.
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { sealRecord, GENESIS_HASH } from '../../engine/HashChain';
import type { AuditRecord } from '../../engine/types';
import { SegmentCompactor } from '../SegmentCompactor';
import { SegmentIndex } from '../SegmentIndex';
import { ManualAuditClock3 } from '../types3';

/**
 * Build ONE continuous chain of `total` records, each linking to its
 * predecessor — slices of it compact cleanly through the
 * anchorPrevHash gate.
 */
function fullChain(total: number, tsBase = 0): AuditRecord[] {
  const out: AuditRecord[] = [];
  let prev = GENESIS_HASH;
  for (let seq = 1; seq <= total; seq++) {
    const r = sealRecord(
      { actor: 'u', action: 'a', timestamp: tsBase + seq * 1000 },
      { seq, id: `r${seq}`, previousHash: prev, timestamp: tsBase + seq * 1000, tier: 'hot' }
    );
    out.push(r);
    prev = r.hash;
  }
  return out;
}

describe('SegmentIndex', () => {
  let clock: ManualAuditClock3;
  let compactor: SegmentCompactor;
  let index: SegmentIndex;
  let idCounter: number;
  let records: AuditRecord[];

  /** Compact a seq slice [from, to] of the shared chain. */
  const slice = (from: number, to: number) => {
    const seg = records.slice(from - 1, to);
    const anchor = from === 1 ? undefined : records[from - 2]!.hash;
    return compactor.compact(seg, anchor).segment;
  };

  beforeEach(() => {
    clock = new ManualAuditClock3(0);
    idCounter = 0;
    compactor = new SegmentCompactor({ clock, idGen: () => `seg-${++idCounter}` });
    index = new SegmentIndex({ clock });
    records = fullChain(40);
  });

  it('locate finds the segment holding a seq via binary search', () => {
    index.register(slice(1, 10));
    index.register(slice(11, 20));
    index.register(slice(21, 30));
    expect(index.locate(1)!.fromSeq).toBe(1);
    expect(index.locate(15)!.fromSeq).toBe(11);
    expect(index.locate(30)!.fromSeq).toBe(21);
    expect(index.locate(31)).toBeUndefined();
    expect(index.locate(0)).toBeUndefined();
  });

  it('re-registering the same segment is idempotent; a changed range throws', () => {
    const seg = slice(1, 5);
    index.register(seg);
    index.register(seg); // no-op
    expect(index.stats().segments).toBe(1);
    expect(() => index.register({ ...seg, toSeq: 99 })).toThrow(/different range/);
  });

  it('locateTimeRange returns segments overlapping the window', () => {
    const s1 = slice(1, 5); // ts 1000..5000
    const s2 = slice(6, 10); // ts 6000..10000
    index.register(s1);
    index.register(s2);
    expect(index.locateTimeRange(3_000, 7_000).map((s) => s.id)).toEqual([s1.id, s2.id]);
    expect(index.locateTimeRange(20_000, 30_000)).toEqual([]);
    expect(index.locateTimeRange(500, 1_500).map((s) => s.id)).toEqual([s1.id]);
  });

  it('uncovered reports holes and the uncompacted tail', () => {
    index.register(slice(1, 5));
    index.register(slice(11, 15));
    expect(index.uncovered(20)).toEqual([
      { fromSeq: 6, toSeq: 10 },
      { fromSeq: 16, toSeq: 20 },
    ]);
  });

  it('continuity detects holes', () => {
    index.register(slice(1, 5));
    index.register(slice(11, 15));
    const c = index.continuity();
    expect(c.ok).toBe(false);
    expect(c.holes).toEqual([{ fromSeq: 6, toSeq: 10 }]);
    expect(c.firstSeq).toBe(1);
    expect(c.lastSeq).toBe(15);
  });

  it('continuity detects overlapping segments', () => {
    index.register(slice(1, 5));
    // Manually register an overlapping range (compactor prevents this;
    // index sees what a foreign writer would produce).
    const seg2 = slice(6, 10);
    index.register(seg2);
    const fake = { ...seg2, id: 'seg-fake', fromSeq: 3, toSeq: 8 };
    index.register(fake);
    const c = index.continuity();
    expect(c.ok).toBe(false);
    expect(c.overlaps.length).toBeGreaterThan(0);
  });

  it('clean tiling reports ok', () => {
    index.register(slice(1, 5));
    index.register(slice(6, 10));
    const c = index.continuity();
    expect(c.ok).toBe(true);
    expect(c.overlaps).toEqual([]);
    expect(c.holes).toEqual([]);
  });

  it('empty index yields an empty continuity report', () => {
    const c = index.continuity();
    expect(c.ok).toBe(true);
    expect(c.firstSeq).toBe(0);
    expect(c.lastSeq).toBe(0);
    expect(index.uncovered(10)).toEqual([{ fromSeq: 1, toSeq: 10 }]);
  });

  it('get() fetches by id; segments() lists sorted ids', () => {
    const s = slice(1, 3);
    index.register(s);
    expect(index.get(s.id)).toBe(s);
    expect(index.get('ghost')).toBeUndefined();
    expect(index.segments()).toEqual([s.id]);
  });

  it('stats reports covered seqs', () => {
    index.register(slice(1, 10));
    const s = index.stats();
    expect(s.segments).toBe(1);
    expect(s.coveredSeqs).toBe(10);
    expect(s.indexSizeBytes).toBe(40);
  });
});
