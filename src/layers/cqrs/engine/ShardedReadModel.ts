/**
 * ShardedReadModel — partition read models across buckets by entity.
 *
 * The single-node `ReadModelStore` holds every document of every model.
 * When a model outgrows one node (too many docs, hot partitions, or a
 * rebuild that would lock the whole model), the standard move is to
 * split it into B buckets — the read-side analogue of Kafka partitioning:
 *
 *   doc id → hash → bucket b ∈ [0, B)
 *
 * Properties preserved from `ReadModelStore`:
 *   - per-projection checkpoints — but now per (projection, bucket),
 *     because a projection rebuild can finish bucket 3 while bucket 7 is
 *     still replaying. Progress tracking at whole-projection granularity
 *     would either stall or lie.
 *   - secondary indexes — per bucket, so `findBy` fans out to all
 *     buckets and merges (scatter-gather); `findByRouted` queries just
 *     the owning bucket when the index field IS the routing key.
 *
 * Routing: FNV-1a % bucketCount by default — deterministic, zero state.
 * A pluggable `EntityRouter` covers key-routing (route by a doc field,
 * e.g. `customerId`, so a customer's orders co-locate) and composite
 * keys.
 *
 * Rescaling B → B' is a control-plane operation: `rescale` rehashes
 * every document into the new bucket count. O(total docs). Checkpoints
 * can't be rehashed (position is global), so a rescale conservatively
 * re-baselines every (projection, bucket) checkpoint to the minimum of
 * the old per-bucket values — a rebuild then replays only the tail.
 *
 * @module CqrsLayer/Engine
 */

import { ProjectionOp } from '../implementations/Denormalizer';
import { ReadModelDocument } from './ReadModelStore';

export type { ReadModelDocument };

/** Route a doc id (and optionally the doc itself) to a bucket index. */
export type EntityRouter = (id: string, doc?: ReadModelDocument) => number;

/** FNV-1a 32-bit — same hash the event-store sharder uses, kept local so
 *  this layer doesn't depend on the event-sourcing internals. */
function fnv1a(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h >>> 0;
}

/**
 * Default router: `fnv1a(id) % bucketCount`. Deterministic and uniform —
 * the same reason rendezvous/ring hashing works for the write side.
 */
export function hashRouter(bucketCount: number): EntityRouter {
  if (bucketCount < 1) throw new Error('bucketCount must be >= 1');
  return (id) => fnv1a(id) % bucketCount;
}

/**
 * Field router: hash a document field instead of the id — co-locates
 * docs that share the field (e.g. all of customer c1's orders). Falls
 * back to id when the field is absent.
 */
export function fieldRouter(bucketCount: number, field: string): EntityRouter {
  if (bucketCount < 1) throw new Error('bucketCount must be >= 1');
  return (id, doc) => {
    const key = doc && doc[field] !== undefined ? String(doc[field]) : id;
    return fnv1a(key) % bucketCount;
  };
}

export class ShardedModelError extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = 'ShardedModelError';
  }
}

export interface ShardedModelDef {
  readonly name: string;
  /** Number of buckets for this model. */
  readonly buckets: number;
  /** Scalar fields to keep a per-bucket secondary index on. */
  readonly indexes?: readonly string[];
}

interface BucketState {
  readonly docs: Map<string, ReadModelDocument>;
  /** field -> value -> set of doc ids (bucket-local index). */
  readonly indexes: Map<string, Map<unknown, Set<string>>>;
}

interface ModelState {
  def: ShardedModelDef;
  router: EntityRouter;
  buckets: BucketState[];
}

/** A checkpoint key: `projection` owns progress per bucket. */
export type BucketCheckpoint = { projection: string; bucket: number };

export class ShardedReadModel {
  private readonly _models = new Map<string, ModelState>();
  /** `${projection}#${bucket}` -> last applied position. */
  private readonly _checkpoints = new Map<string, number>();
  /** Ops routed per bucket for stats. */
  private _opCount = 0;

  /** Register a model (idempotent — keeps existing data). */
  registerModel(def: ShardedModelDef, router?: EntityRouter): void {
    if (this._models.has(def.name)) return;
    if (def.buckets < 1) throw new ShardedModelError(`model '${def.name}': buckets must be >= 1`);
    const buckets: BucketState[] = [];
    for (let i = 0; i < def.buckets; i++) {
      const indexes = new Map<string, Map<unknown, Set<string>>>();
      for (const f of def.indexes ?? []) indexes.set(f, new Map());
      buckets.push({ docs: new Map(), indexes });
    }
    this._models.set(def.name, {
      def,
      router: router ?? hashRouter(def.buckets),
      buckets,
    });
  }

  private _model(name: string): ModelState {
    const m = this._models.get(name);
    if (!m) throw new ShardedModelError(`unknown read model '${name}'`);
    return m;
  }

  /** Bucket a doc id lands on for a model. */
  bucketOf(model: string, id: string, doc?: ReadModelDocument): number {
    return this._model(model).router(id, doc);
  }

  // ------------------------------------------------------------ writing

