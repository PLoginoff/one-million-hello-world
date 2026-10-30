/**
 * KeepAliveTracker — per-connection HTTP keep-alive and pipelining
 * bookkeeping.
 *
 * Model: each tracked connection is a small record —
 *   { requestsServed, inFlight, lastActivityAt, closed } — kept in a
 *   Map keyed by connection id. `beginRequest`/`endRequest` mark the
 *   pipelining window; `canReuse` answers whether the connection may
 *   carry another request right now.
 *
 * Three limits govern reuse:
 *  - `maxRequests`       — a lifetime cap: after N responses the
 *                          connection must close (mitigates
 *                          unbounded memory/goroutine growth and
 *                          lets LBs rebalance long-lived conns).
 *  - `idleTimeoutMs`     — staleness: a conn silent this long is
 *                          assumed dead (the peer may have already
 *                          closed it — sending a request onto a
 *                          half-open conn wastes a retry).
 *  - `maxPipelineDepth`  — pipelining throttle: caps in-flight
 *                          requests so a fast client can't stack a
 *                          hundred requests ahead of responses.
 *
 * All decisions are made at query time against the injected clock —
 * there are no timers in here; the caller folds `sweep`/`canReuse`
 * into its connection lifecycle.
 *
 * Complexity: all ops O(1); sweep is O(connections).
 *
 * @module NetworkLayer/Engine
 */

import {
  EngineClock,
  KeepAliveOptions,
  KeepAliveVerdict,
  SystemEngineClock,
} from './types';

interface TrackedConnection {
  requestsServed: number;
  inFlight: number;
  /** Clock time of the last begin/end/verdict activity. */
  lastActivityAt: number;
  /** Explicitly closed by peer or by `close`. */
  closed: boolean;
  createdAt: number;
}

export class KeepAliveTracker {
  private readonly _clock: EngineClock;
  private readonly _maxRequests: number;
  private readonly _idleTimeoutMs: number;
  private readonly _maxPipelineDepth: number;

  private _conns: Map<string, TrackedConnection>;
  private _totalRequests: number;
  private _totalClosedMaxRequests: number;
  private _totalClosedIdle: number;

  constructor(options: KeepAliveOptions = {}) {
    this._clock = options.clock ?? new SystemEngineClock();
    this._maxRequests = Math.max(1, options.maxRequests ?? 1000);
    this._idleTimeoutMs = Math.max(0, options.idleTimeoutMs ?? 60_000);
    this._maxPipelineDepth = Math.max(1, options.maxPipelineDepth ?? 1);

    this._conns = new Map();
    this._totalRequests = 0;
    this._totalClosedMaxRequests = 0;
    this._totalClosedIdle = 0;
  }

  /* ---------------------------------------------------------------- */
  /* Request lifecycle                                                 */
  /* ---------------------------------------------------------------- */

  /**
   * Record a request starting on `connId`. Throws via verdict when
   * the connection is full — callers should check `canReuse` first,
   * but a direct begin also refuses when pipeline depth is reached.
   * Returns the number of requests now in flight.
   */
  beginRequest(connId: string): number {
    const c = this._getOrCreate(connId);
    if (c.closed) {
      return c.inFlight;
    }
    if (c.inFlight >= this._maxPipelineDepth) {
      // Refuse to deepen the pipeline — the verdict says not
      // reusable; the caller gets the current depth back.
      return c.inFlight;
    }
    c.inFlight++;
    c.lastActivityAt = this._clock.now();
    return c.inFlight;
  }

  /**
   * Record a response completing. Decrements the pipeline depth and
   * bumps `requestsServed` — the lifetime counter that drives the
   * `maxRequests` limit.
   */
  endRequest(connId: string): void {
    const c = this._conns.get(connId);
    if (!c || c.closed) {
      return;
    }
    if (c.inFlight > 0) {
      c.inFlight--;
    }
    c.requestsServed++;
    this._totalRequests++;
    c.lastActivityAt = this._clock.now();
  }

