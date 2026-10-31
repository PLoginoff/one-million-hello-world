/**
 * ReadModelReplication — primary read store → read replica shipping.
 *
 * The CQRS read side scales two ways: shard the model (ShardedReadModel)
 * or clone it (replicas). Replication here copies *projection ops* —
 * the same `ProjectionOp` stream the primary applies — plus the
 * checkpoint that says "everything up to position P is in". Shipping
 * ops rather than documents keeps replicas byte-identical to the
 * primary without a full dump: an op is small, ordered, and idempotent.
 *
 * Pull model (same reasoning as the event-store replicator): the replica
 * owns its cursor — `position` in the projection's op stream — so a
 * restarted replica resumes without the primary tracking subscribers.
 *
 * Semantics:
 *   - Ops are keyed by a monotonically increasing `seq` assigned by the
 *     journal on the primary (`ReplicationJournal.append`). That seq —
 *     not the domain event position — is the replication cursor, because
 *     batches may interleave several domain positions.
 *   - `ReplicaReadStore.apply(ops)` is idempotent and gap-checked: a
 *     hole throws (never silently skip; a missing op means a diverged
 *     replica), a re-delivered seq is ignored.
 *   - Checkpoint ships WITH the op: `apply` moves the replica's
 *     checkpoint to the op's `position` after applying, so replica-side
 *     staleness means "how far behind the journal", the same metric a
 *     `ConsistencyMonitor` reads on the primary.
 *
 * `ReadReplica` wraps a `ReadModelStore` and adds the cursor/idempotency
 * layer — replicas ARE `ReadModelStore`s underneath, so any code that
 * queries the primary works unchanged against a replica.
 *
 * @module CqrsLayer/Engine
 */

import { ProjectionOp } from '../implementations/Denormalizer';
import { ReadModelStore, ReadModelDocument } from './ReadModelStore';
import { IClock, SystemClock } from '../../observability/engine/signals';

// ---------------------------------------------------------------------
// Journal entry
// ---------------------------------------------------------------------

/**
 * One replicated unit: the ops a projection emitted for a domain event,
 * plus the domain `position` that becomes the replica's checkpoint.
 */
export interface ReplicationEntry {
  /** Journal sequence — the replica cursor (contiguous, 0-based). */
  readonly seq: number;
  /** Projection that produced the ops. */
  readonly projection: string;
  /** Read model the ops target. */
  readonly model: string;
  /** Domain event position these ops came from → replica checkpoint. */
  readonly position: number;
  readonly ops: readonly ProjectionOp[];
  readonly journaledAt: number;
}

// ---------------------------------------------------------------------
// Primary-side journal
// ---------------------------------------------------------------------

/**
 * Append-only op journal on the primary. `DenormalizerPipeline` applies
 * ops to the primary `ReadModelStore` and journals them here in the same
 * step (`capture`). Replicas pull ranges.
 *
 * In-memory ring with a capacity bound — a real deployment maps this to
 * a WAL or a Kafka compacted topic. Capacity drops the OLDEST entries:
 * a replica that falls behind the retained window must rebuild
 * (`ReplicationGapError` surfaces that explicitly).
 */
export class ReplicationJournal {
  private _entries: ReplicationEntry[] = [];
  private _nextSeq = 0;
  private readonly _capacity: number;
  private readonly _clock: IClock;
  /** seq of the first retained entry (== _nextSeq - _entries.length). */
  private get _baseSeq(): number {
    return this._nextSeq - this._entries.length;
  }

  constructor(options: { capacity?: number; clock?: IClock } = {}) {
    this._capacity = Math.max(1, options.capacity ?? 10_000);
    this._clock = options.clock ?? new SystemClock();
  }

