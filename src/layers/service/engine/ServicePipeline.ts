/**
 * Service Pipeline — Service Middleware Composition
 *
 * Composes an ordered list of `ServiceMiddleware` around an operation
 * using the same onion model as HTTP middleware (reduceRight closure
 * chain), with the key differences services need:
 *
 * - **Idempotency gate**: a keyed request replays a stored response
 *   instead of re-running the operation (deduplication).
 * - **Bulkhead**: concurrency cap + bounded queue per engine instance.
 * - **Timeout**: per-operation deadline race.
 * - **Retry**: exponential backoff with bounded jitter.
 * - **Circuit-breaker hooks**: pluggable failure accounting.
 *
 * @module ServiceLayer/Engine
 */

import {
  BulkheadConfig,
  BulkheadRejectionError,
  BulkheadQueueTimeoutError,
  BulkheadStats,
  CircuitBreakerHooks,
  IdempotencyConfig,
  IdempotencyRecord,
  ResilienceReport,
  RetryPolicy,
  ServiceCallContext,
  ServiceMiddleware,
  ServiceNext,
  ServiceTimeoutError,
} from './types';
import { Clock, SystemClock } from './TransactionScriptRunner';

/** Scheduler for delays + timeouts. */
export interface Scheduler {
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

export class SystemScheduler implements Scheduler {
  setTimeout(fn: () => void, ms: number): unknown {
    return setTimeout(fn, ms);
  }
  clearTimeout(handle: unknown): void {
    clearTimeout(handle as ReturnType<typeof setTimeout>);
  }
}

/** Manual scheduler — tests drive timers deterministically. */
export class ManualScheduler implements Scheduler {
  private _queue: Array<{ at: number; fn: () => void }> = [];
  private _now = 0;

  setTimeout(fn: () => void, ms: number): { at: number; fn: () => void } {
    const entry = { at: this._now + ms, fn };
    this._queue.push(entry);
    this._queue.sort((a, b) => a.at - b.at);
    return entry;
  }

  clearTimeout(handle: unknown): void {
    const idx = this._queue.indexOf(handle as { at: number; fn: () => void });
    if (idx >= 0) {
      this._queue.splice(idx, 1);
    }
  }

