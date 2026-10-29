/**
 * Change Data Capture & Keyed State Store
 *
 * Two pieces that complete the incremental ETL picture:
 *
 * ChangeFeed / CdcProcessor
 * -------------------------
 * Models a CDC event stream (insert/update/delete with LSN-style
 * ordering) and applies it to a keyed state store:
 *
 *   - Events carry (key, op, payload, position); ordering is enforced by
 *     a strictly increasing `position` — out-of-order events are buffered
 *     and replayed (bounded reordering tolerance, like Kafka partition
 *     semantics with a max-skew assumption).
 *   - `apply` folds events into state: insert = put, update = merge,
 *     delete = tombstone. Tombstones are retained for `tombstoneRetention`
 *     positions then garbage-collected.
 *   - `snapshot` produces the materialized table; `changes(a,b)` diffs
 *     two snapshots — what downstream consumers need for upserts.
 *
 * KeyedStateStore
 * ---------------
 * Versioned in-memory map used by streaming joins/aggregations: get/put
 * with TTL per entry, plus prefix enumeration for keyed-by-composite
 * lookups.
 *
 * @module EtlPipeline/Engine
 */

import { Row } from './DagEngine';

/** CDC operation kinds. */
export type CdcOp = 'insert' | 'update' | 'delete' | 'snapshot';

/** One change event. */
export interface CdcEvent {
  /** Monotonic log position (LSN). Must increase per source. */
  readonly position: number;
  readonly key: string;
  readonly op: CdcOp;
  readonly row?: Row;
  readonly source?: string;
}

/** Diff entry between two snapshots. */
export interface StateChange {
  readonly key: string;
  readonly kind: 'added' | 'updated' | 'removed';
  readonly before?: Row;
  readonly after?: Row;
}

/** Options for the processor. */
export interface CdcOptions {
  /** How far behind the high-water mark a tombstone is kept. */
  readonly tombstoneRetentionPositions?: number;
  /** Max out-of-order buffer size; older positions are force-applied. */
  readonly reorderBufferSize?: number;
}

/* ------------------------------------------------------------------------ */
/* Keyed state store                                                        */
/* ------------------------------------------------------------------------ */

interface StateEntry {
  row: Row;
  expiresAt: number | null;
  version: number;
}

/**
 * Keyed store with optional TTL. Used by joins/aggregations needing
 * point lookups; `scanPrefix` supports composite-key enumeration.
 */
export class KeyedStateStore {
  private readonly _data = new Map<string, StateEntry>();
  private _version = 0;
  private readonly _clock: () => number;

  constructor(clock: () => number = Date.now) {
    this._clock = clock;
  }

  get(key: string): Row | undefined {
    const e = this._data.get(key);
    if (e === undefined) return undefined;
    if (e.expiresAt !== null && e.expiresAt <= this._clock()) {
      this._data.delete(key);
      return undefined;
    }
    return e.row;
  }

  put(key: string, row: Row, ttlMs?: number): void {
    this._version++;
    this._data.set(key, {
      row,
      expiresAt: ttlMs === undefined ? null : this._clock() + ttlMs,
      version: this._version,
    });
  }

  delete(key: string): boolean {
    this._version++;
    return this._data.delete(key);
  }

  has(key: string): boolean {
    return this.get(key) !== undefined;
  }

  /** All live keys with the given prefix. O(#keys). */
  scanPrefix(prefix: string): Array<{ key: string; row: Row }> {
    const out: Array<{ key: string; row: Row }> = [];
    const now = this._clock();
    for (const [k, e] of this._data) {
      if (e.expiresAt !== null && e.expiresAt <= now) continue;
      if (k.startsWith(prefix)) out.push({ key: k, row: e.row });
    }
    return out;
  }

  /** Purge expired entries; returns count removed. */
  purgeExpired(): number {
    const now = this._clock();
    let n = 0;
    for (const [k, e] of this._data) {
      if (e.expiresAt !== null && e.expiresAt <= now) {
        this._data.delete(k);
        n++;
      }
    }
    return n;
  }

  get size(): number {
    return this._data.size;
  }

  get version(): number {
    return this._version;
  }

  /** Materialized snapshot (shallow copies). */
  snapshot(): Map<string, Row> {
    const out = new Map<string, Row>();
    const now = this._clock();
    for (const [k, e] of this._data) {
      if (e.expiresAt === null || e.expiresAt > now) out.set(k, { ...e.row });
    }
    return out;
  }
}

/* ------------------------------------------------------------------------ */
/* CDC processor                                                            */
/* ------------------------------------------------------------------------ */

