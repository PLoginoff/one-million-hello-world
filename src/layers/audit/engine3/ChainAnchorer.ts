/**
 * Chain Anchorer — Rolling Seal-and-Notarize Pipeline
 *
 * The operational glue that turns the engine3 primitives into a
 * scheduled integrity workflow:
 *
 *     append → buffer → (size | time threshold) → verify → Merkle
 *     anchor → optional compact → retain proof index
 *
 * A real audit pipeline can't anchor per record (anchor calls are
 * expensive — a ledger write, an RFC 3161 request). Instead, records
 * accumulate in a pending buffer; when the buffer reaches
 * `batchSize` records or `maxDelayMs` has elapsed since the first
 * pending record, the anchorer:
 *
 *  1. verifies the pending chain segment against the last anchored
 *     tip hash (continuity proof — a missing or reordered record
 *     breaks the segment link, not just the record hash),
 *  2. notarizes the range via `Notarizer`,
 *  3. optionally compacts it via `SegmentCompactor` for archival,
 *  4. advances the anchored tip.
 *
 * Any verification failure raises a `ChainIntegrityError` carrying
 * the offending seq — the anchorer refuses to seal a broken chain,
 * because an anchor over tampered records would launder the
 * tampering into an external witness.
 *
 * Records arrive through `ingest()` which delegates to an
 * `AuditStore` for sealing (the store owns seq+hash assignment), then
 * fans the sealed record out to the pending buffer and the alert
 * streamer.
 *
 * Complexity: ingest O(1) + publish O(S); flush O(N) for N pending.
 *
 * @module AuditLayer/Engine3
 */

import type { AuditEventInput, AuditRecord } from '../engine/types';
import type { AuditStore } from '../engine/AuditStore';
import { computeRecordHash, GENESIS_HASH } from '../engine/HashChain';

// computeRecordHash is used in verifySegment below.
import type { Notarizer } from './Notarizer';
import type { SegmentCompactor } from './SegmentCompactor';
import type { AuditAlertStreamer } from './AlertStreamer';
import {
  AuditClock3,
  CompactedSegment,
  NotarizationAnchor,
  SystemAuditClock3,
} from './types3';

/** Raised when a pending segment fails continuity/hash verification. */
export class ChainIntegrityError extends Error {
  constructor(
    message: string,
    readonly firstBadSeq: number | undefined
  ) {
    super(message);
    this.name = 'ChainIntegrityError';
  }
}

export interface AnchorerOptions {
  readonly clock?: AuditClock3;
  /** Records per anchor batch (default 100). */
  readonly batchSize?: number;
  /**
   * Max ms the oldest pending record may wait before an anchor is
   * forced — bounds the "trust window" between seals (default 5 min).
   */
  readonly maxDelayMs?: number;
  /** Compact each anchored range for archival (default false). */
  readonly compact?: boolean;
}

export interface AnchorCycle {
  readonly anchor: NotarizationAnchor;
  readonly recordsAnchored: number;
  readonly segment?: CompactedSegment;
  /** Wall-clock span the batch covered (last-first record ts). */
  readonly spanMs: number;
}

export interface AnchorerStatus {
  /** Records awaiting anchoring. */
  readonly pending: number;
  /** First pending record seq, if any. */
  readonly pendingFromSeq?: number;
  /** Chain tip hash the next anchor must link to. */
  readonly lastAnchoredTip: string;
  /** Anchors sealed so far. */
  readonly anchorsSealed: number;
  /** Records anchored in total. */
  readonly recordsAnchored: number;
  /** Segments produced (when compaction enabled). */
  readonly segments: number;
  /** Whether a flush is currently due (size or time threshold hit). */
  readonly flushDue: boolean;
}

export class ChainAnchorer {
  private readonly clock: AuditClock3;
  private readonly batchSize: number;
  private readonly maxDelayMs: number;
  private readonly compactEnabled: boolean;
  private pending: AuditRecord[] = [];
  private firstPendingAt = 0;
  private lastAnchoredTip = GENESIS_HASH;
  private recordsAnchored = 0;
  private readonly cycles: AnchorCycle[] = [];

  constructor(
    private readonly store: AuditStore,
    private readonly notarizer: Notarizer,
    private readonly compactor: SegmentCompactor | null = null,
    private readonly streamer: AuditAlertStreamer | null = null,
    options: AnchorerOptions = {}
  ) {
    this.clock = options.clock ?? new SystemAuditClock3();
    this.batchSize = options.batchSize ?? 100;
    this.maxDelayMs = options.maxDelayMs ?? 5 * 60 * 1000;
    this.compactEnabled = options.compact ?? false;
    if (this.batchSize <= 0) throw new Error('batchSize must be positive');
    if (this.maxDelayMs <= 0) throw new Error('maxDelayMs must be positive');
  }