  /**
   * Apply ops into their routed buckets and advance the checkpoint of
   * each touched (projection, bucket) pair to `position`.
   *
   * Ops carry their doc id; routing is computed per op — a batch can
   * legitimately span buckets (one event may upsert docs in several).
   */
  applyBatch(projection: string, position: number, model: string, ops: ProjectionOp[]): void {
    const m = this._model(model);
    const touched = new Set<number>();
    for (const op of ops) {
      const bucket = this._bucketForOp(m, op);
      this._applyOp(m.buckets[bucket], op);
      touched.add(bucket);
      this._opCount++;
    }
    for (const b of touched) this._advanceCheckpoint(projection, b, position);
  }

  /** Single doc write without a checkpoint (seeds, manual fixes). */
  upsert(model: string, id: string, doc: ReadModelDocument): void {
    const m = this._model(model);
    const b = m.router(id, doc);
    this._applyOp(m.buckets[b], { kind: 'upsert', id, document: doc });
    this._opCount++;
  }

  delete(model: string, id: string): boolean {
    const m = this._model(model);
    const b = m.router(id);
    return this._removeDoc(m.buckets[b], id);
  }

  private _bucketForOp(m: ModelState, op: ProjectionOp): number {
    const doc = op.kind === 'upsert' ? op.document : op.kind === 'patch' ? undefined : undefined;
    // For patch/delete we can't see the new field values; route by id —
    // the same bucket the doc originally landed on (field routers must
    // ensure the routing field is immutable, documented below).
    return m.router(op.id, doc);
  }

  private _applyOp(b: BucketState, op: ProjectionOp): void {
    switch (op.kind) {
      case 'upsert': {
        const existing = b.docs.get(op.id);
        if (existing) this._unindex(b, op.id, existing);
        b.docs.set(op.id, { ...op.document });
        this._index(b, op.id, op.document);
        break;
      }
      case 'patch': {
        const existing = b.docs.get(op.id);
        const merged = { ...(existing ?? {}), ...op.patch };
        if (existing) this._unindex(b, op.id, existing);
        b.docs.set(op.id, merged);
        this._index(b, op.id, merged);
        break;
      }
      case 'delete': {
        this._removeDoc(b, op.id);
        break;
      }
    }
  }

  private _removeDoc(b: BucketState, id: string): boolean {
    const existing = b.docs.get(id);
    if (!existing) return false;
    this._unindex(b, id, existing);
    return b.docs.delete(id);
  }

  private _index(b: BucketState, id: string, doc: ReadModelDocument): void {
    for (const [field, idx] of b.indexes) {
      const value = doc[field];
      let bucket = idx.get(value);
      if (!bucket) {
        bucket = new Set();
        idx.set(value, bucket);
      }
      bucket.add(id);
    }
  }

  private _unindex(b: BucketState, id: string, doc: ReadModelDocument): void {
    for (const [field, idx] of b.indexes) {
      const bucket = idx.get(doc[field]);
      if (bucket) {
        bucket.delete(id);
        if (bucket.size === 0) idx.delete(doc[field]);
      }
    }
  }

  // ------------------------------------------------------------ reading

  /** O(1) point read — routes to the single owning bucket. */
  get(model: string, id: string): ReadModelDocument | undefined {
    const m = this._models.get(model);
    if (!m) return undefined;
    return m.buckets[m.router(id)].docs.get(id);
  }

  /**
   * Scatter-gather indexed lookup: query every bucket's index and merge.
   * O(B) index hits — fine at small B; the routed variant below avoids
   * the fan-out when the queried field is the routing key.
   */
  findBy(model: string, field: string, value: unknown): ReadModelDocument[] {
    const m = this._model(model);
    const out: ReadModelDocument[] = [];
    for (const b of m.buckets) {
      const idx = b.indexes.get(field);
      if (!idx) throw new ShardedModelError(`no index on '${field}' for model '${model}'`);
      const ids = idx.get(value);
      if (!ids) continue;
      for (const id of ids) {
        const doc = b.docs.get(id);
        if (doc) out.push(doc);
      }
    }
    return out;
  }

  /**
   * Routed lookup — when `field` IS the routing key, the value can only
   * live in one bucket: O(1) instead of the O(B) fan-out.
   */
  findByRouted(model: string, field: string, value: unknown): ReadModelDocument[] {
    const m = this._model(model);
    const bucket = m.router(String(value));
    const b = m.buckets[bucket];
    const idx = b.indexes.get(field);
    if (!idx) throw new ShardedModelError(`no index on '${field}' for model '${model}'`);
    const ids = idx.get(value);
    if (!ids) return [];
    const out: ReadModelDocument[] = [];
    for (const id of ids) {
      const doc = b.docs.get(id);
      if (doc) out.push(doc);
    }
    return out;
  }

  /** Full scan across buckets — O(n). Admin/debug paths only. */
  all(model: string): ReadModelDocument[] {
    const m = this._model(model);
    const out: ReadModelDocument[] = [];
    for (const b of m.buckets) out.push(...b.docs.values());
    return out;
  }

