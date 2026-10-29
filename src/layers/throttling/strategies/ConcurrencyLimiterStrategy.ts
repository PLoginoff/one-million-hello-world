/**
 * Concurrency limiter — a counting semaphore with a FIFO waiter queue.
 *
 * Caps the number of concurrently executing operations. Permits are
 * acquired via {@link acquire} (async — resolves immediately if a permit is
 * free, otherwise the caller is queued FIFO) and returned via
 * {@link release}. The {@link run} convenience wraps acquire/work/release.
 *
 * Data structure: a counter + a plain array as a FIFO of pending resolvers.
 * Acquire is O(1) amortized; release is O(1). Fairness: strict FIFO — no
 * barging, no starvation (a queued acquirer always gets the next permit).
 *
 * Supports a bounded queue with optional per-waiter timeout — waiters
 * whose deadline expires are evicted and rejected, keeping latency bounded
 * under sustained overload.
 *
 * @module Throttling/Strategies
 */

import {
  QueueTimeoutError,
  ThrottleMetrics,
  ThrottleRejectedError,
  TimerSource,
  SystemTimerSource,
  TimerHandle,
  emptyMetrics,
} from '../domain/throttle-model';

export interface ConcurrencyLimiterOptions {
  /** Max concurrent permits. */
  readonly maxConcurrent: number;
  /** Max queued waiters; overflow is rejected immediately. Default ∞. */
  readonly maxQueue?: number;
  /** Per-waiter queue timeout, ms. 0/undefined = wait forever. */
  readonly queueTimeoutMs?: number;
  readonly timer?: TimerSource;
}

interface Waiter {
  resolve(): void;
  reject(err: Error): void;
  timeoutHandle?: TimerHandle;
}

export class ConcurrencyLimiterStrategy {
  readonly name = 'concurrency-limiter';

  private readonly _maxConcurrent: number;
  private readonly _maxQueue: number;
  private readonly _queueTimeoutMs: number;
  private readonly _timer: TimerSource;
  private _inFlight = 0;
  private readonly _queue: Waiter[] = [];
  private readonly _metrics: ThrottleMetrics = emptyMetrics();

  constructor(options: ConcurrencyLimiterOptions) {
    if (options.maxConcurrent <= 0) {
      throw new Error('maxConcurrent must be > 0');
    }
    this._maxConcurrent = options.maxConcurrent;
    this._maxQueue = options.maxQueue ?? Number.POSITIVE_INFINITY;
    this._queueTimeoutMs = options.queueTimeoutMs ?? 0;
    this._timer = options.timer ?? new SystemTimerSource();
  }

  get inFlight(): number {
    return this._inFlight;
  }

  get queueDepth(): number {
    return this._queue.length;
  }

  metrics(): ThrottleMetrics {
    return {
      ...this._metrics,
      inFlight: this._inFlight,
      queueDepth: this._queue.length,
    };
  }

  /**
   * Acquires a permit. Resolves when granted; rejects
   * {@link ThrottleRejectedError} on queue overflow or
   * {@link QueueTimeoutError} on per-waiter timeout.
   */
  acquire(): Promise<void> {
    if (this._inFlight < this._maxConcurrent) {
      this._inFlight++;
      this._metrics.admitted++;
      return Promise.resolve();
    }
    if (this._queue.length >= this._maxQueue) {
      this._metrics.rejected++;
      return Promise.reject(new ThrottleRejectedError('concurrency queue full', 'queue-full'));
    }
    this._metrics.queued++;
    return new Promise<void>((resolve, reject) => {
      const waiter: Waiter = {
        resolve: () => {
          this._metrics.dequeued++;
          resolve();
        },
        reject: (err) => reject(err),
      };
      if (this._queueTimeoutMs > 0) {
        waiter.timeoutHandle = this._timer.schedule(this._queueTimeoutMs, () => {
          const idx = this._queue.indexOf(waiter);
          if (idx >= 0) {
            this._queue.splice(idx, 1);
            this._metrics.timedOut++;
            waiter.reject(new QueueTimeoutError(this._queueTimeoutMs));
          }
        });
      }
      this._queue.push(waiter);
    });
  }

  /**
   * Returns a permit, waking the longest-waiting queued acquirer (FIFO).
   * Releasing more times than acquired is a programming error — throws.
   */
  release(): void {
    if (this._inFlight <= 0) {
      throw new Error('release() without a held permit');
    }
    // Hand the permit directly to the next waiter — inFlight stays
    // constant instead of dip-then-rise, preserving the FIFO guarantee.
    const waiter = this._queue.shift();
    if (waiter) {
      waiter.timeoutHandle?.cancel();
      waiter.resolve();
      // inFlight unchanged — permit transferred, not returned.
      return;
    }
    this._inFlight--;
  }

  /**
   * Runs `work` holding a permit. Acquire waits time out per
   * {@link ConcurrencyLimiterOptions.queueTimeoutMs}.
   */
  async run<T>(work: () => Promise<T> | T): Promise<T> {
    await this.acquire();
    try {
      return await work();
    } finally {
      this.release();
    }
  }

  /** Drain — reject all queued waiters (e.g. on shutdown). */
  drain(reason = 'limiter drained'): void {
    while (this._queue.length > 0) {
      const w = this._queue.shift()!;
      w.timeoutHandle?.cancel();
      w.reject(new ThrottleRejectedError(reason, 'closed'));
    }
  }
}
