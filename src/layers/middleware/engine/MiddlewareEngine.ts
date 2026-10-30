/**
 * Middleware Composition Engine
 *
 * The executable core of the middleware layer: composes an ordered list
 * of middleware into a single dispatch function using the classic
 * "onion" model (each middleware wraps the remaining chain), while
 * adding enterprise semantics the raw pattern lacks:
 *
 * - **Conditional execution**: per-middleware predicates (path/method
 *   matchers included) skip non-applicable stages. Skips are recorded
 *   — observability without noise.
 * - **Per-middleware timeouts**: each stage can be bounded in wall
 *   time via an injectable clock. A timed-out stage raises
 *   `MiddlewareTimeoutError`; whether it aborts the pipeline depends
 *   on `continueOnError`.
 * - **Short-circuit support**: a middleware that returns a response
 *   without calling `next()` terminates the chain (auth rejection,
 *   cached response, etc).
 * - **Error policy**: by default a thrown error aborts the pipeline.
 *   With `continueOnError`, the error is forwarded to the configured
 *   error listener and execution proceeds.
 * - **Execution reports**: every dispatch produces a
 *   {@link PipelineExecutionReport} — ordered invocation records with
 *   durations, flags for skipped/timed-out/short-circuited, and the
 *   final response. Feeds {@link MiddlewareMetricsCollector} and tests.
 *
 * Implementation notes:
 * - Composition uses reduceRight over the registration list, producing
 *   a nested closure chain — O(n) build, O(n) dispatch, zero shared
 *   state between dispatches.
 * - Timeout enforcement uses `Promise.race` against a scheduled
 *   rejection. The losing branch isn't cancelled (JS can't), but the
 *   engine records the timeout and marks the invocation accordingly.
 * - An injectable `Clock` (`now()`) drives all timing so tests are
 *   deterministic.
 *
 * @module MiddlewareLayer/Engine
 */

import {
  MiddlewareFunction,
  MiddlewareInvocationRecord,
  MiddlewarePredicate,
  MiddlewareRegistration,
  PipelineExecutionReport,
  PipelineHandler,
  PipelineNext,
  PipelineRequest,
  PipelineResponse,
} from './types';
import { CorrelationContextPropagator } from './CorrelationContextPropagator';
import { MiddlewareMetricsCollector } from './MiddlewareMetrics';

/** Clock abstraction — injectable for deterministic tests. */
export interface Clock {
  now(): number;
}

/** Wall clock backed by Date.now. */
export class SystemClock implements Clock {
  now(): number {
    return Date.now();
  }
}

/** Manual clock for tests. */
export class ManualClock implements Clock {
  private _current: number;

  constructor(start = 0) {
    this._current = start;
  }

  now(): number {
    return this._current;
  }

  advance(ms: number): void {
    this._current += ms;
  }
}

/** Scheduler abstraction for the timeout race. */
export interface Scheduler {
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

/** Default scheduler delegating to global timers. */
export class SystemScheduler implements Scheduler {
  setTimeout(fn: () => void, ms: number): unknown {
    return setTimeout(fn, ms);
  }
  clearTimeout(handle: unknown): void {
    clearTimeout(handle as ReturnType<typeof setTimeout>);
  }
}

/**
 * Raised when a middleware exceeds its configured timeout.
 */
export class MiddlewareTimeoutError extends Error {
  readonly middlewareName: string;
  readonly timeoutMs: number;

