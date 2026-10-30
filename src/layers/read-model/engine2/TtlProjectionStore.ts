/**
 * TtlProjectionStore — projections that auto-expire when stale.
 *
 * Some projections are only valid while fresh: availability caches,
 * "currently online" sets, session state. Rows carry a TTL; reads past
 * `writtenAtMs + ttl` treat the row as absent (lazy expiry), and an
 * optional `sweep()` physically reaps expired rows.
 *
 * Two TTL flavors:
 *  - fixed: every row expires `ttlMs` after write.
 *  - sliding: expiry resets on every read (session-like projections).
 *
 * `get` returns { row, fresh } — a caller can distinguish "missing" from
 * "stale", which matters for "serve stale while rebuilding" UX.
 *
 * Expired-row tombstones are kept in the index until `sweep()` (or a
 * write) removes them so `get` can still report staleness.
 *
 * Complexity: get/put O(1); sweep O(n).
 *
 * @module ReadModelLayer/Engine2
 */

import { RmClock2, SystemRmClock2, ProjectionRow } from './types';

export interface TtlOptions {
  /** Row lifetime in ms. */
  ttlMs: number;
  /** 'fixed': expiry = writtenAt+ttl. 'sliding': read resets expiry. */
  mode?: 'fixed' | 'sliding';
  clock?: RmClock2;
}

export interface TtlGetResult {
  readonly row: ProjectionRow | null;
  /** false = absent OR expired (use `stale` to distinguish). */
  readonly fresh: boolean;
  /** true when the row exists but has expired (servable as stale). */
  readonly stale: boolean;
}

export class TtlProjectionStore {
  private readonly _rows = new Map<string, Map<string, { row: ProjectionRow; expiresAt: number }>>();
  private readonly _ttlMs: number;
  private readonly _mode: 'fixed' | 'sliding';
  private readonly _clock: RmClock2;
  private _swept = 0;

  constructor(opts: TtlOptions) {
    if (opts.ttlMs <= 0) throw new Error('ttlMs must be > 0');
    this._ttlMs = opts.ttlMs;
    this._mode = opts.mode ?? 'fixed';
    this._clock = opts.clock ?? new SystemRmClock2();
  }

  put(row: ProjectionRow): void {
    let p = this._rows.get(row.projection);
    if (!p) {
      p = new Map();
      this._rows.set(row.projection, p);
    }
    p.set(row.key, { row, expiresAt: this._clock.now() + this._ttlMs });
  }

  get(projection: string, key: string): TtlGetResult {
    const e = this._rows.get(projection)?.get(key);
    if (!e) return { row: null, fresh: false, stale: false };
    const now = this._clock.now();
    if (now >= e.expiresAt) {
      return { row: e.row, fresh: false, stale: true };
    }
    if (this._mode === 'sliding') {
      e.expiresAt = now + this._ttlMs;
    }
    return { row: e.row, fresh: true, stale: false };
  }

  /** Hard read — expired rows look absent. */
  getFresh(projection: string, key: string): ProjectionRow | null {
    const r = this.get(projection, key);
    return r.fresh ? r.row : null;
  }

  /**
   * Physically remove expired rows. Returns removed count.
   * O(n) over all rows; run on a maintenance cadence.
   */
  sweep(): number {
    const now = this._clock.now();
    let removed = 0;
    for (const [, rows] of this._rows) {
      for (const [key, e] of rows) {
        if (now >= e.expiresAt) {
          rows.delete(key);
          removed++;
        }
      }
    }
    this._swept += removed;
    return removed;
  }

  get sweptCount(): number {
    return this._swept;
  }

  /** Live + expired row count (pre-sweep). */
  get size(): number {
    let n = 0;
    for (const p of this._rows.values()) n += p.size;
    return n;
  }
}
