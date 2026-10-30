/**
 * ConnectionPool — warm, bounded pool of reusable connections with
 * idle eviction and lifetime caps.
 *
 * Model: connections live in three sets —
 *   `_idle`   : LIFO stack of `{conn, idleSince}` records (pop = O(1));
 *               LIFO rather than FIFO so the *hottest* connection is
 *               reused first, which keeps the cold tail evictable —
 *               a small but real locality win versus FIFO.
 *   `_out`    : Map<id, conn> of checked-out connections.
 *   `_waiters`: FIFO queue of pending `acquire` calls, each with a
 *               monotonic deadline; satisfaction is in arrival order
 *               (fairness — no barging).
 *
 * Warm-up: `start()` eagerly creates `minIdle` connections so the
 * first requests don't pay connection-setup latency.
 *
 * Eviction is *lazy on access* plus an explicit `sweep()` the caller
 * may drive from a timer — lazy eviction alone is insufficient
 * because an idle pool has no access path to trigger it.
 *
 * `acquire` paths:
 *   1. idle non-stale conn        → validate-on-checkout (optional)
 *                                   then hand out. Failed validation
 *                                   destroys and retries the loop —
 *                                   a dead conn never reaches callers.
 *   2. total < maxSize            → create one inline and hand out.
 *   3. pool full                  → enqueue a waiter with deadline;
 *                                   `release` feeds waiters first.
 *
 * Complexity: acquire/release are O(1) amortized; `sweep` is O(idle).
 *
 * @module NetworkLayer/Engine
 */

import {
  AcquireTimeoutError,
  ConnectionPoolOptions,
  EngineClock,
  PoolClosedError,
  PooledConnection,
  PooledConnectionFactory,
  PoolStatsSnapshot,
  SystemEngineClock,
} from './types';

/** Duck-typed detection of test clocks (avoids instanceof coupling). */
function isManualClock(clock: EngineClock): boolean {
  return 'advance' in clock && typeof (clock as { advance: unknown }).advance === 'function';
}

interface IdleRecord<T> {
  conn: T;
  /** Clock time when this connection last became idle. */
  idleSince: number;
  /** Clock time when the connection was created (lifetime cap). */
  createdAt: number;
}

interface Waiter<T> {
  resolve: (conn: T) => void;
  reject: (err: unknown) => void;
  /** Clock deadline; `Infinity` = no timeout. */
  deadline: number;
  settled: boolean;
}

export class ConnectionPool<T extends PooledConnection> {
  private readonly _factory: PooledConnectionFactory<T>;
  private readonly _clock: EngineClock;
  private readonly _minIdle: number;
  private readonly _maxSize: number;
  private readonly _idleTimeoutMs: number;
  private readonly _maxLifetimeMs: number;
  private readonly _acquireTimeoutMs: number;
  private readonly _validateOnCheckout: boolean;

  private _idle: IdleRecord<T>[];
  private _out: Map<string, T>;
  /** Conns whose creation is in-flight — count toward maxSize. */
  private _pending: number;
  private _waiters: Waiter<T>[];
  private _closed: boolean;
  private _started: boolean;

  private _totalCreated: number;
  private _totalDestroyed: number;
  private _totalAcquired: number;
  private _totalReleased: number;
  private _evictedIdle: number;
  private _evictedLifetime: number;
  private _failedValidations: number;
  private _acquireTimeouts: number;

  constructor(factory: PooledConnectionFactory<T>, options: ConnectionPoolOptions = {}) {
    this._factory = factory;
    this._clock = options.clock ?? new SystemEngineClock();
    this._minIdle = Math.max(0, options.minIdle ?? 0);
    this._maxSize = Math.max(1, options.maxSize ?? 10);
    this._idleTimeoutMs = Math.max(0, options.idleTimeoutMs ?? 60_000);
    this._maxLifetimeMs = Math.max(0, options.maxLifetimeMs ?? 0);
    this._acquireTimeoutMs = Math.max(0, options.acquireTimeoutMs ?? 30_000);
    this._validateOnCheckout = options.validateOnCheckout ?? true;

    if (this._minIdle > this._maxSize) {
      throw new RangeError('minIdle must be <= maxSize');
    }

    this._idle = [];
    this._out = new Map();
    this._pending = 0;
    this._waiters = [];
    this._closed = false;
    this._started = false;

    this._totalCreated = 0;
    this._totalDestroyed = 0;
    this._totalAcquired = 0;
    this._totalReleased = 0;
    this._evictedIdle = 0;
    this._evictedLifetime = 0;
    this._failedValidations = 0;
    this._acquireTimeouts = 0;
  }