  count(model: string): number {
    const m = this._models.get(model);
    if (!m) return 0;
    let n = 0;
    for (const b of m.buckets) n += b.docs.size;
    return n;
  }

  /** Docs in one bucket — migration/inspection path. */
  bucketDocs(model: string, bucket: number): ReadModelDocument[] {
    const m = this._model(model);
    const b = m.buckets[bucket];
    if (!b) throw new ShardedModelError(`model '${model}': bucket ${bucket} out of range`);
    return [...b.docs.values()];
  }

  modelNames(): string[] {
    return [...this._models.keys()];
  }

  // -------------------------------------------------------- checkpoints

  private static _cpKey(projection: string, bucket: number): string {
    return `${projection}#${bucket}`;
  }

  private _advanceCheckpoint(projection: string, bucket: number, position: number): void {
    const key = ShardedReadModel._cpKey(projection, bucket);
    const cur = this._checkpoints.get(key) ?? -1;
    if (position > cur) this._checkpoints.set(key, position);
  }

  /** Last applied position for (projection, bucket); -1 = never ran. */
  bucketCheckpoint(projection: string, bucket: number): number {
    return this._checkpoints.get(ShardedReadModel._cpKey(projection, bucket)) ?? -1;
  }

  /**
   * Whole-projection checkpoint = min over buckets. A rebuild is only as
   * far along as its slowest bucket — the same rule Kafka consumer-group
   * lag uses (min over partitions).
   */
  checkpoint(projection: string, bucketCount: number): number {
    let min = Number.POSITIVE_INFINITY;
    for (let b = 0; b < bucketCount; b++) {
      const cp = this.bucketCheckpoint(projection, b);
      if (cp < min) min = cp;
    }
    return min === Number.POSITIVE_INFINITY ? -1 : min;
  }

  checkpoints(): Record<string, number> {
    const out: Record<string, number> = {};
    for (const [k, v] of this._checkpoints) out[k] = v;
    return out;
  }

  setBucketCheckpoint(projection: string, bucket: number, position: number): void {
    this._checkpoints.set(ShardedReadModel._cpKey(projection, bucket), position);
  }

  resetCheckpoint(projection: string): void {
    const prefix = `${projection}#`;
    for (const k of [...this._checkpoints.keys()]) {
      if (k.startsWith(prefix)) this._checkpoints.delete(k);
    }
  }

  // ----------------------------------------------------------- rescale

  /**
   * Rehash a model into `newBucketCount` buckets.
   *
   * Documents move; secondary indexes rebuild. Checkpoints are
   * re-baselined to the old min per bucket — after rescale a projection
   * may replay a few already-applied events (idempotency requirement,
   * same as the DenormalizerPipeline's dedup), but never loses progress.
   *
   * @returns per-bucket doc counts after the move (balance check).
   */
  rescale(model: string, newBucketCount: number, newRouter?: EntityRouter): number[] {
    const m = this._model(model);
    if (newBucketCount < 1) throw new ShardedModelError('newBucketCount must be >= 1');
    const router = newRouter ?? hashRouter(newBucketCount);

    // Collect all docs with their ids.
    const docs: { id: string; doc: ReadModelDocument }[] = [];
    for (const b of m.buckets) {
      for (const [id, doc] of b.docs) docs.push({ id, doc });
    }

    // Fresh buckets.
    const buckets: BucketState[] = [];
    for (let i = 0; i < newBucketCount; i++) {
      const indexes = new Map<string, Map<unknown, Set<string>>>();
      for (const f of m.def.indexes ?? []) indexes.set(f, new Map());
      buckets.push({ docs: new Map(), indexes });
    }
    for (const { id, doc } of docs) {
      const b = router(id, doc);
      buckets[b].docs.set(id, doc);
      this._index(buckets[b], id, doc);
    }

    // Re-baseline checkpoints: every (projection, oldBucket) folds into
    // the projection-level min, then all new buckets start at that min.
    const oldMin = new Map<string, number>();
    for (const [key, pos] of this._checkpoints) {
      const hash = key.lastIndexOf('#');
      const proj = key.slice(0, hash);
      const cur = oldMin.get(proj);
      if (cur === undefined || pos < cur) oldMin.set(proj, pos);
    }
    for (const key of [...this._checkpoints.keys()]) this._checkpoints.delete(key);
    for (const [proj, pos] of oldMin) {
      for (let b = 0; b < newBucketCount; b++) {
        this._checkpoints.set(ShardedReadModel._cpKey(proj, b), pos);
      }
    }

    m.buckets = buckets;
    m.router = router;
    m.def = { ...m.def, buckets: newBucketCount };

    return buckets.map((b) => b.docs.size);
  }

  /** Per-bucket doc counts — rebalance diagnostics. */
  distribution(model: string): number[] {
    return this._model(model).buckets.map((b) => b.docs.size);
  }

  clear(model: string): void {
    const m = this._model(model);
    for (const b of m.buckets) {
      b.docs.clear();
      for (const idx of b.indexes.values()) idx.clear();
    }
  }

  get appliedOps(): number {
    return this._opCount;
  }
}
