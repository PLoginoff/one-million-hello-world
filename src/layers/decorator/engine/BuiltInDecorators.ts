/**
 * BuiltInDecorators — production-grade reference decorators built on the
 * engine primitives.
 *
 * Each factory returns an `IEngineDecorator` so callers compose them via
 * the registry like any custom decorator. They also serve as executable
 * documentation for the hook model:
 *
 * - `loggingDecorator`     — before/after hooks + state bag for latency
 * - `timingDecorator`      — after-hook latency recording (histogram)
 * - `retryDecorator`       — around hook calling `next` repeatedly
 * - `memoizeDecorator`     — around hook that may skip `next` entirely
 * - `conditionalDecorator` — adapter turning a raw predicate + decorator
 *                            into a conditional decorator
 *
 * @module DecoratorLayer/Engine
 */

import {
  AroundHook,
  DecorationContext,
  DecoratorClock,
  IEngineDecorator,
  SystemDecoratorClock,
} from './types';

/* ------------------------------------------------------------------ */
/* Logging                                                             */
/* ------------------------------------------------------------------ */

export interface LogSink {
  (level: 'debug' | 'info' | 'warn' | 'error', message: string, fields: Record<string, unknown>): void;
}

export interface LoggingDecoratorOptions {
  readonly name?: string;
  readonly priority?: number;
  readonly sink: LogSink;
  /** Log resolved values on success. Default false (avoid PII leaks). */
  readonly logResult?: boolean;
}

/**
 * Records entry/exit of each invocation. Demonstrates passing data
 * between a decorator's own hooks via `ctx.state`.
 */
export function loggingDecorator(options: LoggingDecoratorOptions): IEngineDecorator {
  const key = '__logging_started';
  return {
    name: options.name ?? 'logging',
    priority: options.priority ?? 100, // outer-ish: see everything
    before: (ctx: DecorationContext) => {
      ctx.state.set(key, ctx.startedAt);
      options.sink('info', `${ctx.memberName} invoked`, {
        member: ctx.memberName,
        argCount: ctx.args.length,
      });
    },
    after: (ctx: DecorationContext) => {
      const fields: Record<string, unknown> = {
        member: ctx.memberName,
        failed: ctx.error !== undefined && !ctx.errorHandled,
      };
      if (options.logResult && ctx.error === undefined) {
        fields.result = ctx.result;
      }
      options.sink('info', `${ctx.memberName} completed`, fields);
    },
  };
}

/* ------------------------------------------------------------------ */
/* Timing                                                              */
/* ------------------------------------------------------------------ */

/**
 * Records per-invocation durations in a bounded ring and exposes
 * percentile queries over the recorded window.
 *
 * Implementation: fixed-capacity circular buffer (O(1) insert) +
 * on-demand sorted-copy percentile query (O(n log n), n ≤ capacity —
 * fine for diagnostics, not for hot paths).
 */
export class TimingRecorder {
  private readonly _clock: DecoratorClock;
  private readonly _samples: number[];
  private _head: number;
  private _count: number;

  constructor(capacity: number = 1024, clock?: DecoratorClock) {
    this._clock = clock ?? new SystemDecoratorClock();
    this._samples = new Array<number>(Math.max(1, capacity));
    this._head = 0;
    this._count = 0;
  }

  record(durationMs: number): void {
    this._samples[this._head] = durationMs;
    this._head = (this._head + 1) % this._samples.length;
    this._count = Math.min(this._count + 1, this._samples.length);
  }

  get count(): number {
    return this._count;
  }

  /** Nearest-rank percentile over the recorded window. */
  percentile(p: number): number {
    if (this._count === 0) {
      return 0;
    }
    const sorted = this._samples.slice(0, this._count).sort((a, b) => a - b);
    const idx = Math.min(
      sorted.length - 1,
      Math.max(0, Math.ceil((p / 100) * sorted.length) - 1)
    );
    return sorted[idx] as number;
  }

  get max(): number {
    return this._count === 0 ? 0 : Math.max(...this._samples.slice(0, this._count));
  }
}

export interface TimingDecoratorOptions {
  readonly name?: string;
  readonly priority?: number;
  readonly recorder: TimingRecorder;
  readonly clock?: DecoratorClock;
}