  /* ---------------------------------------------------------------- */
  /* Lifecycle                                                         */
  /* ---------------------------------------------------------------- */

  /**
   * Warm the pool: create `minIdle` connections eagerly. Failures
   * during warm-up are swallowed into the stats — a pool that cannot
   * warm still works on demand.
   */
  async start(): Promise<void> {
    if (this._started) {
      return;
    }
    this._started = true;
    await this._ensureMinIdle();
  }

  /**
   * Drain the pool: reject all waiters, destroy idle connections,
   * then wait for checked-out connections to be released (each
   * `release` destroys rather than recycles once closed).
   */
  async close(): Promise<void> {
    if (this._closed) {
      return;
    }
    this._closed = true;

    const waiters = this._waiters.splice(0);
    for (const w of waiters) {
      w.settled = true;
      w.reject(new PoolClosedError());
    }

    const idle = this._idle.splice(0);
    for (const rec of idle) {
      await this._destroy(rec.conn);
    }
    // Checked-out connections are destroyed by `release` when they
    // come back — close() doesn't race in-flight borrows.
  }

  get closed(): boolean {
    return this._closed;
  }

  /* ---------------------------------------------------------------- */
  /* Acquire / release                                                 */
  /* ---------------------------------------------------------------- */

  /**
   * Borrow a connection. Serves idle connections first (re-validating
   * when configured), creates on demand under `maxSize`, otherwise
   * queues a waiter bounded by `acquireTimeoutMs`.
   */
  async acquire(): Promise<T> {
    if (this._closed) {
      throw new PoolClosedError();
    }

    // Serve from idle — loop because validation may destroy candidates.
    for (;;) {
      const rec = this._popIdleUsable();
      if (!rec) {
        break;
      }
      if (this._validateOnCheckout && this._factory.validate) {
        let ok = false;
        try {
          ok = await this._factory.validate(rec.conn);
        } catch {
          ok = false;
        }
        if (!ok) {
          this._failedValidations++;
          await this._destroy(rec.conn);
          continue;
        }
      }
      return this._checkout(rec.conn);
    }

    // Create on demand if there's headroom.
    if (this._size + this._pending < this._maxSize) {
      this._pending++;
      try {
        const conn = await this._factory.create();
        this._pending--;
        this._totalCreated++;
        if (this._closed) {
          // Pool closed while the factory was working — don't leak.
          await this._destroy(conn);
          throw new PoolClosedError();
        }
        return this._checkout(conn);
      } catch (err) {
        this._pending--;
        throw err;
      }
    }

    // Pool is full — queue a waiter with a deadline.
    return this._enqueueWaiter();
  }

  /**
   * Return a connection. Feeds the FIFO waiter queue first (the conn
   * transfers directly, never becoming idle); otherwise it goes back
   * on the LIFO idle stack — unless the pool is closed or the
   * connection exceeded its lifetime, in which case it is destroyed.
   */
  async release(conn: T): Promise<void> {
    if (!this._out.delete(conn.id)) {
      // Releasing a conn that isn't ours (double-release or foreign) —
      // silently ignore; callers get no partial state either way.
      return;
    }
    this._totalReleased++;

    const now = this._clock.now();
    const expired =
      this._maxLifetimeMs > 0 &&
      now - this._createdAtOf(conn) >= this._maxLifetimeMs;

    if (this._closed || expired) {
      if (expired) {
        this._evictedLifetime++;
      }
      await this._destroy(conn);
      this._wakeOrCreateForWaiters();
      return;
    }

    // Prefer feeding a live waiter — the connection never idles.
    const waiter = this._nextLiveWaiter();
    if (waiter) {
      waiter.settled = true;
      this._out.set(conn.id, conn);
      this._totalAcquired++;
      waiter.resolve(conn);
      return;
    }

    this._idle.push({ conn, idleSince: now, createdAt: this._createdAtOf(conn) });
  }