  /**
   * Record the ops a projection emitted for a domain position. Call this
   * from the same code path that applies them to the primary store —
   * journal + apply must be one logical step or replicas see a state the
   * primary never had (or miss one it did).
   */
  append(
    projection: string,
    model: string,
    position: number,
    ops: readonly ProjectionOp[]
  ): ReplicationEntry {
    const entry: ReplicationEntry = {
      seq: this._nextSeq++,
      projection,
      model,
      position,
      ops,
      journaledAt: this._clock.nowMs(),
    };
    this._entries.push(entry);
    if (this._entries.length > this._capacity) {
      this._entries.splice(0, this._entries.length - this._capacity);
    }
    return entry;
  }

  /**
   * Pull entries with seq >= `fromSeq`, oldest first.
   * @throws ReplicationGapError if `fromSeq` is below the retained window
   *         (replica too far behind — must rebuild, can't catch up).
   */
  pull(fromSeq: number, limit = 1000): { entries: ReplicationEntry[]; nextSeq: number } {
    if (fromSeq < this._baseSeq) {
      throw new ReplicationGapError(fromSeq, this._baseSeq);
    }
    const offset = fromSeq - this._baseSeq;
    const slice = this._entries.slice(offset, offset + limit);
    const next = slice.length ? slice[slice.length - 1].seq + 1 : fromSeq;
    return { entries: slice, nextSeq: next };
  }

  /** Highest seq + 1 (the "head" a replica's lag is measured against). */
  head(): number {
    return this._nextSeq;
  }

  /** Oldest retained seq — replicas must be >= this to catch up. */
  baseSeq(): number {
    return this._baseSeq;
  }

  size(): number {
    return this._entries.length;
  }
}

export class ReplicationGapError extends Error {
  readonly requested: number;
  readonly available: number;
  constructor(requested: number, available: number) {
    super(
      `replication gap: replica requested seq ${requested} but the journal ` +
        `only retains from ${available} — replica must rebuild`
    );
    this.name = 'ReplicationGapError';
    this.requested = requested;
    this.available = available;
  }
}

// ---------------------------------------------------------------------
// Replica
// ---------------------------------------------------------------------

/**
 * A read replica: a `ReadModelStore` plus a replication cursor.
 *
 * Applies `ReplicationEntry`s in seq order. Checkpoints move with each
 * entry's domain `position` — the replica's `checkpoint()` answers the
 * same "how far into the event stream" question as the primary's, which
 * is what makes staleness comparable across the two.
 */
export class ReplicaReadStore {
  private readonly _store = new ReadModelStore();
  private _cursor = 0;
  private _applied = 0;
  private _skipped = 0;
  private readonly _clock: IClock;
  private _lastAppliedAt = -1;

  constructor(clock: IClock = new SystemClock()) {
    this._clock = clock;
  }

  /** The underlying queryable store. */
  get store(): ReadModelStore {
    return this._store;
  }

  /** Next journal seq this replica expects. */
  get cursor(): number {
    return this._cursor;
  }

  get lastAppliedAt(): number {
    return this._lastAppliedAt;
  }

  /**
   * Apply pulled entries. Idempotent (seq < cursor skipped) and
   * gap-checked (seq > cursor throws — a hole means the replica missed
   * entries and would silently diverge).
   */
  apply(entries: readonly ReplicationEntry[]): { applied: number; skipped: number } {
    let applied = 0;
    let skipped = 0;
    for (const e of entries) {
      if (e.seq < this._cursor) {
        skipped++;
        continue;
      }
      if (e.seq > this._cursor) {
        throw new ReplicationGapError(this._cursor, e.seq);
      }
      // Model must exist on the replica — declare lazily like the
      // primary's registerModel (ops for an unknown model are a bug, not
      // a replication concern, so surface as such).
      this._store.applyBatch(e.projection, e.position, e.model, [...e.ops]);
      this._cursor = e.seq + 1;
      applied++;
    }
    if (applied > 0) this._lastAppliedAt = this._clock.nowMs();
    this._applied += applied;
    this._skipped += skipped;
    return { applied, skipped };
  }

  get appliedCount(): number {
    return this._applied;
  }

