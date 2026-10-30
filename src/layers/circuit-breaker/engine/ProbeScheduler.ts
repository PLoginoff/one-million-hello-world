/**
 * ProbeScheduler — fleet-wide bound on concurrent half-open probes.
 *
 * A single breaker's HALF_OPEN state admits a few probes — but with
 * thousands of endpoints, thousands of simultaneous "few" still form a
 * stampede against a backend that just came back. This scheduler is a
 * semaphore across ALL registered breakers:
 *
 *   - at most `maxConcurrent` probes run fleet-wide;
 *   - excess probes are queued FIFO with a deadline (`queueTimeoutMs`),
 *     after which they're rejected (the caller just retries later);
 *   - a probe is granted only if its breaker actually admits it
 *     (`tryAcquireProbe`), so a scheduler slot is never consumed by a
 *     breaker that returned to OPEN meanwhile;
 *   - `schedule` returns a `ProbeTicket` the caller uses to record the
 *     outcome — the ticket releases its slot exactly once.
 *
 * Fairness: FIFO order. No endpoint can starve another — a probe only
 * waits behind probes that arrived earlier.
 *
 * Complexity: grant/release O(1); queue drain O(queued).
 *
 * @module CircuitBreakerLayer/Engine
 */

import {
  BreakerEngineClock,
  CircuitRejectionError,
  EndpointBreakerConfig,
  ProbeQueueFullError,
  SystemEngineClock,
} from './types';
import { EndpointBreaker } from './EndpointBreaker';

export interface ProbeSchedulerOptions {
  /** Max probes running fleet-wide. Default 8. */
  maxConcurrent?: number;
  /** Max probes waiting for a slot. Default 256. */
  maxQueued?: number;
  /** How long a queued probe waits before being rejected (ms). Default 5s. */
  queueTimeoutMs?: number;
  clock?: BreakerEngineClock;
}

/** Opaque handle — record outcome through it, then it releases its slot. */
export interface ProbeTicket {
  readonly endpoint: string;
  /** True when the slot is still live (outcome not yet recorded). */
  readonly live: boolean;
  success(): void;
  failure(): void;
}

interface QueuedProbe {
  breaker: EndpointBreaker;
  resolve: (t: ProbeTicket) => void;
  reject: (e: unknown) => void;
  deadline: number;
  settled: boolean;
}

export class ProbeScheduler {
  private readonly _clock: BreakerEngineClock;
  private readonly _maxConcurrent: number;
  private readonly _maxQueued: number;
  private readonly _queueTimeoutMs: number;

  private _running = 0;
  private readonly _queue: QueuedProbe[] = [];
  private _granted = 0;
  private _rejectedQueueFull = 0;
  private _rejectedTimeout = 0;
  private _rejectedBreaker = 0;

  constructor(options: ProbeSchedulerOptions = {}) {
    this._clock = options.clock ?? new SystemEngineClock();
    this._maxConcurrent = Math.max(1, options.maxConcurrent ?? 8);
    this._maxQueued = Math.max(1, options.maxQueued ?? 256);
    this._queueTimeoutMs = Math.max(0, options.queueTimeoutMs ?? 5000);
  }

  /**
   * Acquire a probe slot for `breaker`. Resolves a `ProbeTicket` when
   * both a fleet slot AND the breaker's half-open admission allow it.
   * Rejects with `CircuitRejectionError` (breaker refuses) or
   * `ProbeQueueFullError` (scheduler saturated).
   */
  async schedule(breaker: EndpointBreaker): Promise<ProbeTicket> {
    // Fast path: free slot — try to admit immediately.
    if (this._running < this._maxConcurrent) {
      if (breaker.tryAcquireProbe()) {
        this._running++;
        this._granted++;
        return this._makeTicket(breaker);
      }
      this._rejectedBreaker++;
      throw new CircuitRejectionError(breaker.endpoint, breaker.msUntilProbe());
    }

    // Slow path: queue with a deadline.
    if (this._queue.length >= this._maxQueued) {
      this._rejectedQueueFull++;
      throw new ProbeQueueFullError(this._maxQueued);
    }
    return new Promise<ProbeTicket>((resolve, reject) => {
      this._queue.push({
        breaker,
        resolve,
        reject,
        deadline: this._clock.now() + this._queueTimeoutMs,
        settled: false,
      });
    });
  }

  /**
   * Run `probe` through the scheduler: acquire slot → invoke → record
   * outcome on the breaker. The breaker sees the probe result via the
   * ticket, not via `execute`, so the scheduler owns the admission.
   */
  async runProbe<T>(breaker: EndpointBreaker, probe: () => Promise<T> | T): Promise<T> {
    const ticket = await this.schedule(breaker);
    try {
      const r = await probe();
      ticket.success();
      return r;
    } catch (err: unknown) {
      ticket.failure();
      throw err;
    }
  }

  /**
   * Service the wait queue: drop expired waiters, grant freed slots to
   * live ones whose breakers admit them. Called internally on every
   * release; safe to call from a timer as well.
   */
  pump(): void {
    const now = this._clock.now();
    for (let i = this._queue.length - 1; i >= 0; i--) {
      const q = this._queue[i];
      if (q.settled) {
        this._queue.splice(i, 1);
        continue;
      }
      if (now >= q.deadline) {
        q.settled = true;
        this._queue.splice(i, 1);
        this._rejectedTimeout++;
        q.reject(new CircuitRejectionError(q.breaker.endpoint, 0));
      }
    }
    while (this._running < this._maxConcurrent && this._queue.length > 0) {
      const q = this._queue.shift()!;
      if (q.settled) continue;
      if (q.breaker.tryAcquireProbe()) {
        q.settled = true;
        this._running++;
        this._granted++;
        q.resolve(this._makeTicket(q.breaker));
      } else {
        // Breaker won't admit (e.g. went back to OPEN). Drop it.
        q.settled = true;
        this._rejectedBreaker++;
        q.reject(new CircuitRejectionError(q.breaker.endpoint, q.breaker.msUntilProbe()));
      }
    }
  }

  stats(): {
    running: number;
    queued: number;
    granted: number;
    rejectedQueueFull: number;
    rejectedTimeout: number;
    rejectedBreaker: number;
  } {
    return {
      running: this._running,
      queued: this._queue.length,
      granted: this._granted,
      rejectedQueueFull: this._rejectedQueueFull,
      rejectedTimeout: this._rejectedTimeout,
      rejectedBreaker: this._rejectedBreaker,
    };
  }

  /* ---------------------------------------------------------------- */

  private _makeTicket(breaker: EndpointBreaker): ProbeTicket {
    let live = true;
    const scheduler = this;
    return {
      endpoint: breaker.endpoint,
      get live() {
        return live;
      },
      success(): void {
        if (!live) return;
        live = false;
        breaker.recordSuccess();
        scheduler._release();
      },
      failure(): void {
        if (!live) return;
        live = false;
        breaker.recordFailure();
        scheduler._release();
      },
    };
  }

  private _release(): void {
    this._running--;
    this.pump();
  }
}

/** Re-exported for callers that want to construct breakers inline. */
export type { EndpointBreakerConfig };
