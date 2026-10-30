/**
 * Partitioned Relay Loop
 *
 * The operational heartbeat that ties the engine2 modules together:
 * each relay process owns (partition, shardCount), acquires partition
 * leadership through the election stub, claims its shard's pending
 * records, dispatches them and settles the claims — while feeding
 * metrics and the FIFO verifier.
 *
 * `poll()` is one deterministic cycle:
 *   1. Renew/acquire the partition lease; fenced-out → idle cycle.
 *   2. Claim pending records owned by this shard, per-aggregate FIFO:
 *      a record is eligible only when every earlier seq of its
 *      aggregate is already `sent` (the same gate as the underlying
 *      outbox store — verified here independently because a broken
 *      gate is exactly what the verifier exists to catch).
 *   3. Dispatch each claimed record through `dispatcher`; success →
 *      `sent`, failure → back to `pending` with attempts+1.
 *   4. Record sends in metrics; run the verifier over the post-state.
 *
 * Ordering inside a batch is seq-ascending per aggregate and
 * claim-order across aggregates (claim = enqueuedAt order) — matching
 * how a single-relay store behaves, so sharded relays produce the
 * same per-aggregate order.
 *
 * @module OutboxLayer/Engine2
 */

import { MetricsRecord, OutboxMetrics } from './Metrics';
import { LeaderElection } from './LeaderElection';
import { forShard } from './Sharding';
import { verify, verifyDispatch } from './FifoVerifier';
import { OrderReport, OutboxClock2, OutboxEntry, SystemOutboxClock2 } from './types';

export interface RelayStore {
  /** Pending entries owned by the store (all shards). */
  pending(): MetricsRecord[];
  /** Claim a pending record; returns false if already claimed. */
  claim(id: string, workerId: string): boolean;
  /** Settle a claim as sent. */
  sent(id: string): void;
  /** Return a claim to pending after a failed dispatch. */
  release(id: string): void;
}

export type Dispatcher = (record: OutboxEntry) => Promise<void> | void;

export interface PollOutcome {
  readonly partition: number;
  /** True when this relay held leadership for the cycle. */
  readonly led: boolean;
  readonly claimed: number;
  readonly sent: number;
  readonly failed: number;
  readonly order: OrderReport;
}

export class RelayLoop {
  private readonly _store: RelayStore;
  private readonly _election: LeaderElection;
  private readonly _metrics: OutboxMetrics;
  private readonly _clock: OutboxClock2;
  private readonly _workerId: string;
  private readonly _partition: number;
  private readonly _shardCount: number;
  private _token: number | null = null;
  /** Per-record dispatch attempts by this relay (retry bookkeeping). */
  private readonly _attempts = new Map<string, number>();

  constructor(
    store: RelayStore,
    election: LeaderElection,
    metrics: OutboxMetrics,
    partition: number,
    shardCount: number,
    workerId: string,
    clock: OutboxClock2 = new SystemOutboxClock2()
  ) {
    this._store = store;
    this._election = election;
    this._metrics = metrics;
    this._partition = partition;
    this._shardCount = shardCount;
    this._workerId = workerId;
    this._clock = clock;
  }

  get workerId(): string {
    return this._workerId;
  }

  /**
   * One relay cycle. Acquiring or renewing leadership is attempted
   * first — a fenced-out relay reports `led:false` and touches nothing,
   * which is the whole point of the fencing token.
   */
  async poll(dispatcher: Dispatcher): Promise<PollOutcome> {
    // 1. Leadership: renew if held, acquire if free/lapsed.
    if (this._token !== null && this._election.check(this._partition, this._token)) {
      this._election.renew(this._partition, this._workerId, this._token);
    } else {
      try {
        const g = this._election.acquire(this._partition, this._workerId);
        this._token = g.fencingToken;
      } catch {
        this._token = null;
        return this._outcome(0, 0, 0, false);
      }
    }

    // 2. Claim this shard's eligible records: seq-ascending per
    //    aggregate, enqueuedAt order across aggregates.
    const candidates = forShard(this._store.pending(), this._partition, this._shardCount);
    const byAggregate = new Map<string, MetricsRecord[]>();
    for (const r of candidates) {
      const list = byAggregate.get(r.aggregateId) ?? [];
      list.push(r);
      byAggregate.set(r.aggregateId, list);
    }
    const eligible: MetricsRecord[] = [];
    for (const recs of byAggregate.values()) {
      recs.sort((a, b) => a.aggregateSeq - b.aggregateSeq || a.enqueuedAt - b.enqueuedAt);
      // Only claim up to the first non-contiguous seq — a gap means an
      // earlier record is elsewhere (in-flight or failed) and must
      // settle first.
      let expected = recs[0]?.aggregateSeq ?? 0;
      for (const r of recs) {
        if (r.aggregateSeq !== expected) break;
        eligible.push(r);
        expected++;
      }
    }
    eligible.sort((a, b) => a.enqueuedAt - b.enqueuedAt);

    // 3. Dispatch each claim.
    let sent = 0;
    let failed = 0;
    const dispatched: Array<{ aggregateId: string; aggregateSeq: number }> = [];
    for (const r of eligible) {
      if (!this._store.claim(r.id, this._workerId)) continue;
      this._attempts.set(r.id, (this._attempts.get(r.id) ?? 0) + 1);
      try {
        await dispatcher(r);
        this._store.sent(r.id);
        dispatched.push({ aggregateId: r.aggregateId, aggregateSeq: r.aggregateSeq });
        sent++;
      } catch {
        this._store.release(r.id);
        failed++;
      }
    }
    this._metrics.recordSent(this._partition, sent);

    // 4. Verify ordering on the dispatched stream + the post-state.
    const stream = verifyDispatch(dispatched);
    const post = verify(this._store.pending());
    const order: OrderReport = {
      ok: stream.ok && post.ok,
      violations: [...stream.violations, ...post.violations],
      aggregatesChecked: stream.aggregatesChecked + post.aggregatesChecked,
    };
    return this._outcome(eligible.length, sent, failed, true, order);
  }

  /** Attempts this relay has made on a record. */
  attempts(id: string): number {
    return this._attempts.get(id) ?? 0;
  }

  private _outcome(
    claimed: number,
    sent: number,
    failed: number,
    led: boolean,
    order?: OrderReport
  ): PollOutcome {
    return {
      partition: this._partition,
      led,
      claimed,
      sent,
      failed,
      order: order ?? { ok: true, violations: [], aggregatesChecked: 0 },
    };
  }
}
