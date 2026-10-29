/**
 * Transactional Outbox
 *
 * Implements the transactional outbox pattern:
 * - **Record lifecycle**: PENDING → PROCESSING → SENT | FAILED
 *   (FAILED → PENDING on retry, FAILED stays terminal beyond maxAttempts)
 * - **Atomic batch claiming**: `claimBatch()` simulates
 *   `SELECT ... FOR UPDATE SKIP LOCKED` — records are atomically marked
 *   PROCESSING under a worker id so concurrent relays can't double-claim.
 *   In single-threaded JS the claim section is inherently atomic; the lease
 *   model additionally protects against worker crashes (claims expire and
 *   revert to PENDING).
 * - **Ordering**: records for the same aggregate are claimed and dispatched
 *   in aggregate-sequence order; a record is only eligible when all earlier
 *   records for the same aggregate are SENT.
 * - **At-least-once + idempotency**: dispatch uses the record's idempotency
 *   key; the relay's `dedupWindow` suppresses duplicate deliveries.
 * - **Cleanup**: sent records are purged after a retention TTL or when the
 *   store exceeds a size cap.
 *
 * Time model: `poll(now)` is driven by the caller — fully deterministic, no
 * timers inside the store itself (the relay optionally owns an interval).
 *
 * @module OutboxLayer/Implementations
 */

// ============================================================================
// Types
// ============================================================================

export type OutboxState = 'PENDING' | 'PROCESSING' | 'SENT' | 'FAILED';

/** A message parked in the outbox awaiting dispatch. */
export interface OutboxRecord<T = unknown> {
  /** Unique record id (also used as default idempotency key). */
  readonly id: string;
  /** Aggregate this message belongs to — ordering is per-aggregate. */
  readonly aggregateId: string;
  /** Per-aggregate sequence number (0-based, contiguous within aggregate). */
  readonly aggregateSeq: number;
  /** Destination: topic/queue/channel name. */
  readonly destination: string;
  /** Event/message type name. */
  readonly type: string;
  readonly payload: T;
  readonly headers: Readonly<Record<string, string>>;
  /** Idempotency key for downstream dedup. */
  readonly idempotencyKey: string;
  state: OutboxState;
  /** Worker id currently holding the claim (PROCESSING only). */
  claimedBy: string | null;
  /** When the current claim expires (ms epoch). */
  claimExpiresAt: number | null;
  /** Number of dispatch attempts so far. */
  attempts: number;
  readonly createdAt: number;
  /** When the record transitioned to SENT (ms epoch). */
  sentAt: number | null;
  /** Last error message (FAILED only). */
  lastError: string | null;
}

export interface OutboxStoreConfig {
  /** Claim lease duration; expired claims revert to PENDING. Default: 30s. */
  claimLeaseMs?: number;
  /** Max dispatch attempts before a record is permanently FAILED. */
  maxAttempts?: number;
  /** Retain SENT records this long before cleanup. Default: 1 hour. */
  sentRetentionMs?: number;
  /** Hard cap on total records; oldest SENT are purged first. */
  maxRecords?: number;
}

export interface ClaimResult<T> {
  readonly workerId: string;
  readonly claimed: OutboxRecord<T>[];
}

/** Result of a relay poll cycle. */
export interface PollStats {
  claimed: number;
  sent: number;
  failed: number;
  retried: number;
  skipped: number;
}

// ============================================================================
// The store
// ============================================================================

let nextRecordId = 0;

function genRecordId(): string {
  return `obr-${Date.now().toString(36)}-${(nextRecordId++).toString(36)}`;
}

/**
 * In-memory outbox table. In production this maps to a real table with
 * transactional writes in the same commit as the domain mutation; here the
 * caller is responsible for writing records atomically with their state
 * change (i.e. before committing the business transaction).
 */
export class OutboxStore<T = unknown> {
  private readonly _records = new Map<string, OutboxRecord<T>>();
  /** Per-aggregate next sequence number. */
  private readonly _seqByAggregate = new Map<string, number>();
  private readonly _config: Required<OutboxStoreConfig>;

  constructor(config: OutboxStoreConfig = {}) {
    this._config = {
      claimLeaseMs: config.claimLeaseMs ?? 30000,
      maxAttempts: config.maxAttempts ?? 10,
      sentRetentionMs: config.sentRetentionMs ?? 3600000,
      maxRecords: config.maxRecords ?? Number.MAX_SAFE_INTEGER,
    };
  }

