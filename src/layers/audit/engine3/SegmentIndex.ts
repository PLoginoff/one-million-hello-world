/**
 * Segment Index — Fast Locator over Compacted Segments
 *
 * `SegmentCompactor` stores segments; this is the read-side index
 * that answers the questions an auditor actually asks at segment
 * scale, without scanning every record:
 *
 *  - `locate(seq)`         — which segment holds record N? O(log S)
 *                           binary search over non-overlapping ranges
 *  - `locateTimeRange()`   — segments overlapping a timestamp window
 *  - `uncovered()`         — gap analysis over the seq space (like
 *                           AnchorRegistry but at segment granularity:
 *                           an unanchored record is suspicious, an
 *                           un*compacted* one is just unarchived)
 *  - `continuity()`        — do the segments tile the chain without
 *                           holes or overlaps?
 *
 * Segments are immutable once registered, so the index maintains a
 * sorted range list rebuilt on insert — a real deployment would use
 * an interval tree; at audit-segment cardinality (thousands), a
 * sorted array + binary search is simpler and fast enough.
 *
 * @module AuditLayer/Engine3
 */

import type { CompactedSegment } from './types3';
import { AuditClock3, SystemAuditClock3 } from './types3';

interface RangeEntry {
  segmentId: string;
  fromSeq: number;
  toSeq: number;
  firstTs: number;
  lastTs: number;
}

export interface SegmentGap {
  readonly fromSeq: number;
  readonly toSeq: number;
}

export interface ContinuityReport {
  readonly ok: boolean;
  /** Overlapping range pairs — evidence of double-compaction. */
  readonly overlaps: ReadonlyArray<{ a: string; b: string }>;
  /** Holes between consecutive segments. */
  readonly holes: readonly SegmentGap[];
  /** First covered seq; 0 when empty. */
  readonly firstSeq: number;
  /** Last covered seq; 0 when empty. */
  readonly lastSeq: number;
}

export class SegmentIndex {
  private readonly clock: AuditClock3;
  private ranges: RangeEntry[] = []; // kept sorted by fromSeq
  private readonly byId = new Map<string, CompactedSegment>();

  constructor(options: { clock?: AuditClock3 } = {}) {
    this.clock = options.clock ?? new SystemAuditClock3();
  }

  /**
   * Register a segment. Re-registering the same id is idempotent
   * (content unchanged); a different range under the same id throws.
   */
  register(segment: CompactedSegment): void {
    const existing = this.byId.get(segment.id);
    if (existing) {
      if (existing.fromSeq !== segment.fromSeq || existing.toSeq !== segment.toSeq) {
        throw new Error(`segment ${segment.id} re-registered with different range`);
      }
      return;
    }
    this.byId.set(segment.id, segment);
    const first = segment.records[0];
    const last = segment.records[segment.records.length - 1];
    const entry: RangeEntry = {
      segmentId: segment.id,
      fromSeq: segment.fromSeq,
      toSeq: segment.toSeq,
      firstTs: first?.timestamp ?? 0,
      lastTs: last?.timestamp ?? 0,
    };
    // Insert maintaining fromSeq order — O(S) shift, fine at segment counts.
    let i = this.ranges.length;
    while (i > 0 && this.ranges[i - 1]!.fromSeq > entry.fromSeq) i--;
    this.ranges.splice(i, 0, entry);
  }

  /**
   * Which segment holds `seq`? Binary search over sorted ranges —
   * O(log S). Undefined when the seq isn't in any registered segment.
   */
  locate(seq: number): CompactedSegment | undefined {
    let lo = 0;
    let hi = this.ranges.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      const r = this.ranges[mid]!;
      if (seq < r.fromSeq) hi = mid;
      else if (seq > r.toSeq) lo = mid + 1;
      else return this.byId.get(r.segmentId);
    }
    return undefined;
  }

  /** Segments whose records overlap [fromTs, toTs]. */
  locateTimeRange(fromTs: number, toTs: number): readonly CompactedSegment[] {
    return this.ranges
      .filter((r) => r.lastTs >= fromTs && r.firstTs <= toTs)
      .map((r) => this.byId.get(r.segmentId)!);
  }

  /**
   * Seq gaps in [1, throughSeq] not covered by any segment — the
   * uncompacted tail plus any holes inside the archive.
   */
  uncovered(throughSeq: number): readonly SegmentGap[] {
    const gaps: SegmentGap[] = [];
    let cursor = 1;
    for (const r of this.ranges) {
      if (r.fromSeq > cursor) gaps.push({ fromSeq: cursor, toSeq: r.fromSeq - 1 });
      cursor = Math.max(cursor, r.toSeq + 1);
      if (cursor > throughSeq) return gaps;
    }
    if (cursor <= throughSeq) gaps.push({ fromSeq: cursor, toSeq: throughSeq });
    return gaps;
  }

  /**
   * Do segments tile the chain? Reports overlaps (double-compaction
   * evidence) and holes (missing ranges).
   */
  continuity(): ContinuityReport {
    const overlaps: { a: string; b: string }[] = [];
    const holes: SegmentGap[] = [];
    for (let i = 1; i < this.ranges.length; i++) {
      const prev = this.ranges[i - 1]!;
      const cur = this.ranges[i]!;
      if (cur.fromSeq <= prev.toSeq) {
        overlaps.push({ a: prev.segmentId, b: cur.segmentId });
      } else if (cur.fromSeq > prev.toSeq + 1) {
        holes.push({ fromSeq: prev.toSeq + 1, toSeq: cur.fromSeq - 1 });
      }
    }
    return {
      ok: overlaps.length === 0 && holes.length === 0,
      overlaps,
      holes,
      firstSeq: this.ranges[0]?.fromSeq ?? 0,
      lastSeq: this.ranges[this.ranges.length - 1]?.toSeq ?? 0,
    };
  }

  /** Fetch by segment id. */
  get(id: string): CompactedSegment | undefined {
    return this.byId.get(id);
  }

  /** Sorted ranges (id list). */
  segments(): readonly string[] {
    return this.ranges.map((r) => r.segmentId);
  }

  stats(): { segments: number; coveredSeqs: number; indexSizeBytes: number } {
    let covered = 0;
    for (const r of this.ranges) covered += r.toSeq - r.fromSeq + 1;
    return {
      segments: this.ranges.length,
      coveredSeqs: covered,
      indexSizeBytes: this.ranges.length * 40, // rough per-entry estimate
    };
  }
}