/**
 * Applies a CDC event stream to a KeyedStateStore with bounded
 * reordering.
 *
 * Semantics:
 *  - insert: puts the row (overwrites any existing).
 *  - update: shallow-merges fields onto the existing row (or upserts if
 *    the key is unknown — lenient mode, matching debezium snapshots).
 *  - delete: removes the row and records a tombstone until the position
 *    is `tombstoneRetentionPositions` behind the high-water mark.
 *  - snapshot: bulk load (position is typically 0 and unordered; applied
 *    unconditionally for unseen keys).
 */
export class CdcProcessor {
  readonly state: KeyedStateStore;
  private readonly _opts: Required<CdcOptions>;
  private _highWater = -1;
  private readonly _tombstones = new Map<string, number>(); // key → delete position
  private readonly _reorderBuffer = new Map<number, CdcEvent>();
  private _applied = 0;
  private _dropped = 0;

  constructor(opts: CdcOptions = {}) {
    this.state = new KeyedStateStore();
    this._opts = {
      tombstoneRetentionPositions: opts.tombstoneRetentionPositions ?? 1000,
      reorderBufferSize: opts.reorderBufferSize ?? 64,
    };
  }

  get highWaterMark(): number {
    return this._highWater;
  }

  get appliedCount(): number {
    return this._applied;
  }

  get droppedCount(): number {
    return this._dropped;
  }

  get tombstoneCount(): number {
    return this._tombstones.size;
  }

  /**
   * Ingest one event. Events arriving out of order are buffered until
   * the gap closes or the buffer exceeds `reorderBufferSize`, at which
   * point the lowest-position events are force-applied (bounded
   * reordering assumption — a position that never arrives can't stall
   * the stream forever).
   */
  ingest(event: CdcEvent): void {
    if (event.position <= this._highWater && event.op !== 'snapshot') {
      // Duplicate or way-late event.
      this._dropped++;
      return;
    }
    const expected = this._highWater + 1;
    if (this._highWater >= 0 && event.position > expected && event.op !== 'snapshot') {
      this._reorderBuffer.set(event.position, event);
      if (this._reorderBuffer.size > this._opts.reorderBufferSize) {
        // Force-apply the smallest buffered position.
        const min = Math.min(...this._reorderBuffer.keys());
        const ev = this._reorderBuffer.get(min) as CdcEvent;
        this._reorderBuffer.delete(min);
        this._apply(ev);
      }
      return;
    }
    this._apply(event);
    // Drain the reorder buffer while contiguous.
    for (;;) {
      const next = this._reorderBuffer.get(this._highWater + 1);
      if (next === undefined) break;
      this._reorderBuffer.delete(next.position);
      this._apply(next);
    }
  }

  /** Ingest a batch (already ordered or not). */
  ingestAll(events: readonly CdcEvent[]): void {
    for (const e of events) this.ingest(e);
  }

  private _apply(e: CdcEvent): void {
    if (e.op !== 'snapshot') {
      this._highWater = Math.max(this._highWater, e.position);
    }
    switch (e.op) {
      case 'insert':
      case 'snapshot':
        this.state.put(e.key, e.row ?? {});
        this._tombstones.delete(e.key);
        break;
      case 'update': {
        const existing = this.state.get(e.key) ?? {};
        this.state.put(e.key, { ...existing, ...(e.row ?? {}) });
        break;
      }
      case 'delete':
        this.state.delete(e.key);
        this._tombstones.set(e.key, e.position);
        break;
    }
    this._applied++;
    this._gcTombstones();
  }

  private _gcTombstones(): void {
    for (const [k, pos] of this._tombstones) {
      if (pos < this._highWater - this._opts.tombstoneRetentionPositions) {
        this._tombstones.delete(k);
      }
    }
  }

  /** Whether a key was deleted within retention (differentiates
   * "never existed" from "deleted" for downstream systems). */
  isTombstoned(key: string): boolean {
    return this._tombstones.has(key);
  }

  /** Materialized current state. */
  snapshot(): Map<string, Row> {
    return this.state.snapshot();
  }
}

/* ------------------------------------------------------------------------ */
/* Snapshot diff                                                            */
/* ------------------------------------------------------------------------ */

/**
 * Diff two materialized snapshots into added/updated/removed sets —
 * what a downstream loader consumes to upsert incrementally.
 */
export function diffSnapshots(before: ReadonlyMap<string, Row>, after: ReadonlyMap<string, Row>): StateChange[] {
  const out: StateChange[] = [];
  for (const [k, row] of after) {
    const prev = before.get(k);
    if (prev === undefined) {
      out.push({ key: k, kind: 'added', after: row });
    } else if (JSON.stringify(prev) !== JSON.stringify(row)) {
      out.push({ key: k, kind: 'updated', before: prev, after: row });
    }
  }
  for (const [k, row] of before) {
    if (!after.has(k)) out.push({ key: k, kind: 'removed', before: row });
  }
  return out;
}
