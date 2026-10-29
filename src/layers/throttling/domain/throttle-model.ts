/**
 * Shared primitives for the throttling layer.
 *
 * Every throttler answers one question — *admit this request now, queue it,
 * or reject it?* — and reports a uniform {@link ThrottleMetrics} record so
 * operators can compare strategies on dashboards.
 *
 * Time is injectable: {@link TimerSource} abstracts both `now()` and
 * `setTimeout` so tests drive virtual time deterministically (no flaky
 * wall-clock-dependent assertions).
 *
 * @module Throttling/Domain
 */

/** What the throttler decided about a request. */
export type AdmissionDecision = 'admitted' | 'queued' | 'rejected';

/** Uniform counters every strategy maintains. */
export interface ThrottleMetrics {
  admitted: number;
  rejected: number;
  queued: number;
  /** Requests that waited then ran. */
  dequeued: number;
  /** Queued requests that timed out before running. */
  timedOut: number;
  /** Requests merged into an in-flight identical request (coalescing). */
  coalesced: number;
  /** Current in-flight count (concurrency). */
  inFlight: number;
  /** Current queue depth. */
  queueDepth: number;
}

export function emptyMetrics(): ThrottleMetrics {
  return {
    admitted: 0,
    rejected: 0,
    queued: 0,
    dequeued: 0,
    timedOut: 0,
    coalesced: 0,
    inFlight: 0,
    queueDepth: 0,
  };
}

/* ------------------------------------------------------------------ */
/* Timer abstraction                                                   */
/* ------------------------------------------------------------------ */

export interface TimerHandle {
  cancel(): void;
}

export interface TimerSource {
  now(): number;
  /** Like setTimeout. `fn` must fire exactly once unless cancelled. */
  schedule(afterMs: number, fn: () => void): TimerHandle;
}

/** Wall-clock timers. */
export class SystemTimerSource implements TimerSource {
  now(): number {
    return Date.now();
  }
  schedule(afterMs: number, fn: () => void): TimerHandle {
    const t = setTimeout(fn, Math.max(0, afterMs));
    return { cancel: () => clearTimeout(t) };
  }
}

/**
 * Virtual-time timer source. `advance(ms)` moves the clock and fires due
 * callbacks on the next microtask — so `await Promise.resolve()` after an
 * advance lets fired callbacks run, matching how the workflow layer's
 * ManualTimerScheduler behaves.
 */
export class ManualTimerSource implements TimerSource {
  private _now = 0;
  private _pending: { deadline: number; fn: () => void; cancelled: boolean }[] = [];

  now(): number {
    return this._now;
  }

  schedule(afterMs: number, fn: () => void): TimerHandle {
    const entry = { deadline: this._now + afterMs, fn, cancelled: false };
    this._pending.push(entry);
    if (entry.deadline <= this._now) {
      queueMicrotask(() => this._drain());
    }
    return { cancel: () => (entry.cancelled = true) };
  }

  /** Move virtual time; due callbacks fire on upcoming microtasks. */
  advance(ms: number): void {
    this._now += ms;
    queueMicrotask(() => this._drain());
  }

  /** Synchronously fire all due callbacks — use when determinism matters. */
  flush(): void {
    this._drain();
  }

  private _drain(): void {
    for (;;) {
      const due = this._pending
        .filter((p) => !p.cancelled && p.deadline <= this._now)
        .sort((a, b) => a.deadline - b.deadline);
      if (due.length === 0) {
        break;
      }
      for (const p of due) {
        p.cancelled = true;
        p.fn();
      }
      this._pending = this._pending.filter((p) => !p.cancelled);
    }
  }

  pendingCount(): number {
    return this._pending.filter((p) => !p.cancelled).length;
  }
}

/* ------------------------------------------------------------------ */
/* Errors                                                              */
/* ------------------------------------------------------------------ */

/** Thrown when a request is rejected outright (no capacity). */
export class ThrottleRejectedError extends Error {
  constructor(
    message: string,
    readonly reason: 'at-capacity' | 'queue-full' | 'timeout' | 'low-priority' | 'closed'
  ) {
    super(message);
    this.name = 'ThrottleRejectedError';
  }
}

/** Thrown when a queued request's wait deadline expires. */
export class QueueTimeoutError extends ThrottleRejectedError {
  constructor(waitedMs: number) {
    super(`request timed out after ${waitedMs}ms in queue`, 'timeout');
    this.name = 'QueueTimeoutError';
  }
}
