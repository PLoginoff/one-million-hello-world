/**
 * Facade Engine — shared types.
 *
 * Vocabulary:
 * - `FacadeEngineClock`   — injectable clock; aggregation timeouts and
 *                           cache TTLs are deterministic under
 *                           `ManualEngineClock`.
 * - `AggregationEngine`   — fans one request out to N subsystems and
 *                           merges the results; per-subsystem timeouts,
 *                           partial-failure tolerance.
 * - `BatchFacade`         — one call → N operations, each independent;
 *                           collects per-item results without
 *                           fail-fast semantics.
 * - `CachedFacade`        — response cache in front of a facade method
 *                           with explicit invalidation hooks.
 * - `OrchestrationFacade` — sequential step pipeline with early exit,
 *                           per-step compensation hooks, and a typed
 *                           context threaded between steps.
 *
 * @module FacadeLayer/Engine
 */

/* ------------------------------------------------------------------ */
/* Clock                                                               */
/* ------------------------------------------------------------------ */

export interface FacadeEngineClock {
  now(): number;
}

export class SystemEngineClock implements FacadeEngineClock {
  now(): number {
    return Date.now();
  }
}

/** Deterministic clock for tests. */
export class ManualEngineClock implements FacadeEngineClock {
  private _t = 0;
  now(): number {
    return this._t;
  }
  advance(ms: number): void {
    this._t += ms;
  }
  set(ms: number): void {
    this._t = ms;
  }
}

/* ------------------------------------------------------------------ */
/* Errors                                                              */
/* ------------------------------------------------------------------ */

export class FacadeEngineError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'FacadeEngineError';
    this.code = code;
    if (typeof Error.captureStackTrace === 'function') {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

/** A subsystem didn't answer within its timeout. */
export class SubsystemTimeoutError extends FacadeEngineError {
  readonly subsystem: string;
  readonly timeoutMs: number;

  constructor(subsystem: string, timeoutMs: number) {
    super('SUBSYSTEM_TIMEOUT', `Subsystem "${subsystem}" timed out after ${timeoutMs}ms`);
    this.name = 'SubsystemTimeoutError';
    this.subsystem = subsystem;
    this.timeoutMs = timeoutMs;
  }
}

/** A required subsystem failed — the aggregation cannot complete. */
export class RequiredSubsystemError extends FacadeEngineError {
  readonly subsystem: string;
  override readonly cause: unknown;

  constructor(subsystem: string, cause: unknown) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    super('REQUIRED_SUBSYSTEM_FAILED', `Required subsystem "${subsystem}" failed: ${detail}`);
    this.name = 'RequiredSubsystemError';
    this.subsystem = subsystem;
    this.cause = cause;
  }
}

/** An orchestration step failed; earlier steps were compensated. */
export class StepFailedError extends FacadeEngineError {
  readonly step: string;
  readonly stepIndex: number;
  override readonly cause: unknown;

  constructor(step: string, stepIndex: number, cause: unknown) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    super('STEP_FAILED', `Step ${stepIndex} ("${step}") failed: ${detail}`);
    this.name = 'StepFailedError';
    this.step = step;
    this.stepIndex = stepIndex;
    this.cause = cause;
  }
}

/** Step asked to stop the pipeline early with a result. */
export class EarlyExit<T = unknown> {
  readonly value: T;
  constructor(value: T) {
    this.value = value;
  }
}

/* ------------------------------------------------------------------ */
/* Subsystem shape                                                     */
/* ------------------------------------------------------------------ */

/**
 * One subsystem contributing to an aggregated response. `name` is used
 * in timeouts/errors and as the merge key.
 */
export interface Subsystem<T = unknown> {
  readonly name: string;
  /** Per-subsystem timeout (ms); `0` = engine default. */
  timeoutMs?: number;
  /** True when this subsystem MUST produce a result — failure fails the aggregation. */
  required?: boolean;
  call(): Promise<T> | T;
}