  /** Mark a connection closed (FIN/RST seen, or local shutdown). */
  close(connId: string): void {
    // `_getOrCreate` so close-before-any-request still leaves a record
    // `sweep` can reap — an untracked close would otherwise be lost.
    const c = this._getOrCreate(connId);
    c.closed = true;
    c.inFlight = 0;
  }

  /** Forget a connection entirely (pool evicted it, etc.). */
  forget(connId: string): void {
    this._conns.delete(connId);
  }

  /* ---------------------------------------------------------------- */
  /* Reuse verdict                                                     */
  /* ---------------------------------------------------------------- */

  /**
   * Whether `connId` may carry another request right now.
   *
   * Order of checks matters: `closed` beats everything; `idle-timeout`
   * beats `max-requests` because a dead conn is dead regardless of
   * remaining quota; `max-requests` beats pipeline depth because a
   * conn at its request cap isn't reusable even with an empty
   * pipeline.
   */
  canReuse(connId: string): KeepAliveVerdict {
    const now = this._clock.now();
    const c = this._conns.get(connId);

    if (!c) {
      // Unknown conn — treat as fresh: reusable but no history.
      return {
        reusable: true,
        requestsServed: 0,
        inFlight: 0,
        staleInMs: this._idleTimeoutMs > 0 ? this._idleTimeoutMs : Infinity,
      };
    }

    const staleInMs =
      this._idleTimeoutMs > 0
        ? Math.max(0, this._idleTimeoutMs - (now - c.lastActivityAt))
        : Infinity;

    const base = {
      requestsServed: c.requestsServed,
      inFlight: c.inFlight,
      staleInMs,
    };

    if (c.closed) {
      return { ...base, reusable: false, reason: 'closed' };
    }
    if (staleInMs <= 0) {
      this._totalClosedIdle++;
      return { ...base, reusable: false, reason: 'idle-timeout' };
    }
    if (c.requestsServed >= this._maxRequests && c.inFlight === 0) {
      this._totalClosedMaxRequests++;
      return { ...base, reusable: false, reason: 'max-requests' };
    }
    // Full pipeline = still reusable eventually, but not *now*.
    const reusable = c.inFlight < this._maxPipelineDepth;
    return { ...base, reusable };
  }

  /**
   * Evict stale/closed records and return them for the caller to
   * tear down. `sweep` is O(n) over tracked conns — drive on a timer.
   */
  sweep(): string[] {
    const now = this._clock.now();
    const dead: string[] = [];
    for (const [id, c] of this._conns) {
      const stale =
        this._idleTimeoutMs > 0 && now - c.lastActivityAt >= this._idleTimeoutMs;
      if (c.closed || stale) {
        dead.push(id);
        this._conns.delete(id);
      }
    }
    return dead;
  }

  /* ---------------------------------------------------------------- */
  /* Introspection                                                     */
  /* ---------------------------------------------------------------- */

  get trackedConnections(): number {
    return this._conns.size;
  }

  get totalRequests(): number {
    return this._totalRequests;
  }

  get totalClosedByMaxRequests(): number {
    return this._totalClosedMaxRequests;
  }

  get totalClosedByIdle(): number {
    return this._totalClosedIdle;
  }

  /** Snapshot of one connection's bookkeeping (null if untracked). */
  snapshot(connId: string): {
    requestsServed: number;
    inFlight: number;
    idleForMs: number;
    closed: boolean;
  } | null {
    const c = this._conns.get(connId);
    if (!c) {
      return null;
    }
    return {
      requestsServed: c.requestsServed,
      inFlight: c.inFlight,
      idleForMs: this._clock.now() - c.lastActivityAt,
      closed: c.closed,
    };
  }

  private _getOrCreate(connId: string): TrackedConnection {
    let c = this._conns.get(connId);
    if (!c) {
      const now = this._clock.now();
      c = {
        requestsServed: 0,
        inFlight: 0,
        lastActivityAt: now,
        closed: false,
        createdAt: now,
      };
      this._conns.set(connId, c);
    }
    return c;
  }
}