  // ------------------------------------------------------------- writing

  /**
   * Stage a record for dispatch. Must be called inside the same (logical)
   * transaction as the domain mutation in a real system.
   *
   * Ordering: the record is assigned the next sequence number for its
   * aggregate automatically.
   */
  enqueue(input: {
    aggregateId: string;
    destination: string;
    type: string;
    payload: T;
    headers?: Record<string, string>;
    idempotencyKey?: string;
    now?: number;
  }): OutboxRecord<T> {
    const now = input.now ?? Date.now();
    const seq = this._seqByAggregate.get(input.aggregateId) ?? 0;
    this._seqByAggregate.set(input.aggregateId, seq + 1);

    const id = genRecordId();
    const record: OutboxRecord<T> = {
      id,
      aggregateId: input.aggregateId,
      aggregateSeq: seq,
      destination: input.destination,
      type: input.type,
      payload: input.payload,
      headers: { ...(input.headers ?? {}) },
      idempotencyKey: input.idempotencyKey ?? id,
      state: 'PENDING',
      claimedBy: null,
      claimExpiresAt: null,
      attempts: 0,
      createdAt: now,
      sentAt: null,
      lastError: null,
    };
    this._records.set(id, record);
    this._enforceMaxRecords();
    return { ...record };
  }

  /** Stage multiple records atomically (same logical transaction). */
  enqueueAll(
    inputs: ReadonlyArray<{
      aggregateId: string;
      destination: string;
      type: string;
      payload: T;
      headers?: Record<string, string>;
      idempotencyKey?: string;
    }>,
    now = Date.now()
  ): OutboxRecord<T>[] {
    return inputs.map((i) => this.enqueue({ ...i, now }));
  }

  // ------------------------------------------------------------- claiming

  /**
   * Atomically claim up to `batchSize` dispatchable records for `workerId`.
   *
   * A record is dispatchable iff:
   * - state is PENDING, or PROCESSING with an expired claim (crash recovery)
   * - it is the *oldest unsent* record for its aggregate (ordering)
   *
   * Emulates `SELECT ... FOR UPDATE SKIP LOCKED`.
   */
  claimBatch(workerId: string, batchSize: number, now = Date.now()): OutboxRecord<T>[] {
    // First, release any expired claims (a crashed worker's leftovers).
    this._releaseExpiredClaims(now);

    // Compute, per aggregate, the oldest record that is not SENT. Only that
    // record is eligible — and only if it is currently PENDING. A PROCESSING
    // or FAILED head-of-line record blocks the rest of its aggregate stream.
    const headByAggregate = new Map<string, OutboxRecord<T>>();
    for (const r of this._records.values()) {
      if (r.state === 'SENT') continue;
      const cur = headByAggregate.get(r.aggregateId);
      if (!cur || r.aggregateSeq < cur.aggregateSeq) {
        headByAggregate.set(r.aggregateId, r);
      }
    }
    const eligible: OutboxRecord<T>[] = [];
    for (const head of headByAggregate.values()) {
      if (head.state === 'PENDING') eligible.push(head);
    }

    // Sort by createdAt then seq for fairness across aggregates.
    eligible.sort(
      (a, b) => a.createdAt - b.createdAt || a.aggregateSeq - b.aggregateSeq
    );

    const claimed: OutboxRecord<T>[] = [];
    // --- Atomic claim section ---
    for (const r of eligible) {
      if (claimed.length >= batchSize) break;
      // Re-check state inside the "lock" (defensive; single-threaded anyway).
      const live = this._records.get(r.id);
      if (!live || live.state !== 'PENDING') continue;
      live.state = 'PROCESSING';
      live.claimedBy = workerId;
      live.claimExpiresAt = now + this._config.claimLeaseMs;
      claimed.push({ ...live });
    }
    return claimed;
  }

  /** Revert expired PROCESSING claims back to PENDING. */
  private _releaseExpiredClaims(now: number): number {
    let released = 0;
    for (const r of this._records.values()) {
      if (r.state === 'PROCESSING' && r.claimExpiresAt !== null && r.claimExpiresAt <= now) {
        r.state = 'PENDING';
        r.claimedBy = null;
        r.claimExpiresAt = null;
        released++;
      }
    }
    return released;
  }