  /** Advance the virtual clock, firing expired timers in order. */
  tick(ms: number): void {
    this._now += ms;
    while (this._queue.length > 0 && this._queue[0].at <= this._now) {
      const entry = this._queue.shift();
      if (entry !== undefined) {
        entry.fn();
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Bulkhead
// ---------------------------------------------------------------------------

/**
 * Semaphore-style bulkhead: `acquire()` hands out slots up to
 * `maxConcurrent`; excess callers wait in a FIFO queue (bounded by
 * `maxQueued` and `queueTimeoutMs`). `release()` wakes the next waiter.
 */
export class Bulkhead {
  private readonly _config: BulkheadConfig;
  private _inFlight: number;
  private _acquired: number;
  private _rejected: number;
  private _timedOut: number;
  private _queue: Array<{
    resolve: () => void;
    reject: (e: unknown) => void;
    timer: unknown;
  }>;

  constructor(
    config?: Partial<BulkheadConfig>,
    private readonly _scheduler: Scheduler = new SystemScheduler()
  ) {
    this._config = {
      maxConcurrent: config?.maxConcurrent ?? 10,
      maxQueued: config?.maxQueued ?? 100,
      queueTimeoutMs: config?.queueTimeoutMs ?? 5000,
    };
    this._inFlight = 0;
    this._acquired = 0;
    this._rejected = 0;
    this._timedOut = 0;
    this._queue = [];
  }

  stats(): BulkheadStats {
    return {
      inFlight: this._inFlight,
      queued: this._queue.length,
      acquired: this._acquired,
      rejected: this._rejected,
      timedOutInQueue: this._timedOut,
    };
  }

  /** Acquire a slot — resolves when admitted, rejects on saturation. */
  async acquire(): Promise<() => void> {
    if (this._inFlight < this._config.maxConcurrent) {
      this._inFlight++;
      this._acquired++;
      return () => this.release();
    }
    if (this._queue.length >= this._config.maxQueued) {
      this._rejected++;
      throw new BulkheadRejectionError(this._inFlight, this._queue.length);
    }

    return new Promise<() => void>((resolve, reject) => {
      const waiter = {
        resolve: (): void => {
          this._scheduler.clearTimeout(waiter.timer);
          this._inFlight++;
          this._acquired++;
          resolve(() => this.release());
        },
        reject: (e: unknown): void => {
          this._scheduler.clearTimeout(waiter.timer);
          reject(e);
        },
        timer: this._scheduler.setTimeout(() => {
          const idx = this._queue.indexOf(waiter);
          if (idx >= 0) {
            this._queue.splice(idx, 1);
            this._timedOut++;
            reject(new BulkheadQueueTimeoutError(this._config.queueTimeoutMs));
          }
        }, this._config.queueTimeoutMs),
      };
      this._queue.push(waiter);
    });
  }

  /** Release a slot; wakes the head of the queue FIFO. */
  private release(): void {
    this._inFlight--;
    const next = this._queue.shift();
    next?.resolve();
  }
}

// ---------------------------------------------------------------------------
// Retry + timeout
// ---------------------------------------------------------------------------

/** Default retry policy. */
export const DEFAULT_RETRY_POLICY: RetryPolicy = {
  maxAttempts: 3,
  baseDelayMs: 50,
  maxDelayMs: 2000,
  jitterRatio: 0.5,
};

/**
 * Compute the nth-attempt delay: `base * 2^n`, capped at `maxDelayMs`,
 * with jitter sampled uniformly from `[d(1-j), d(1+j)]`.
 */
export function retryDelay(policy: RetryPolicy, attempt: number, rng: () => number = Math.random): number {
  const exp = policy.baseDelayMs * Math.pow(2, attempt);
  const capped = Math.min(exp, policy.maxDelayMs);
  const j = policy.jitterRatio;
  const spread = capped * j;
  return Math.max(0, capped - spread + rng() * 2 * spread);
}

/**
 * Race `promise` against `timeoutMs`; rejects with `ServiceTimeoutError`.
 * Timer is always cleared.
 */
export function withTimeout<T>(promise: Promise<T>, timeoutMs: number, scheduler: Scheduler = new SystemScheduler()): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = scheduler.setTimeout(() => {
      reject(new ServiceTimeoutError(timeoutMs));
    }, timeoutMs);
    promise.then(
      (res) => {
        scheduler.clearTimeout(timer);
        resolve(res);
      },
      (err: unknown) => {
        scheduler.clearTimeout(timer);
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    );
  });
}

// ---------------------------------------------------------------------------
// Idempotency store
// ---------------------------------------------------------------------------

/** Raised when a replayed response's content-type mismatches. */
export class IdempotencyMismatchError extends Error {
  constructor(key: string) {
    super(`Idempotency key "${key}" was used with a different request payload`);
    this.name = 'IdempotencyMismatchError';
  }
}

/**
 * In-memory idempotency store: key → recorded response + payload
 * fingerprint. Replay returns the stored response; mismatched payload
 * for the same key surfaces as a client bug.
 */
export class InMemoryIdempotencyStore {
  private readonly _config: IdempotencyConfig;
  private readonly _records: Map<string, IdempotencyRecord & { fingerprint: string }>;
  private readonly _clock: Clock;

  constructor(config?: Partial<IdempotencyConfig>, clock: Clock = new SystemClock()) {
    this._config = {
      defaultTtlMs: config?.defaultTtlMs ?? 24 * 60 * 60 * 1000,
      maxRecords: config?.maxRecords ?? 10000,
    };
    this._records = new Map();
    this._clock = clock;
  }

  get size(): number {
    return this._records.size;
  }

  /**
   * Look up `key`; replay the stored response when found and live.
   *
   * @returns Stored response or `undefined` on miss/expired.
   * @throws IdempotencyMismatchError when the key exists but the
   *         fingerprint differs (same key, different request).
   */
  lookup(key: string, fingerprint: string): unknown | undefined {
    const record = this._records.get(key);
    if (record === undefined) {
      return undefined;
    }
    if (this._clock.now() - record.recordedAtMs > record.ttlMs) {
      this._records.delete(key);
      return undefined;
    }
    if (record.fingerprint !== fingerprint) {
      throw new IdempotencyMismatchError(key);
    }
    return record.storedResponse;
  }

  /**
   * Store a response under `key`. Evicts the oldest record at capacity.
   */
  store(key: string, fingerprint: string, response: unknown, ttlMs?: number): void {
    if (this._records.size >= this._config.maxRecords) {
      const oldest = this._records.keys().next();
      if (!oldest.done) {
        this._records.delete(oldest.value);
      }
    }
    this._records.set(key, {
      key,
      storedResponse: response,
      fingerprint,
      recordedAtMs: this._clock.now(),
      ttlMs: ttlMs ?? this._config.defaultTtlMs,
    });
  }

  /**
   * Fingerprint a request payload — stable hash of its JSON form.
   * Simple FNV-1a so it stays dependency-free and deterministic.
   */
  static fingerprint(payload: unknown): string {
    const text = JSON.stringify(payload) ?? '';
    let h = 0x811c9dc5;
    for (let i = 0; i < text.length; i++) {
      h = Math.imul(h ^ text.charCodeAt(i), 0x01000193) >>> 0;
    }
    return h.toString(16).padStart(8, '0');
  }
}

// ---------------------------------------------------------------------------
// Pipeline
// ---------------------------------------------------------------------------

/** Options for the service pipeline. */
export interface ServicePipelineOptions {
  readonly middlewares?: readonly ServiceMiddleware[];
  readonly bulkhead?: Bulkhead;
  readonly idempotency?: InMemoryIdempotencyStore;
  readonly retry?: Partial<RetryPolicy>;
  readonly timeoutMs?: number;
  readonly clock?: Clock;
  readonly scheduler?: Scheduler;
  readonly circuitBreaker?: CircuitBreakerHooks;
  readonly rng?: () => number;
}

/**
 * Composed service-call pipeline. `call()` runs an operation through
 * middleware → bulkhead → idempotency → retry+timeout → breaker.
 */
export class ServicePipeline {
  private readonly _middlewares: readonly ServiceMiddleware[];
  private readonly _bulkhead?: Bulkhead;
  private readonly _idempotency?: InMemoryIdempotencyStore;
  private readonly _retry: RetryPolicy;
  private readonly _timeoutMs?: number;
  private readonly _clock: Clock;
  private readonly _scheduler: Scheduler;
  private readonly _breaker?: CircuitBreakerHooks;
  private readonly _rng: () => number;

  constructor(options?: ServicePipelineOptions) {
    this._middlewares = options?.middlewares ?? [];
    this._bulkhead = options?.bulkhead;
    this._idempotency = options?.idempotency;
    this._retry = { ...DEFAULT_RETRY_POLICY, ...(options?.retry ?? {}) };
    this._timeoutMs = options?.timeoutMs;
    this._clock = options?.clock ?? new SystemClock();
    this._scheduler = options?.scheduler ?? new SystemScheduler();
    this._breaker = options?.circuitBreaker;
    this._rng = options?.rng ?? Math.random;
  }

  /**
   * Run an operation through the full pipeline.
   *
   * @param operationName  Label for the call context.
   * @param fn             Operation body.
   * @param idempotencyKey When set, dedup via the idempotency store.
   * @param payload        Fingerprinted for key-payload mismatch detection.
   */
  async call<T>(
    operationName: string,
    fn: (context: ServiceCallContext) => Promise<T>,
    idempotencyKey?: string,
    payload?: unknown
  ): Promise<ResilienceReport<T>> {
    const context: ServiceCallContext = {
      operation: operationName,
      deadlineMs: this._timeoutMs !== undefined ? this._clock.now() + this._timeoutMs : undefined,
      state: {},
    };

    const start = this._clock.now();
    let attempts = 0;
    let retried = false;
    let breakerOpen = false;

    const body: ServiceNext<T> = async () => {
      // Idempotency replay — only hits count, misses run the op.
      if (this._idempotency !== undefined && idempotencyKey !== undefined) {
        const fingerprint = InMemoryIdempotencyStore.fingerprint(payload);
        const replayed = this._idempotency.lookup(idempotencyKey, fingerprint);
        if (replayed !== undefined) {
          return replayed as T;
        }
        const result = await this._resilientInvoke(fn, context);
        this._idempotency.store(idempotencyKey, fingerprint, result);
        return result;
      }
      return this._resilientInvoke(fn, context);
    };

    const chain = this._middlewares.reduceRight<ServiceNext<T>>(
      (next, mw) => () => mw(context, next),
      body
    );

    const result = await chain();

    return {
      result,
      attempts,
      totalMs: this._clock.now() - start,
      retried,
      breakerOpen,
    };
  }

  /**
   * Retryable invoke: bulkhead slot → timeout → retry loop → breaker.
   */
  private async _resilientInvoke<T>(
    fn: (context: ServiceCallContext) => Promise<T>,
    context: ServiceCallContext
  ): Promise<T> {
    // Bulkhead admission (if configured).
    let release: (() => void) | undefined;
    if (this._bulkhead !== undefined) {
      release = await this._bulkhead.acquire();
    }

    try {
      let lastError: unknown;
      for (let attempt = 0; attempt < this._retry.maxAttempts; attempt++) {
        this._breaker?.beforeCall();
        try {
          const invocation = fn(context);
          const result =
            this._timeoutMs !== undefined
              ? await withTimeout(invocation, this._timeoutMs, this._scheduler)
              : await invocation;
          this._breaker?.onSuccess();
          return result;
        } catch (error) {
          lastError = error;
          this._breaker?.onFailure(error);
          const retryable = this._retry.retryable?.(error) ?? true;
          if (!retryable || attempt + 1 >= this._retry.maxAttempts) {
            break;
          }
          const delay = retryDelay(this._retry, attempt, this._rng);
          await new Promise<void>((resolve) => {
            this._scheduler.setTimeout(resolve, delay);
          });
        }
      }
      throw lastError;
    } finally {
      release?.();
    }
  }
}
