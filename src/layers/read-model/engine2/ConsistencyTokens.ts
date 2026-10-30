/**
 * ConsistencyTokens — read-your-writes tokens for read-model lag.
 *
 * The write side emits a monotonically increasing position per stream
 * (event-source position, LSN, oplog offset — modelled as a number).
 * When a command commits, the client gets a consistency token = the
 * source position the write landed at. Reads against the read model are
 * "consistent" once the projection has caught up to that position.
 *
 * Token format: `${streamPos}` — opaque to clients; here it's just the
 * integer position of the last write the client caused. For multi-
 * stream writes, tokens are a per-stream map serialized as
 * `s1:p1,s2:p2`.
 *
 * `satisfiedBy(row)` checks whether a row's sourcePosition covers the
 * token — read-your-writes for point reads. `waitFor(token, rows)`
 * returns the subset of rows already consistent (the rest are stale
 * and the caller can retry or serve stale).
 *
 * Freshness: `lagMs(token)` reports how stale a token is vs the
 * projection high-water mark — used for staleness SLOs.
 *
 * @module ReadModelLayer/Engine2
 */

import { RmClock2, SystemRmClock2, ProjectionRow } from './types';

export type ConsistencyToken = string; // "pos" or "s1:p1,s2:p2"

/** Parse a token into stream→position map. Single-stream tokens have
 *  stream '' (empty). */
export function parseToken(token: ConsistencyToken): Map<string, number> {
  const m = new Map<string, number>();
  const t = token.trim();
  if (!t) return m;
  if (/^\d+$/.test(t)) {
    m.set('', Number(t));
    return m;
  }
  for (const part of t.split(',')) {
    const [s, p] = part.split(':');
    if (!s || p === undefined || !/^\d+$/.test(p)) {
      throw new Error(`malformed consistency token '${token}'`);
    }
    m.set(s, Number(p));
  }
  return m;
}

export function formatToken(positions: Map<string, number> | Record<string, number>): string {
  const entries = pos_entries(positions);
  if (entries.length === 1 && entries[0][0] === '') return String(entries[0][1]);
  return entries.map(([s, p]) => `${s}:${p}`).join(',');
}

function pos_entries(p: Map<string, number> | Record<string, number>): [string, number][] {
  return (p instanceof Map ? [...p.entries()] : Object.entries(p)) as [string, number][];
}

export class ConsistencyTokens {
  private readonly _clock: RmClock2;
  /** Stream → high-water position the read model has applied. */
  private readonly _highWater = new Map<string, number>();
  /** Stream → last time a position was recorded (for lag stats). */
  private readonly _writeTimes = new Map<number, number>();

  constructor(clock?: RmClock2) {
    this._clock = clock ?? new SystemRmClock2();
  }

  /** Read model reports having applied up to `position` on `stream`. */
  advance(stream: string, position: number): void {
    const cur = this._highWater.get(stream) ?? -1;
    if (position > cur) this._highWater.set(stream, position);
    this._writeTimes.set(position, this._clock.now());
  }

  /** Issue a token for a write that landed at `position` on `stream`. */
  issue(stream: string, position: number): string {
    return formatToken(new Map([[stream, position]]));
  }

  /**
   * Is a read at `position` satisfied for `token`? A token pos P is
   * satisfied when the read model has applied position ≥ P on every
   * stream in the token.
   */
  satisfiedBy(token: string): boolean {
    for (const [stream, pos] of parseToken(token)) {
      if ((this._highWater.get(stream) ?? -1) < pos) return false;
    }
    return true;
  }

  /**
   * Split rows into consistent (sourcePosition ≥ token pos on their
   * stream — we assume single-stream '' unless rows carry it) vs stale.
   * For simplicity rows use the '' stream unless `streamField` names a
   * payload field carrying the stream name.
   */
  splitConsistent(token: string, rows: ProjectionRow[]): { consistent: ProjectionRow[]; stale: ProjectionRow[] } {
    const req = parseToken(token);
    const reqPos = Math.max(...req.values(), -1);
    const consistent: ProjectionRow[] = [];
    const stale: ProjectionRow[] = [];
    for (const r of rows) {
      (r.sourcePosition >= reqPos ? consistent : stale).push(r);
    }
    return { consistent, stale };
  }

  /** Streams the token requires that haven't caught up. */
  pendingStreams(token: string): string[] {
    const out: string[] = [];
    for (const [s, p] of parseToken(token)) {
      if ((this._highWater.get(s) ?? -1) < p) out.push(s);
    }
    return out;
  }

  /** ms between a write landing at `position` and the projection reaching it — staleness SLO. */
  lagMs(position: number): number | null {
    const t = this._writeTimes.get(position);
    return t === undefined ? null : this._clock.now() - t;
  }

  /** High-water position per stream. */
  highWater(): Map<string, number> {
    return new Map(this._highWater);
  }
}