/** Around-hook that records end-to-end latency into `recorder`. */
export function timingDecorator(options: TimingDecoratorOptions): IEngineDecorator {
  const clock = options.clock ?? new SystemDecoratorClock();
  const around: AroundHook = async (ctx, next) => {
    const start = clock.now();
    try {
      return await next();
    } finally {
      options.recorder.record(clock.now() - start);
    }
  };
  return {
    name: options.name ?? 'timing',
    priority: options.priority ?? 90,
    around,
  };
}

/* ------------------------------------------------------------------ */
/* Retry                                                               */
/* ------------------------------------------------------------------ */

export interface RetryDecoratorOptions {
  readonly name?: string;
  readonly priority?: number;
  /** Total attempts including the first. Must be >= 1. */
  readonly attempts: number;
  /** Decide whether a thrown error is retryable. Default: all are. */
  readonly retryable?: (error: unknown) => boolean;
  /** Backoff between attempts (ms). Default: constant 0. */
  readonly backoffMs?: (attempt: number) => number;
  /** Sleep implementation; injectable for tests. */
  readonly sleep?: (ms: number) => Promise<void>;
}

/**
 * Around hook that re-invokes `next` on retryable failures. Because it
 * calls `next` (which re-runs everything inside it, including the raw
 * call), idempotence is the caller's responsibility.
 *
 * This is *not* self-healing: it retries the same inner. See
 * `SelfHealingDecorator` for swapping a poisoned inner.
 */
export function retryDecorator(options: RetryDecoratorOptions): IEngineDecorator {
  const attempts = Math.max(1, Math.floor(options.attempts));
  const retryable = options.retryable ?? (() => true);
  const backoff = options.backoffMs ?? (() => 0);
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));

  const around: AroundHook = async (_ctx, next) => {
    let lastError: unknown;
    for (let attempt = 1; attempt <= attempts; attempt++) {
      try {
        return await next();
      } catch (err) {
        lastError = err;
        if (attempt === attempts || !retryable(err)) {
          throw err;
        }
        const delay = backoff(attempt);
        if (delay > 0) {
          await sleep(delay);
        }
      }
    }
    throw lastError;
  };
  return {
    name: options.name ?? 'retry',
    priority: options.priority ?? 50, // mid-chain: retries see inner decorators
    around,
  };
}

/* ------------------------------------------------------------------ */
/* Memoize                                                             */
/* ------------------------------------------------------------------ */

export interface MemoizeDecoratorOptions {
  readonly name?: string;
  readonly priority?: number;
  /** Key from invocation args. Must be deterministic + collision-free. */
  readonly keyOf: (ctx: DecorationContext) => string;
  /** Max cached entries; LRU-ish eviction of oldest when full. */
  readonly capacity?: number;
}

/**
 * Around hook that short-circuits `next` on cache hits. Uses a Map —
 * iteration order is insertion order, so deleting+re-setting on hit
 * gives cheap LRU semantics (O(1) amortized).
 */
export function memoizeDecorator(options: MemoizeDecoratorOptions): IEngineDecorator {
  const capacity = Math.max(1, options.capacity ?? 256);
  const cache = new Map<string, unknown>();

  const around: AroundHook = async (ctx, next) => {
    const key = options.keyOf(ctx);
    if (cache.has(key)) {
      const value = cache.get(key);
      // Refresh recency: delete+set moves key to newest position.
      cache.delete(key);
      cache.set(key, value);
      ctx.state.set('__memoized', true);
      return value;
    }
    const value = await next();
    cache.set(key, value);
    if (cache.size > capacity) {
      // Evict oldest (first key in iteration order).
      const oldest = cache.keys().next();
      if (!oldest.done) {
        cache.delete(oldest.value);
      }
    }
    return value;
  };
  return {
    name: options.name ?? 'memoize',
    priority: options.priority ?? 30, // inner-ish: cache sees fewest transforms
    around,
  };
}

/* ------------------------------------------------------------------ */
/* Conditional adapter                                                 */
/* ------------------------------------------------------------------ */

/**
 * Wrap a decorator so it applies only when `predicate` passes.
 * Equivalent to setting `decorator.predicate`, but non-destructive and
 * composable.
 */
export function conditionalDecorator(
  decorator: IEngineDecorator,
  predicate: (ctx: DecorationContext) => boolean | Promise<boolean>,
  name?: string
): IEngineDecorator {
  return { ...decorator, name: name ?? decorator.name, predicate };
}