  /**
   * Destroy a checked-out connection instead of releasing it (the
   * connection faulted — half-open TCP, protocol desync, etc.). This
   * is the counterpart of `release` for the failure path.
   */
  async destroyCheckedOut(conn: T): Promise<void> {
    if (!this._out.delete(conn.id)) {
      return;
    }
    await this._destroy(conn);
    this._wakeOrCreateForWaiters();
  }

  /* ---------------------------------------------------------------- */
  /* Eviction                                                          */
  /* ---------------------------------------------------------------- */

  /**
   * Evict idle connections past `idleTimeoutMs` or `maxLifetimeMs`.
   * Drive from a timer in production; tests advance the manual clock
   * and call this directly. Returns the number evicted.
   */
  async sweep(): Promise<number> {
    const now = this._clock.now();
    let evicted = 0;
    const keep: IdleRecord<T>[] = [];

    for (const rec of this._idle) {
      const idleTooLong =
        this._idleTimeoutMs > 0 && now - rec.idleSince >= this._idleTimeoutMs;
      const livedTooLong =
        this._maxLifetimeMs > 0 && now - rec.createdAt >= this._maxLifetimeMs;
      if (idleTooLong || livedTooLong) {
        if (idleTooLong) {
          this._evictedIdle++;
        } else {
          this._evictedLifetime++;
        }
        await this._destroy(rec.conn);
        evicted++;
      } else {
        keep.push(rec);
      }
    }
    this._idle = keep;

    // Re-warm after eviction so minIdle stays satisfied.
    if (!this._closed) {
      await this._ensureMinIdle();
    }
    return evicted;
  }

  /* ---------------------------------------------------------------- */
  /* Introspection                                                     */
  /* ---------------------------------------------------------------- */

  get stats(): PoolStatsSnapshot {
    return {
      idle: this._idle.length,
      checkedOut: this._out.size,
      pending: this._pending,
      waiters: this._waiters.filter((w) => !w.settled).length,
      totalCreated: this._totalCreated,
      totalDestroyed: this._totalDestroyed,
      totalAcquired: this._totalAcquired,
      totalReleased: this._totalReleased,
      evictedIdle: this._evictedIdle,
      evictedLifetime: this._evictedLifetime,
      failedValidations: this._failedValidations,
      acquireTimeouts: this._acquireTimeouts,
    };
  }

  private get _size(): number {
    return this._idle.length + this._out.size;
  }

  /* ---------------------------------------------------------------- */
  /* Internals                                                         */
  /* ---------------------------------------------------------------- */

  private _checkout(conn: T): T {
    this._out.set(conn.id, conn);
    this._totalAcquired++;
    // createdAt travels on a side Map keyed by conn id: idle pops set
    // it in `_popIdleUsable` (preserving the original creation time);
    // fresh creates get ~now. Missing entries default at release via
    // `_createdAtOf`, but stamping here keeps `maxLifetimeMs` honest
    // for connections checked out without ever going idle.
    if (!this._createdAt.has(conn.id)) {
      this._createdAt.set(conn.id, this._clock.now());
    }
    return conn;
  }

  /**
   * Pop the most recently idled connection that hasn't exceeded its
   * lifetime. Expired conns are destroyed as a side effect (they'd be
   * dead on checkout anyway — better to collect stats here).
   */
  private _popIdleUsable(): IdleRecord<T> | null {
    const now = this._clock.now();
    while (this._idle.length > 0) {
      const rec = this._idle.pop() as IdleRecord<T>;
      if (
        this._maxLifetimeMs > 0 &&
        now - rec.createdAt >= this._maxLifetimeMs
      ) {
        this._evictedLifetime++;
        void this._destroy(rec.conn);
        continue;
      }
      // Track createdAt for the checkout path via a per-conn map.
      this._createdAt.set(rec.conn.id, rec.createdAt);
      return rec;
    }
    return null;
  }