  constructor(middlewareName: string, timeoutMs: number) {
    super(`Middleware '${middlewareName}' exceeded timeout of ${timeoutMs}ms`);
    this.name = 'MiddlewareTimeoutError';
    this.middlewareName = middlewareName;
    this.timeoutMs = timeoutMs;
  }
}

/** Optional listener hooks for engine events. */
export interface MiddlewareEngineHooks {
  /** Called after every middleware invocation (executed or skipped). */
  readonly onInvocation?: (record: MiddlewareInvocationRecord) => void;
  /** Called when a middleware throws and `continueOnError` swallows it. */
  readonly onSwallowedError?: (name: string, error: unknown) => void;
}

/** Engine options. */
export interface MiddlewareEngineOptions {
  readonly clock?: Clock;
  readonly scheduler?: Scheduler;
  readonly propagator?: CorrelationContextPropagator;
  readonly metrics?: MiddlewareMetricsCollector;
  readonly hooks?: MiddlewareEngineHooks;
}

// ---------------------------------------------------------------------------
// Predicate helpers — common conditional-execution patterns
// ---------------------------------------------------------------------------

/** Match request path exactly or via a RegExp. */
export function pathMatches(pattern: string | RegExp): MiddlewarePredicate {
  if (typeof pattern === 'string') {
    const normalized = pattern.endsWith('*')
      ? new RegExp(`^${pattern.slice(0, -1).replace(/[.+?^${}()|[\]\\]/g, '\\$&')}`)
      : null;
    return (req) =>
      normalized !== null ? normalized.test(req.path) : req.path === pattern;
  }
  return (req) => pattern.test(req.path);
}

/** Match request method (case-insensitive, multi). */
export function methodIn(...methods: string[]): MiddlewarePredicate {
  const upper = new Set(methods.map((m) => m.toUpperCase()));
  return (req) => upper.has(req.method.toUpperCase());
}

/** Match an exact header value. */
export function headerEquals(name: string, value: string): MiddlewarePredicate {
  const key = name.toLowerCase();
  return (req) => req.headers[key] === value;
}

/** Logical combinators for composing predicates. */
export function and(...predicates: MiddlewarePredicate[]): MiddlewarePredicate {
  return (req) => predicates.every((p) => p(req));
}

export function or(...predicates: MiddlewarePredicate[]): MiddlewarePredicate {
  return (req) => predicates.some((p) => p(req));
}

export function not(predicate: MiddlewarePredicate): MiddlewarePredicate {
  return (req) => !predicate(req);
}

// ---------------------------------------------------------------------------
// Engine
// ---------------------------------------------------------------------------

/**
 * Composed middleware chain with enterprise semantics.
 *
 * Build via `new MiddlewareEngine([...registrations], options)` then
 * `dispatch(request, handler)`.
 */
export class MiddlewareEngine {
  private readonly _registrations: readonly MiddlewareRegistration[];
  private readonly _clock: Clock;
  private readonly _scheduler: Scheduler;
  private readonly _propagator: CorrelationContextPropagator;
  private readonly _metrics?: MiddlewareMetricsCollector;
  private readonly _hooks: MiddlewareEngineHooks;

  constructor(registrations: readonly MiddlewareRegistration[] = [], options?: MiddlewareEngineOptions) {
    this._registrations = registrations;
    this._clock = options?.clock ?? new SystemClock();
    this._scheduler = options?.scheduler ?? new SystemScheduler();
    this._propagator = options?.propagator ?? new CorrelationContextPropagator();
    this._metrics = options?.metrics;
    this._hooks = options?.hooks ?? {};
  }

  /** Registered middleware names in execution order. */
  names(): string[] {
    return this._registrations.map((r) => r.name);
  }

  /** Registrations (immutable view). */
  registrations(): readonly MiddlewareRegistration[] {
    return this._registrations;
  }

  /** Propagator used by the engine (for context injection into spans). */
  get propagator(): CorrelationContextPropagator {
    return this._propagator;
  }

  /**
   * Dispatch a request through the composed chain.
   *
   * Builds a nested `next()` closure via reduceRight: middleware[i]
   * wraps middleware[i+1] ... wraps the terminal handler. Each call
   * evaluates predicates first — failing predicates short-circuit to
   * the next stage without running the middleware body.
   *
   * @param request  Incoming request record.
   * @param handler  Terminal handler producing the response.
   * @returns        Execution report with per-stage invocation records.
   */
  async dispatch(
    request: PipelineRequest,
    handler: PipelineHandler
  ): Promise<PipelineExecutionReport> {
    const invocations: MiddlewareInvocationRecord[] = [];
    const startedAt = this._clock.now();

    const chain = this._compose(request, invocations, handler);
    const response = await chain();

    const report: PipelineExecutionReport = {
      requestId: request.id,
      invocations,
      totalDurationMs: this._clock.now() - startedAt,
      response,
    };
    return report;
  }

  /**
   * Build the nested closure chain for one dispatch.
   *
   * reduceRight walks registrations from tail to head; the accumulator
   * is the "rest of the chain" `next` function each middleware closes
   * over. First element ends up outermost.
   */
  private _compose(
    request: PipelineRequest,
    invocations: MiddlewareInvocationRecord[],
    handler: PipelineHandler
  ): PipelineNext {
    const terminal: PipelineNext = () => handler(request);

    return this._registrations.reduceRight<PipelineNext>(
      (next, registration, index) => {
        return () => this._invoke(registration, index, request, next, invocations);
      },
      terminal
    );
  }

