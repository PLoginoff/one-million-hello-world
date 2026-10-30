/**
 * Outbox Engine2 — Shared Types
 *
 * Second-generation outbox operations: partition sharding by aggregate
 * (parallel relays without ordering collisions), a leader-election stub
 * (one active relay per partition), outbox metrics (age of oldest
 * pending, relay throughput), per-aggregate FIFO verification, and
 * cleanup policies (archive-then-purge of processed records).
 *
 * These modules sit above the record store: they reason about
 * partitions, claims, sequences and retention — never about transports.
 * Time is injected everywhere it matters.
 *
 * @module OutboxLayer/Engine2
 */

// ---------------------------------------------------------------------------
// Clock
// ---------------------------------------------------------------------------

export interface OutboxClock2 {
  now(): number;
}

export class SystemOutboxClock2 implements OutboxClock2 {
  now(): number {
    return Date.now();
  }
}

export class ManualOutboxClock2 implements OutboxClock2 {
  private _t: number;
  constructor(start: number = 0) {
    this._t = start;
  }
  now(): number {
    return this._t;
  }
  advance(ms: number): void {
    this._t += ms;
  }
  set(ms: number): void {
    this._t = ms;
  }
}

// ---------------------------------------------------------------------------
// Records
// ---------------------------------------------------------------------------

/**
 * The record shape engine2 needs — a superset of the fields the
 * operational features read. Storage stays owned by the caller; these
 * modules wrap it.
 */
export interface OutboxEntry {
  readonly id: string;
  readonly aggregateId: string;
  /** Per-aggregate sequence (contiguous per aggregate). */
  readonly aggregateSeq: number;
  readonly destination: string;
  readonly type: string;
  readonly payload: unknown;
  readonly enqueuedAt: number;
}

export type EntryState = 'pending' | 'processing' | 'sent' | 'failed' | 'archived';

// ---------------------------------------------------------------------------
// Sharding
// ---------------------------------------------------------------------------

export interface ShardAssignment {
  readonly shard: number;
  readonly shardCount: number;
}

// ---------------------------------------------------------------------------
// Leader election
// ---------------------------------------------------------------------------

export interface LeadershipGrant {
  readonly partition: number;
  readonly workerId: string;
  readonly grantedAt: number;
  readonly leaseUntil: number;
  /** Monotonic fencing token — every grant gets a strictly larger one. */
  readonly fencingToken: number;
}

// ---------------------------------------------------------------------------
// Metrics
// ---------------------------------------------------------------------------

export interface PartitionMetrics {
  readonly partition: number;
  readonly pending: number;
  readonly processing: number;
  /** Age in ms of the oldest pending record; null when none pending. */
  readonly oldestPendingAgeMs: number | null;
  /** Distinct aggregates currently backed up. */
  readonly backedUpAggregates: number;
}

export interface ThroughputWindow {
  readonly windowMs: number;
  readonly sent: number;
  /** sent/windowMs — messages per millisecond. */
  readonly perMs: number;
  /** sent*1000/windowMs — the headline "per second" number. */
  readonly perSecond: number;
}

// ---------------------------------------------------------------------------
// FIFO verification
// ---------------------------------------------------------------------------

export type OrderViolation =
  | {
      readonly kind: 'gap';
      readonly aggregateId: string;
      /** Expected next seq at the point of the gap. */
      readonly expected: number;
      /** The seq actually found next. */
      readonly found: number;
    }
  | {
      readonly kind: 'duplicate';
      readonly aggregateId: string;
      readonly seq: number;
      readonly ids: readonly string[];
    }
  | {
      /** A later seq was sent before an earlier pending one. */
      readonly kind: 'inversion';
      readonly aggregateId: string;
      readonly sentSeq: number;
      readonly pendingSeq: number;
    };

export interface OrderReport {
  readonly ok: boolean;
  readonly violations: readonly OrderViolation[];
  readonly aggregatesChecked: number;
}

// ---------------------------------------------------------------------------
// Cleanup
// ---------------------------------------------------------------------------

export interface ArchivePolicy {
  /** Records in `sent` state older than this are archived. */
  readonly sentRetentionMs: number;
  /**
   * Archived records older than this are purged for real
   * (in-memory: dropped). Omit to keep the archive forever.
   */
  readonly archiveRetentionMs?: number;
  /** Failed records older than this are archived too (they are terminal). */
  readonly failedRetentionMs?: number;
}

export interface CleanupReport {
  readonly archived: number;
  readonly purged: number;
  readonly retained: number;
  readonly archiveDepth: number;
}
