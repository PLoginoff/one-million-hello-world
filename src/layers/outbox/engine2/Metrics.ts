/**
 * Outbox Metrics
 *
 * The two numbers an on-call engineer opens with: how old is the
 * oldest pending record per partition (backlog health — a growing age
 * means the relay is losing the race) and how fast records are flowing
 * through (throughput over a sliding window).
 *
 * Age metrics read the record set directly — O(R) per scan, run on the
 * metrics cadence not per record. Throughput keeps a rolling window of
 * `(at, count)` send events in a small deque; per-report cost is O(W)
 * where W = events inside the window, and eviction is a prefix drop.
 *
 * @module OutboxLayer/Engine2
 */

import {
  OutboxClock2,
  OutboxEntry,
  PartitionMetrics,
  SystemOutboxClock2,
  ThroughputWindow,
} from './types';
import { belongsTo } from './Sharding';

export interface MetricsRecord extends OutboxEntry {
  readonly state: 'pending' | 'processing' | 'sent' | 'failed' | 'archived';
}

export class OutboxMetrics {
  private readonly _clock: OutboxClock2;
  private readonly _windowMs: number;
  /** Ascending send events: (at, partition). Deque-style prefix drop. */
  private readonly _sends: Array<{ at: number; partition: number }> = [];

  constructor(clock: OutboxClock2 = new SystemOutboxClock2(), windowMs = 60_000) {
    this._clock = clock;
    this._windowMs = windowMs;
  }

  /** Record that `count` records were sent from `partition` now. */
  recordSent(partition: number, count = 1): void {
    for (let i = 0; i < count; i++) {
      this._sends.push({ at: this._clock.now(), partition });
    }
    this._evict();
  }

  /**
   * Per-partition backlog scan. `oldestPendingAgeMs` reads the minimum
   * `enqueuedAt` among pending records — the age that matters because
   * ordering makes everything behind the oldest record wait anyway.
   */
  partition(partition: number, shardCount: number, records: readonly MetricsRecord[]): PartitionMetrics {
    const now = this._clock.now();
    let pending = 0;
    let processing = 0;
    let oldest: number | null = null;
    const aggregates = new Set<string>();
    for (const r of records) {
      if (!belongsTo(r.aggregateId, partition, shardCount)) continue;
      if (r.state === 'pending') {
        pending++;
        aggregates.add(r.aggregateId);
        if (oldest === null || r.enqueuedAt < oldest) oldest = r.enqueuedAt;
      } else if (r.state === 'processing') {
        processing++;
      }
    }
    return {
      partition,
      pending,
      processing,
      oldestPendingAgeMs: oldest === null ? null : now - oldest,
      backedUpAggregates: aggregates.size,
    };
  }

  /** Whole-outbox backlog: pending across every record passed in. */
  totalPending(records: readonly MetricsRecord[]): {
    pending: number;
    oldestPendingAgeMs: number | null;
  } {
    const now = this._clock.now();
    let pending = 0;
    let oldest: number | null = null;
    for (const r of records) {
      if (r.state !== 'pending') continue;
      pending++;
      if (oldest === null || r.enqueuedAt < oldest) oldest = r.enqueuedAt;
    }
    return { pending, oldestPendingAgeMs: oldest === null ? null : now - oldest };
  }

  /**
   * Sliding-window throughput. The window is `(now - windowMs, now]`;
   * events older than that are evicted lazily on read.
   */
  throughput(partition?: number): ThroughputWindow {
    this._evict();
    const count = this._sends.reduce(
      (n, s) => (partition === undefined || s.partition === partition ? n + 1 : n),
      0
    );
    return {
      windowMs: this._windowMs,
      sent: count,
      perMs: count / this._windowMs,
      perSecond: (count * 1000) / this._windowMs,
    };
  }

  private _evict(): void {
    const cutoff = this._clock.now() - this._windowMs;
    let drop = 0;
    while (drop < this._sends.length) {
      const s = this._sends[drop];
      if (s === undefined || s.at > cutoff) break;
      drop++;
    }
    if (drop > 0) this._sends.splice(0, drop);
  }
}