  /**
   * Execute one middleware stage: predicate gate → optional timeout
   * race → invocation record → metrics/hook emission.
   */
  private async _invoke(
    registration: MiddlewareRegistration,
    index: number,
    request: PipelineRequest,
    next: PipelineNext,
    invocations: MiddlewareInvocationRecord[]
  ): Promise<PipelineResponse> {
    // --- predicate gate ---------------------------------------------------
    const applicable = (registration.predicates ?? []).every((p) => p(request));
    if (!applicable) {
      const record = this._record(index, registration.name, {
        durationMs: 0,
        executed: false,
        calledNext: false,
        timedOut: false,
        failed: false,
      });
      invocations.push(record);
      this._emit(record);
      return next();
    }

    const start = this._clock.now();
    let calledNext = false;
    let timedOut = false;
    let failed = false;
    let caught: unknown;

    const trackedNext: PipelineNext = () => {
      calledNext = true;
      return next();
    };

    const invoke = async (): Promise<PipelineResponse> =>
      registration.fn(request, trackedNext);

    let response: PipelineResponse | undefined;
    try {
      if (registration.timeoutMs !== undefined && registration.timeoutMs > 0) {
        response = await this._withTimeout(invoke(), registration.name, registration.timeoutMs);
      } else {
        response = await invoke();
      }
    } catch (error) {
      failed = true;
      caught = error;
      if (error instanceof MiddlewareTimeoutError) {
        timedOut = true;
      }
      if (registration.continueOnError !== true) {
        const record = this._record(index, registration.name, {
          durationMs: this._clock.now() - start,
          executed: true,
          calledNext,
          timedOut,
          failed,
          error,
        });
        invocations.push(record);
        this._emit(record);
        throw error;
      }
      this._hooks.onSwallowedError?.(registration.name, error);
    }

    const record = this._record(index, registration.name, {
      durationMs: this._clock.now() - start,
      executed: true,
      calledNext,
      timedOut,
      failed,
      error: caught,
    });
    invocations.push(record);
    this._emit(record);

    if (response !== undefined) {
      return response;
    }
    // continueOnError swallowed a failure and produced no response:
    // continue the chain so downstream stages still run.
    return next();
  }

  /**
   * Race `promise` against a scheduled `MiddlewareTimeoutError`.
   *
   * Losing-branch continuation: the timed-out middleware's promise may
   * still resolve later; the `finally` clears the timer handle so the
   * scheduler doesn't keep it alive.
   */
  private _withTimeout(
    promise: Promise<PipelineResponse>,
    name: string,
    timeoutMs: number
  ): Promise<PipelineResponse> {
    return new Promise<PipelineResponse>((resolve, reject) => {
      const timer = this._scheduler.setTimeout(() => {
        reject(new MiddlewareTimeoutError(name, timeoutMs));
      }, timeoutMs);

      promise
        .then((res) => {
          this._scheduler.clearTimeout(timer);
          resolve(res);
        })
        .catch((err: unknown) => {
          this._scheduler.clearTimeout(timer);
          reject(err instanceof Error ? err : new Error(String(err)));
        });
    });
  }

  /** Build an invocation record (keeps call-sites terse). */
  private _record(
    index: number,
    name: string,
    fields: Omit<MiddlewareInvocationRecord, 'name' | 'index'>
  ): MiddlewareInvocationRecord {
    const base: MiddlewareInvocationRecord = {
      name,
      index,
      durationMs: fields.durationMs,
      executed: fields.executed,
      calledNext: fields.calledNext,
      timedOut: fields.timedOut,
      failed: fields.failed,
    };
    return fields.error !== undefined ? { ...base, error: fields.error } : base;
  }

  /** Fan an invocation record out to metrics + hooks. */
  private _emit(record: MiddlewareInvocationRecord): void {
    this._metrics?.record(record);
    this._hooks.onInvocation?.(record);
  }
}

// ---------------------------------------------------------------------------
// Fluent builder — ergonomic alternative to array construction
// ---------------------------------------------------------------------------

/**
 * Builder for {@link MiddlewareEngine} chains.
 *
 * ```ts
 * const engine = MiddlewareEngineBuilder.create()
 *   .use('auth', authMiddleware, { predicates: [pathMatches('/api/*')] })
 *   .use('timing', timingMiddleware, { timeoutMs: 50 })
 *   .build();
 * ```
 */
export class MiddlewareEngineBuilder {
  private readonly _registrations: MiddlewareRegistration[];
  private _options?: MiddlewareEngineOptions;

  private constructor() {
    this._registrations = [];
  }

  static create(): MiddlewareEngineBuilder {
    return new MiddlewareEngineBuilder();
  }

  /**
   * Append a middleware to the chain.
   *
   * @param name    Instrumentation label.
   * @param fn      Middleware function.
   * @param options Predicates, timeout, continueOnError.
   */
  use(
    name: string,
    fn: MiddlewareFunction,
    options?: {
      predicates?: readonly MiddlewarePredicate[];
      timeoutMs?: number;
      continueOnError?: boolean;
    }
  ): MiddlewareEngineBuilder {
    const reg: MiddlewareRegistration = { name, fn };
    const merged = { ...reg, ...options };
    // Ensure optional fields are only present when provided — keeps
    // registrations printable and diffable.
    if (options === undefined) {
      this._registrations.push(reg);
    } else {
      this._registrations.push(merged);
    }
    return this;
  }

  /** Attach engine-wide options (clock, scheduler, hooks, propagator). */
  withOptions(options: MiddlewareEngineOptions): MiddlewareEngineBuilder {
    this._options = options;
    return this;
  }

  /** Materialize the composed engine. */
  build(): MiddlewareEngine {
    return new MiddlewareEngine(this._registrations, this._options);
  }
}