  // ------------------------------------------------------- state changes

  /** Mark a claimed record as SENT. Only valid for the claiming worker. */
  markSent(recordId: string, workerId: string, now = Date.now()): boolean {
    const r = this._records.get(recordId);
    if (!r || r.state !== 'PROCESSING' || r.claimedBy !== workerId) return false;
    r.state = 'SENT';
    r.sentAt = now;
    r.claimedBy = null;
    r.claimExpiresAt = null;
    return true;
  }

  /**
   * Report a dispatch failure for a claimed record.
   * Attempts are incremented; below maxAttempts the record returns to
   * PENDING for retry, otherwise it transitions to FAILED (terminal).
   */
  markFailed(recordId: string, workerId: string, error: string): OutboxState | null {
    const r = this._records.get(recordId);
    if (!r || r.state !== 'PROCESSING' || r.claimedBy !== workerId) return null;
    r.attempts++;
    r.lastError = error;
    r.claimedBy = null;
    r.claimExpiresAt = null;
    if (r.attempts >= this._config.maxAttempts) {
      r.state = 'FAILED';
    } else {
      r.state = 'PENDING';
    }
    return r.state;
  }

  /** Release a claim without sending (worker decided not to dispatch). */
  releaseClaim(recordId: string, workerId: string): boolean {
    const r = this._records.get(recordId);
    if (!r || r.state !== 'PROCESSING' || r.claimedBy !== workerId) return false;
    r.state = 'PENDING';
    r.claimedBy = null;
    r.claimExpiresAt = null;
    return true;
  }

  /** Requeue a terminally FAILED record (manual operator action). */
  requeue(recordId: string): boolean {
    const r = this._records.get(recordId);
    if (!r || r.state !== 'FAILED') return false;
    r.state = 'PENDING';
    r.attempts = 0;
    r.lastError = null;
    return true;
  }

  // --------------------------------------------------------------- reads

  get(recordId: string): OutboxRecord<T> | undefined {
    const r = this._records.get(recordId);
    return r ? { ...r } : undefined;
  }

  /** Filter records by state / aggregate. */
  query(filter: {
    state?: OutboxState;
    aggregateId?: string;
    destination?: string;
    limit?: number;
  } = {}): OutboxRecord<T>[] {
    let out = [...this._records.values()];
    if (filter.state) out = out.filter((r) => r.state === filter.state);
    if (filter.aggregateId) out = out.filter((r) => r.aggregateId === filter.aggregateId);
    if (filter.destination) out = out.filter((r) => r.destination === filter.destination);
    out.sort((a, b) => a.createdAt - b.createdAt || a.aggregateSeq - b.aggregateSeq);
    if (filter.limit !== undefined) out = out.slice(0, filter.limit);
    return out.map((r) => ({ ...r }));
  }

  /** Count by state. */
  countByState(): Record<OutboxState, number> {
    const counts: Record<OutboxState, number> = {
      PENDING: 0,
      PROCESSING: 0,
      SENT: 0,
      FAILED: 0,
    };
    for (const r of this._records.values()) counts[r.state]++;
    return counts;
  }

  get size(): number {
    return this._records.size;
  }

  // -------------------------------------------------------------- cleanup

  /**
   * Purge SENT records older than `sentRetentionMs` and enforce `maxRecords`
   * (oldest SENT first, then oldest FAILED).
   * @returns number of records removed
   */
  cleanup(now = Date.now()): number {
    let removed = 0;
    const cutoff = now - this._config.sentRetentionMs;
    for (const [id, r] of this._records) {
      if (r.state === 'SENT' && r.sentAt !== null && r.sentAt < cutoff) {
        this._records.delete(id);
        removed++;
      }
    }
    removed += this._enforceMaxRecords();
    return removed;
  }