  /** createdAt side-table for checked-out connections. */
  private readonly _createdAt: Map<string, number> = new Map();

  private _createdAtOf(conn: T): number {
    return this._createdAt.get(conn.id) ?? this._clock.now();
  }

  private async _destroy(conn: T): Promise<void> {
    this._createdAt.delete(conn.id);
    try {
      await this._factory.destroy(conn);
    } finally {
      this._totalDestroyed++;
    }
  }

  private _enqueueWaiter(): Promise<T> {
    const deadline =
      this._acquireTimeoutMs > 0
        ? this._clock.now() + this._acquireTimeoutMs
        : Infinity;

    return new Promise<T>((resolve, reject) => {
      const waiter: Waiter<T> = { resolve, reject, deadline, settled: false };
      this._waiters.push(waiter);

      // Real-time backstop: when the caller injects a manual clock it
      // owns time — timers would fire on wall-clock ms and break
      // determinism, so we mark manual clocks with `isManual` and let
      // tests drive expiry via `release`/advance instead.
      if (this._acquireTimeoutMs > 0 && !isManualClock(this._clock)) {
        const timer = setTimeout(() => {
          if (!waiter.settled) {
            waiter.settled = true;
            this._acquireTimeouts++;
            const idx = this._waiters.indexOf(waiter);
            if (idx >= 0) {
              this._waiters.splice(idx, 1);
            }
            reject(new AcquireTimeoutError(this._acquireTimeoutMs));
          }
        }, this._acquireTimeoutMs);
        // Keep the timer from pinning the event loop.
        if (typeof timer.unref === 'function') {
          timer.unref();
        }
      }
    });
  }

  /**
   * When a release frees capacity, either hand the released conn to a
   * waiter (done in `release`) or, when the conn was destroyed, kick
   * off a replacement create for the head waiter if there's room.
   */
  private _wakeOrCreateForWaiters(): void {
    const waiter = this._nextLiveWaiter();
    if (!waiter || this._closed) {
      return;
    }
    if (this._size + this._pending >= this._maxSize) {
      return; // still full — next release will try again
    }
    this._pending++;
    void Promise.resolve(this._factory.create())
      .then(async (conn) => {
        this._pending--;
        this._totalCreated++;
        if (this._closed) {
          await this._destroy(conn);
          waiter.settled = true;
          waiter.reject(new PoolClosedError());
          return;
        }
        this._createdAt.set(conn.id, this._clock.now());
        waiter.settled = true;
        this._out.set(conn.id, conn);
        this._totalAcquired++;
        waiter.resolve(conn);
      })
      .catch((err) => {
        this._pending--;
        waiter.settled = true;
        waiter.reject(err);
      });
  }

  /** Dequeue the first unsettled, unexpired waiter; expire stale ones. */
  private _nextLiveWaiter(): Waiter<T> | null {
    const now = this._clock.now();
    while (this._waiters.length > 0) {
      const w = this._waiters.shift() as Waiter<T>;
      if (w.settled) {
        continue;
      }
      if (now > w.deadline) {
        w.settled = true;
        this._acquireTimeouts++;
        w.reject(new AcquireTimeoutError(this._acquireTimeoutMs));
        continue;
      }
      return w;
    }
    return null;
  }

  /**
   * Top the idle stack up to `minIdle`. Creations are sequential —
   * parallel warm-up would need Promise.all but sequential keeps the
   * factory contract simple and warm-up is a cold-start concern.
   */
  private async _ensureMinIdle(): Promise<void> {
    while (this._idle.length < this._minIdle && this._size + this._pending < this._maxSize) {
      this._pending++;
      try {
        const conn = await this._factory.create();
        this._pending--;
        this._totalCreated++;
        const now = this._clock.now();
        this._createdAt.set(conn.id, now);
        this._idle.push({ conn, idleSince: now, createdAt: now });
      } catch {
        this._pending--;
        break; // factory failing — don't spin
      }
    }
  }
}