  get skippedCount(): number {
    return this._skipped;
  }

  /** Query passthroughs — a replica answers the same reads the primary does. */
  get(model: string, id: string): ReadModelDocument | undefined {
    return this._store.get(model, id);
  }

  findBy(model: string, field: string, value: unknown): ReadModelDocument[] {
    return this._store.findBy(model, field, value);
  }

  count(model: string): number {
    return this._store.count(model);
  }

  checkpoint(projection: string): number {
    return this._store.checkpoint(projection);
  }

  /**
   * Declare a model on the replica — must mirror the primary's
   * `registerModel` call (indexes are a storage detail, not replicated).
   */
  registerModel(...args: Parameters<ReadModelStore['registerModel']>): void {
    this._store.registerModel(...args);
  }
}

// ---------------------------------------------------------------------
// Controller + staleness tracking
// ---------------------------------------------------------------------

export interface ReplicaStaleness {
  /** Journal seqs the replica hasn't applied (journal.head - cursor). */
  readonly seqLag: number;
  /**
   * Projection-position lag: primary checkpoint minus replica checkpoint
   * for the same projection — the domain-meaningful number ("how many
   * events behind is this view").
   */
  readonly positionLag: Map<string, number>;
  /** ms since the replica last applied an entry; -1 if never. */
  readonly idleMs: number;
  /** True when the replica is at the journal head. */
  readonly caughtUp: boolean;
}

/**
 * Drives one `ReplicaReadStore` from one `ReplicationJournal` (+ the
 * primary store, for projection-checkpoint comparison).
 */
export class ReadModelReplication {
  private readonly _journal: ReplicationJournal;
  private readonly _primary: ReadModelStore;
  private readonly _replica: ReplicaReadStore;
  private readonly _clock: IClock;
  private readonly _batchSize: number;
  private _syncs = 0;

  constructor(
    journal: ReplicationJournal,
    primary: ReadModelStore,
    replica: ReplicaReadStore,
    options: { clock?: IClock; batchSize?: number } = {}
  ) {
    this._journal = journal;
    this._primary = primary;
    this._replica = replica;
    this._clock = options.clock ?? new SystemClock();
    this._batchSize = Math.max(1, options.batchSize ?? 500);
  }

  get journal(): ReplicationJournal {
    return this._journal;
  }

  get replica(): ReplicaReadStore {
    return this._replica;
  }

  /**
   * One replication round: pull from the replica cursor to the journal
   * head in batches, apply, measure. `ReplicationGapError` propagates —
   * a replica that lost the window needs a rebuild, not more retries.
   */
  syncOnce(): number {
    let applied = 0;
    for (;;) {
      const { entries } = this._journal.pull(this._replica.cursor, this._batchSize);
      if (entries.length === 0) break;
      const r = this._replica.apply(entries);
      applied += r.applied;
      if (entries.length < this._batchSize) break;
    }
    this._syncs++;
    return applied;
  }

  /** Staleness snapshot — both lenses (seq lag + per-projection position lag). */
  staleness(): ReplicaStaleness {
    const seqLag = Math.max(0, this._journal.head() - this._replica.cursor);
    const positionLag = new Map<string, number>();
    for (const [proj, primaryCp] of Object.entries(this._primary.checkpoints())) {
      const replicaCp = this._replica.checkpoint(proj);
      positionLag.set(proj, Math.max(0, primaryCp - replicaCp));
    }
    const last = this._replica.lastAppliedAt;
    return {
      seqLag,
      positionLag,
      idleMs: last < 0 ? -1 : this._clock.nowMs() - last,
      caughtUp: seqLag === 0,
    };
  }

  /** Worst-case projection lag (alerting input). */
  maxPositionLag(): number {
    let m = 0;
    for (const v of this.staleness().positionLag.values()) if (v > m) m = v;
    return m;
  }

  get syncCount(): number {
    return this._syncs;
  }
}
