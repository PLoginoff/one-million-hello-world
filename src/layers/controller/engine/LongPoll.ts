/**
 * Long-Polling Support — deferred responses with timeout.
 *
 * A long-poll request parks inside a `Deferred` until either data
 * arrives (`resolve`) or the deadline expires (`timeout`). The engine
 * keeps a keyed registry so producers publish by topic and every
 * parked waiter on that topic resolves at once — the standard
 * "hold the request open until there's something to say" pattern
 * behind `/wait?since=N` endpoints.
 *
 * Timeouts use an injectable scheduler (same shape as the service
 * engine's `ManualScheduler`) so tests drive the clock deterministically
 * instead of sleeping.
 *
 * Ordering: waiters park in FIFO per topic; a `publish` resolves every
 * queued waiter with the same value (fan-out), not just the head —
 * long-polling semantics are "notify all subscribers", not a work queue.
 *
 * @module ControllerLayer/Engine
 */

import { Deferred, LongPollOutcome } from './streaming-types';

// ---------------------------------------------------------------------------
// Scheduler (same shape as ServicePipeline's, kept local to stay decoupled)
// ---------------------------------------------------------------------------

export interface PollScheduler {
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

export class SystemPollScheduler implements PollScheduler {
  setTimeout(fn: () => void, ms: number): unknown {
    return setTimeout(fn, ms);
  }
  clearTimeout(handle: unknown): void {
    clearTimeout(handle as ReturnType<typeof setTimeout>);
  }
}

/** Deterministic scheduler for tests — `tick(ms)` fires expired timers. */
export class ManualPollScheduler implements PollScheduler {
  private _queue: Array<{ at: number; fn: () => void; handle: unknown }> = [];
  private _now = 0;

  setTimeout(fn: () => void, ms: number): { at: number } {
    const handle = { at: this._now + ms };
    this._queue.push({ at: handle.at, fn, handle });
    this._queue.sort((a, b) => a.at - b.at);
    return handle;
  }

  clearTimeout(handle: unknown): void {
    const idx = this._queue.findIndex((e) => e.handle === handle);
    if (idx >= 0) {
      this._queue.splice(idx, 1);
    }
  }

  /** Advance the virtual clock, firing expired callbacks in order. */
  tick(ms: number): void {
    this._now += ms;
    while (this._queue.length > 0 && this._queue[0].at <= this._now) {
      const entry = this._queue.shift();
      if (entry !== undefined) {
        entry.fn();
      }
    }
  }

  get pendingTimers(): number {
    return this._queue.length;
  }
}

// ---------------------------------------------------------------------------
// Deferred
// ---------------------------------------------------------------------------

/** Internal settled flag so `resolve`/`cancel` don't double-settle. */
interface DeferredState<T> {
  settled: boolean;
  resolveOutcome: (o: LongPollOutcome<T>) => void;
  timerHandle: unknown;
  startedMs: number;
}

/** Options for {@link LongPollHub.wait}. */
export interface WaitOptions {
  /** Max ms to hold the request (required — boundless holds leak). */
  readonly timeoutMs: number;
  /** Clock for `waitedMs` reporting — defaults to Date.now. */
  readonly now?: () => number;
}

function makeDeferred<T>(
  timeoutMs: number,
  scheduler: PollScheduler,
  now: () => number
): { deferred: Deferred<T>; state: DeferredState<T> } {
  const state: DeferredState<T> = {
    settled: false,
    resolveOutcome: () => undefined,
    timerHandle: undefined,
    startedMs: now(),
  };
  const promise = new Promise<LongPollOutcome<T>>((res) => {
    state.resolveOutcome = res;
  });
  const finish = (outcome: LongPollOutcome<T>): void => {
    if (state.settled) {
      return;
    }
    state.settled = true;
    scheduler.clearTimeout(state.timerHandle);
    state.resolveOutcome(outcome);
  };
  state.timerHandle = scheduler.setTimeout(() => {
    finish({ kind: 'timeout', waitedMs: now() - state.startedMs });
  }, timeoutMs);

  return {
    deferred: {
      promise,
      resolve(value: T): void {
        finish({ kind: 'resolved', value, waitedMs: now() - state.startedMs });
      },
      cancel(): void {
        finish({ kind: 'timeout', waitedMs: now() - state.startedMs });
      },
    },
    state,
  };
}

// ---------------------------------------------------------------------------
// Hub
// ---------------------------------------------------------------------------

/** Registry of parked waiters keyed by topic. */
export class LongPollHub {
  private readonly _waiters: Map<string, Array<Deferred<unknown>>>;
  private readonly _scheduler: PollScheduler;
  private readonly _now: () => number;
  private _published: number;
  private _timedOut: number;

  constructor(options?: { scheduler?: PollScheduler; now?: () => number }) {
    this._waiters = new Map();
    this._scheduler = options?.scheduler ?? new SystemPollScheduler();
    this._now = options?.now ?? (() => Date.now());
    this._published = 0;
    this._timedOut = 0;
  }

  /** Currently parked waiters across all topics. */
  get parkedCount(): number {
    let n = 0;
    for (const arr of this._waiters.values()) {
      n += arr.length;
    }
    return n;
  }

  /** Park a request on `topic` until `publish` or timeout. */
  wait<T>(topic: string, options: WaitOptions): Deferred<T> {
    const { deferred } = makeDeferred<T>(options.timeoutMs, this._scheduler, this._now);
    const bucket = this._waiters.get(topic) ?? [];
    bucket.push(deferred as Deferred<unknown>);
    this._waiters.set(topic, bucket);

    // Track timeout outcomes for stats.
    void deferred.promise.then((o) => {
      if (o.kind === 'timeout') {
        this._timedOut += 1;
      }
      this.remove(topic, deferred as Deferred<unknown>);
    });
    return deferred;
  }

  /**
   * Resolve every parked waiter on `topic` with `value` (fan-out).
   * Returns the number of waiters woken.
   */
  publish<T>(topic: string, value: T): number {
    const bucket = this._waiters.get(topic);
    if (bucket === undefined || bucket.length === 0) {
      return 0;
    }
    for (const d of bucket) {
      d.resolve(value);
    }
    this._published += bucket.length;
    this._waiters.delete(topic);
    return bucket.length;
  }

  /** Topics with parked waiters. */
  topics(): readonly string[] {
    return [...this._waiters.keys()];
  }

  /** Stats. */
  stats(): { published: number; timedOut: number; parked: number } {
    return { published: this._published, timedOut: this._timedOut, parked: this.parkedCount };
  }

  private remove(topic: string, deferred: Deferred<unknown>): void {
    const bucket = this._waiters.get(topic);
    if (bucket === undefined) {
      return;
    }
    const idx = bucket.indexOf(deferred);
    if (idx >= 0) {
      bucket.splice(idx, 1);
    }
    if (bucket.length === 0) {
      this._waiters.delete(topic);
    }
  }
}
