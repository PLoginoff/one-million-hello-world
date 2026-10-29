/**
 * Queue-based throttle — bounded FIFO queue in front of a worker pool,
 * with per-request wait timeout and full rejection metrics.
 *
 * Unlike {@link ConcurrencyLimiterStrategy} (a passive semaphore), this
 * strategy owns the dispatch loop: `submit` enqueues a job, a dispatcher
 * drains the queue respecting `maxConcurrent`, and each queued job has a
 * `timeoutMs` deadline after which it is rejected (QueueTimeoutError)
 * rather than executed.
 *
 * Metrics distinguish queue-full rejections from timeout rejections and
 * report per-state counts — the standard SRE queue-health signals.
 *
 * Dispatch: after each completion the dispatcher pulls the next job and
 * starts it — O(1) per completion, FIFO order, no busy-waiting.
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

export interface QueueThrottleOptions {
  /** Concurrent workers. */
  readonly maxConcurrent: number;
  /** Max queued jobs; submissions beyond this reject immediately. */
  readonly maxQueue: number;
  /** Max ms a job may wait before execution; 0 = no timeout. */
  readonly timeoutMs?: number;
  readonly timer?: TimerSource;
}

interface Job<T> {
  work: () => Promise<T> | T;
  resolve(v: T): void;
  reject(e: Error): void;
  timeoutHandle?: TimerHandle;
  enqueuedAt: number;
}

export class QueueThrottleStrategy {
  readonly name = 'queue-throttle';

  private readonly _maxConcurrent: number;
  private readonly _maxQueue: number;
  private readonly _timeoutMs: number;
  private readonly _timer: TimerSource;
  private readonly _queue: Job<unknown>[] = [];
  private _inFlight = 0;
  private readonly _metrics: ThrottleMetrics = emptyMetrics();
  /** Per-request wait-time samples (bounded) for latency percentiles. */
  private readonly _waitSamples: number[] = [];

  constructor(options: QueueThrottleOptions) {
    this._maxConcurrent = options.maxConcurrent;
    this._maxQueue = options.maxQueue;
    this._timeoutMs = options.timeoutMs ?? 0;
    this._timer = options.timer ?? new SystemTimerSource();
  }

  metrics(): ThrottleMetrics {
    return { ...this._metrics, inFlight: this._inFlight, queueDepth: this._queue.length };
  }

  /** Approximate queue wait percentiles from recent samples (≤256 kept). */
  waitPercentiles(): { p50: number; p95: number; p99: number } {
    if (this._waitSamples.length === 0) {
      return { p50: 0, p95: 0, p99: 0 };
    }
    const sorted = [...this._waitSamples].sort((a, b) => a - b);
    const pick = (q: number) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
    return { p50: pick(0.5), p95: pick(0.95), p99: pick(0.99) };
  }

  /** Submits work; resolves with its result or rejects on timeout/full. */
  submit<T>(work: () => Promise<T> | T): Promise<T> {
    if (this._queue.length >= this._maxQueue) {
      this._metrics.rejected++;
      return Promise.reject(new ThrottleRejectedError('queue full', 'queue-full'));
    }
    // Fast path — a worker is free and nobody is queued (FIFO fairness).
    if (this._inFlight < this._maxConcurrent && this._queue.length === 0) {
      this._inFlight++;
      this._metrics.admitted++;
      return this._exec({ work, resolve: () => undefined, reject: () => undefined, enqueuedAt: this._timer.now() });
    }
    this._metrics.queued++;
    return new Promise<T>((resolve, reject) => {
      const job: Job<T> = {
        work,
        resolve,
        reject,
        enqueuedAt: this._timer.now(),
      };
      if (this._timeoutMs > 0) {
        job.timeoutHandle = this._timer.schedule(this._timeoutMs, () => {
          const idx = this._queue.indexOf(job as Job<unknown>);
          if (idx >= 0) {
            this._queue.splice(idx, 1);
            this._metrics.timedOut++;
            reject(new QueueTimeoutError(this._timeoutMs));
          }
        });
      }
      this._queue.push(job as Job<unknown>);
    });
  }

  /** Alias for submit — reads naturally at call sites. */
  run<T>(work: () => Promise<T> | T): Promise<T> {
    return this.submit(work);
  }

  /** Rejects all queued jobs (in-flight completes). */
  drain(): void {
    while (this._queue.length > 0) {
      const job = this._queue.shift()!;
      job.timeoutHandle?.cancel();
      job.reject(new ThrottleRejectedError('throttle drained', 'closed'));
    }
  }

  /* --------------------------- dispatcher --------------------------- */

  private async _exec<T>(job: Job<T>): Promise<T> {
    this._recordWait(job);
    try {
      const result = await job.work();
      return result;
    } finally {
      this._inFlight--;
      this._dispatch();
    }
  }

  /** Pulls the next job when a worker frees up. */
  private _dispatch(): void {
    if (this._inFlight >= this._maxConcurrent || this._queue.length === 0) {
      return;
    }
    const job = this._queue.shift()!;
    job.timeoutHandle?.cancel();
    this._inFlight++;
    this._metrics.dequeued++;
    void this._exec(job).then(
      (v) => job.resolve(v),
      (e) => job.reject(e instanceof Error ? e : new Error(String(e)))
    );
  }

  private _recordWait(job: Job<unknown>): void {
    const waited = this._timer.now() - job.enqueuedAt;
    this._waitSamples.push(waited);
    if (this._waitSamples.length > 256) {
      this._waitSamples.shift();
    }
  }
}
