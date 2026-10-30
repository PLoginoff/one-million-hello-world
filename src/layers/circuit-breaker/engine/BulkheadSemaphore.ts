/**
 * BulkheadSemaphore — bounded-concurrency isolation between subsystems.
 *
 * The bulkhead pattern (ship compartments): give each dependency its
 * own concurrency limit so a slow/hung one can't consume all the
 * threads and starve everything else. This is a *counting semaphore
 * with a wait queue*:
 *
 *   - `acquire()` resolves immediately while slots are free, else
 *     queues FIFO with a deadline (`maxWaitMs`);
 *   - `release()` hands the freed slot to the oldest live waiter;
 *   - callers get a `BulkheadTicket` whose `release()` is idempotent
 *     (double-release is a silent no-op — a leak is a real bug, an
 *     accidental double-release is not);
 *   - `stats()` exposes running/queued/rejected counts.
 *
 * Like the probe scheduler but endpoint-scoped rather than probe-scoped:
 * a breaker decides *whether* to call; a bulkhead decides *how many*
 * calls may run.
 *
 * @module CircuitBreakerLayer/Engine
 */

import { BreakerEngineClock, SystemEngineClock } from './types';

export class BulkheadRejectedError extends Error {
  readonly name2: string;
  constructor(name: string) {
    super(`Bulkhead "${name}" is full and queue rejected the waiter`);
    this.name = 'BulkheadRejectedError';
    this.name2 = name;
  }
}

export interface BulkheadOptions {
  /** Max concurrent executions. */
  maxConcurrent: number;
  /** Max queued waiters; excess reject immediately. Default 100. */
  maxQueued?: number;
  /** How long a queued waiter waits before being rejected (ms). Default 5s. */
  maxWaitMs?: number;
  clock?: BreakerEngineClock;
}

export interface BulkheadTicket {
  readonly name: string;
  /** Idempotent — second call is a no-op. */
  release(): void;
  /** Run `fn` under the ticket's slot; releases automatically. */
  use<T>(fn: () => Promise<T> | T): Promise<T>;
}

interface Waiter {
  resolve: (t: BulkheadTicket) => void;
  reject: (e: unknown) => void;
  deadline: number;
  settled: boolean;
}

export class BulkheadSemaphore {
  readonly name: string;

  private readonly _clock: BreakerEngineClock;
  private readonly _maxConcurrent: number;
  private readonly _maxQueued: number;
  private readonly _maxWaitMs: number;

  private _running = 0;
  private readonly _queue: Waiter[] = [];
  private _acquired = 0;
  private _released = 0;
  private _rejected = 0;
  private _timedOut = 0;

  constructor(name: string, options: BulkheadOptions) {
    this.name = name;
    this._clock = options.clock ?? new SystemEngineClock();
    this._maxConcurrent = Math.max(1, options.maxConcurrent);
    this._maxQueued = Math.max(0, options.maxQueued ?? 100);
    this._maxWaitMs = Math.max(0, options.maxWaitMs ?? 5000);
  }

  /**
   * Acquire a slot. Resolves a `BulkheadTicket` whose `release()` must
   * be called (or use `ticket.use(fn)` for auto-release). Rejects
   * `BulkheadRejectedError` when queue+slots are saturated.
   */
  async acquire(): Promise<BulkheadTicket> {
    if (this._running < this._maxConcurrent) {
      this._running++;
      this._acquired++;
      return this._ticket();
    }
    if (this._queue.length >= this._maxQueued) {
      this._rejected++;
      throw new BulkheadRejectedError(this.name);
    }
    return new Promise<BulkheadTicket>((resolve, reject) => {
      this._queue.push({
        resolve,
        reject,
        deadline: this._clock.now() + this._maxWaitMs,
        settled: false,
      });
    });
  }

  /** Run `fn` under a slot — the common case. */
  async run<T>(fn: () => Promise<T> | T): Promise<T> {
    const t = await this.acquire();
    return t.use(fn);
  }

  /** Grant freed slots to live waiters; drop expired ones. */
  pump(): void {
    const now = this._clock.now();
    for (let i = this._queue.length - 1; i >= 0; i--) {
      const w = this._queue[i];
      if (w.settled) {
        this._queue.splice(i, 1);
        continue;
      }
      if (now >= w.deadline) {
        w.settled = true;
        this._queue.splice(i, 1);
        this._timedOut++;
        w.reject(new BulkheadRejectedError(this.name));
      }
    }
    while (this._running < this._maxConcurrent && this._queue.length > 0) {
      const w = this._queue.shift()!;
      if (w.settled) continue;
      w.settled = true;
      this._running++;
      this._acquired++;
      w.resolve(this._ticket());
    }
  }

  stats(): { running: number; queued: number; acquired: number; released: number; rejected: number; timedOut: number } {
    return {
      running: this._running,
      queued: this._queue.length,
      acquired: this._acquired,
      released: this._released,
      rejected: this._rejected,
      timedOut: this._timedOut,
    };
  }

  private _ticket(): BulkheadTicket {
    let live = true;
    const self = this;
    return {
      name: this.name,
      release(): void {
        if (!live) return;
        live = false;
        self._running--;
        self._released++;
        self.pump();
      },
      async use<T>(fn: () => Promise<T> | T): Promise<T> {
        try {
          return await fn();
        } finally {
          this.release();
        }
      },
    };
  }
}