  /**
   * Seal an event into the store, buffer it for the next anchor
   * cycle, and fan it out to the alert streamer. Returns the sealed
   * record. If the batch threshold is reached, `flush()` runs inline —
   * callers that need latency isolation should call `tick()` on a
   * timer and keep `batchSize` generous instead.
   */
  async ingest(input: AuditEventInput): Promise<AuditRecord> {
    const record = this.store.append(input);
    this.buffer(record);
    this.streamer?.publish(record);
    if (this.pending.length >= this.batchSize) {
      await this.flush();
    }
    return record;
  }

  /** Buffer a pre-sealed record (e.g. recovered from a replica). */
  buffer(record: AuditRecord): void {
    if (this.pending.length === 0) this.firstPendingAt = this.clock.now();
    this.pending.push(record);
  }

  /**
   * Time-based flush check — call on a timer. Anchors when the
   * oldest pending record has waited beyond `maxDelayMs`.
   */
  async tick(): Promise<AnchorCycle | undefined> {
    if (this.pending.length === 0) return undefined;
    if (this.clock.now() - this.firstPendingAt < this.maxDelayMs) return undefined;
    return this.flush();
  }

  /** Whether a flush is due right now (size or age). */
  flushDue(): boolean {
    if (this.pending.length === 0) return false;
    if (this.pending.length >= this.batchSize) return true;
    return this.clock.now() - this.firstPendingAt >= this.maxDelayMs;
  }

  /**
   * Anchor everything pending: verify segment continuity against the
   * last anchored tip, notarize the range, optionally compact it.
   *
   * @throws ChainIntegrityError when the pending segment does not
   *         chain cleanly from the last anchor.
   */
  async flush(): Promise<AnchorCycle | undefined> {
    if (this.pending.length === 0) return undefined;
    const segment = this.pending;
    this.pending = [];

    // Continuity check: the segment's first record must link to the
    // last anchored tip (or genesis), and the segment must chain
    // internally. verifyChain expects genesis linkage, so we verify
    // linkage manually then hash-integrity per record.
    this.verifySegment(segment, this.lastAnchoredTip);

    // Capture the tip this segment links to BEFORE advancing it.
    const anchoredTip = this.lastAnchoredTip;
    const anchor = await this.notarizer.anchorRange(segment);
    this.lastAnchoredTip = segment[segment.length - 1]!.hash;
    this.recordsAnchored += segment.length;

    let compacted: CompactedSegment | undefined;
    if (this.compactEnabled && this.compactor) {
      compacted =
        segment[0]!.seq === 1
          ? this.compactor.compact(segment).segment
          : this.compactor.compact(segment, anchoredTip).segment;
    }

    const cycle: AnchorCycle = {
      anchor,
      recordsAnchored: segment.length,
      segment: compacted,
      spanMs: segment[segment.length - 1]!.timestamp - segment[0]!.timestamp,
    };
    this.cycles.push(cycle);
    return cycle;
  }


  /**
   * Segment verification: first record links to expected tip, each
   * record's hash recomputes, each previousHash chains.
   */
  private verifySegment(segment: readonly AuditRecord[], expectedTip: string): void {
    let expected = expectedTip;
    for (const r of segment) {
      if (r.previousHash !== expected) {
        throw new ChainIntegrityError(
          `chain break at seq ${r.seq}: previousHash does not match anchored tip`,
          r.seq
        );
      }
      const { hash, ...rest } = r;
      if (computeRecordHash(rest) !== hash) {
        throw new ChainIntegrityError(`record hash mismatch at seq ${r.seq}`, r.seq);
      }
      expected = hash;
    }
  }

  /** Snapshot of operational status. */
  status(): AnchorerStatus {
    return {
      pending: this.pending.length,
      pendingFromSeq: this.pending[0]?.seq,
      lastAnchoredTip: this.lastAnchoredTip,
      anchorsSealed: this.cycles.length,
      recordsAnchored: this.recordsAnchored,
      segments: this.cycles.filter((c) => c.segment !== undefined).length,
      flushDue: this.flushDue(),
    };
  }

  /** All completed anchor cycles. */
  history(): readonly AnchorCycle[] {
    return this.cycles;
  }
}

