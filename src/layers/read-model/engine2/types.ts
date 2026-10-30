/**
 * ReadModel Engine2 — Shared Types
 *
 * Second-generation read-model primitives: schema versioning with
 * migrations, entity-id sharding, TTL expiry of stale projections,
 * materialized aggregates maintained on write, and consistency tokens
 * for read-your-writes guarantees.
 *
 * @module ReadModelLayer/Engine2
 */

/** Injectable clock for TTL, migration timing, and token aging. */
export interface RmClock2 {
  now(): number;
}

export class SystemRmClock2 implements RmClock2 {
  now(): number {
    return Date.now();
  }
}

/** Test clock with manual time control. */
export class ManualRmClock2 implements RmClock2 {
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

/** A stored read-model row — schema versioned, shard placed, TTL'd. */
export interface ProjectionRow {
  /** Projection name (the "table"). */
  readonly projection: string;
  /** Entity/row key within the projection. */
  readonly key: string;
  /** Schema version the payload was written under. */
  readonly version: number;
  /** Opaque projection payload. */
  readonly payload: Record<string, unknown>;
  /** Write timestamp (ms) — drives TTL. */
  readonly writtenAtMs: number;
  /** Source event/stream position the row was built from. */
  readonly sourcePosition: number;
}