  private _enforceMaxRecords(): number {
    if (this._records.size <= this._config.maxRecords) return 0;
    // Evict SENT oldest-first, then FAILED, never PENDING/PROCESSING.
    const sent = [...this._records.values()]
      .filter((r) => r.state === 'SENT')
      .sort((a, b) => (a.sentAt ?? 0) - (b.sentAt ?? 0));
    const failed = [...this._records.values()]
      .filter((r) => r.state === 'FAILED')
      .sort((a, b) => a.createdAt - b.createdAt);
    let removed = 0;
    for (const r of [...sent, ...failed]) {
      if (this._records.size <= this._config.maxRecords) break;
      this._records.delete(r.id);
      removed++;
    }
    return removed;
  }
}

// ============================================================================
// The relay
// ============================================================================

export type OutboxDispatcher<T> = (record: OutboxRecord<T>) => Promise<void>;

export interface OutboxRelayConfig {
  readonly workerId?: string;
  readonly batchSize?: number;
  /** How often `start()` polls (ms). Only used by the timer-based loop. */
  readonly pollIntervalMs?: number;
  /** Bound on remembered idempotency keys. Default: 10000. */
  readonly dedupWindow?: number;
}

/**
 * Polling relay: claims batches from the store, dispatches them through the
 * provided dispatcher, and marks records SENT or failed accordingly.
 *
 * Idempotency: the relay tracks recently dispatched idempotency keys and
 * skips re-dispatching them — but still marks the record SENT so the log
 * drains (the downstream was already notified).
 */
export class OutboxRelay<T = unknown> {
  private readonly _workerId: string;
  private readonly _dedup = new Set<string>();
  private readonly _dedupOrder: string[] = [];
  private _timer: ReturnType<typeof setInterval> | null = null;
  private _running = false;
  private _totalPolls = 0;
  private _totalSent = 0;
  private _totalDuplicates = 0;

  constructor(
    private readonly _store: OutboxStore<T>,
    private readonly _dispatcher: OutboxDispatcher<T>,
    private readonly _config: OutboxRelayConfig = {}
  ) {
    this._workerId = _config.workerId ?? `relay-${Math.random().toString(36).slice(2, 8)}`;
  }

  get workerId(): string {
    return this._workerId;
  }

  /**
   * One poll cycle: claim a batch, dispatch each, mark results.
   * Deterministic — pass `now` explicitly in tests.
   */
  async poll(now = Date.now()): Promise<PollStats> {
    this._totalPolls++;
    const batch = this._store.claimBatch(
      this._workerId,
      this._config.batchSize ?? 100,
      now
    );
    const stats: PollStats = {
      claimed: batch.length,
      sent: 0,
      failed: 0,
      retried: 0,
      skipped: 0,
    };

    for (const record of batch) {
      if (this._dedup.has(record.idempotencyKey)) {
        // Already delivered downstream — just mark SENT to drain the log.
        this._store.markSent(record.id, this._workerId, now);
        this._totalDuplicates++;
        stats.skipped++;
        continue;
      }
      try {
        await this._dispatcher(record);
        this._store.markSent(record.id, this._workerId, now);
        this._rememberKey(record.idempotencyKey);
        this._totalSent++;
        stats.sent++;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        const state = this._store.markFailed(record.id, this._workerId, msg);
        if (state === 'FAILED') stats.failed++;
        else stats.retried++;
      }
    }
    return stats;
  }

  /** Start the interval-driven polling loop. */
  start(): void {
    if (this._running) return;
    this._running = true;
    const interval = this._config.pollIntervalMs ?? 1000;
    this._timer = setInterval(() => {
      void this.poll();
    }, interval);
    if (typeof this._timer === 'object' && this._timer !== null && 'unref' in this._timer) {
      (this._timer as { unref: () => void }).unref();
    }
  }

  stop(): void {
    this._running = false;
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = null;
    }
  }

  private _rememberKey(key: string): void {
    const window = this._config.dedupWindow ?? 10000;
    this._dedup.add(key);
    this._dedupOrder.push(key);
    if (this._dedupOrder.length > window) {
      const oldest = this._dedupOrder.shift();
      if (oldest !== undefined) this._dedup.delete(oldest);
    }
  }

  stats(): {
    workerId: string;
    totalPolls: number;
    totalSent: number;
    totalDuplicates: number;
    dedupSize: number;
    running: boolean;
  } {
    return {
      workerId: this._workerId,
      totalPolls: this._totalPolls,
      totalSent: this._totalSent,
      totalDuplicates: this._totalDuplicates,
      dedupSize: this._dedup.size,
      running: this._running,
    };
  }
}
