/**
 * Circuit Breaker Engine — shared types.
 *
 * Vocabulary:
 * - `BreakerEngineClock`   — injectable monotonic clock; probe scheduling,
 *                            metrics windows and open-state timeouts are all
 *                            deterministic under `ManualEngineClock`.
 * - `EndpointBreaker`      — one breaker instance bound to a route/key.
 * - `BreakerRegistry`      — lazily creates one breaker per endpoint with a
 *                            shared config template and per-endpoint overrides.
 * - `ProbeScheduler`       — bounds how many half-open probes may run
 *                            concurrently fleet-wide, so a fleet of open
 *                            breakers can't stampede a recovering backend.
 * - `AutoTuner`            — adjusts a breaker's failure threshold / reset
 *                            timeout from observed error rates.
 * - `FallbackChain`        — ordered list of fallbacks tried until one
 *                            produces an acceptable result.
 * - `BreakerSnapshot`      — serializable state of every registered breaker,
 *                            for persistence across process restarts.
 *
 * @module CircuitBreakerLayer/Engine
 */

/* ------------------------------------------------------------------ */
/* Clock                                                               */
/* ------------------------------------------------------------------ */

export interface BreakerEngineClock {
  now(): number;
}

export class SystemEngineClock implements BreakerEngineClock {
  now(): number {
    return Date.now();
  }
}

/** Deterministic clock for tests. */
export class ManualEngineClock implements BreakerEngineClock {
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

export class BreakerEngineError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'BreakerEngineError';
    this.code = code;
    if (typeof Error.captureStackTrace === 'function') {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

/** Thrown when a call is rejected because the circuit is open. */
export class CircuitRejectionError extends BreakerEngineError {
  readonly endpoint: string;
  readonly retryAfterMs: number;

  constructor(endpoint: string, retryAfterMs: number) {
    super('CIRCUIT_OPEN', `Circuit for "${endpoint}" is open; retry in ${retryAfterMs}ms`);
    this.name = 'CircuitRejectionError';
    this.endpoint = endpoint;
    this.retryAfterMs = retryAfterMs;
  }
}

/** Thrown when the probe scheduler's queue is saturated. */
export class ProbeQueueFullError extends BreakerEngineError {
  constructor(maxQueued: number) {
    super('PROBE_QUEUE_FULL', `Probe queue is full (max ${maxQueued})`);
    this.name = 'ProbeQueueFullError';
  }
}

/** Thrown when every fallback in a chain fails. */
export class FallbackChainExhaustedError extends BreakerEngineError {
  readonly attempts: number;
  readonly lastError: unknown;

  constructor(attempts: number, lastError: unknown) {
    const detail = lastError instanceof Error ? lastError.message : String(lastError);
    super('FALLBACK_EXHAUSTED', `All ${attempts} fallbacks failed; last error: ${detail}`);
    this.name = 'FallbackChainExhaustedError';
    this.attempts = attempts;
    this.lastError = lastError;
  }
}

/* ------------------------------------------------------------------ */
/* Breaker model                                                       */
/* ------------------------------------------------------------------ */

export enum BreakerState {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN',
  HALF_OPEN = 'HALF_OPEN',
}

/** Per-endpoint breaker configuration. */
export interface EndpointBreakerConfig {
  /** Consecutive failures before opening. Default 5. */
  failureThreshold?: number;
  /** Successes in half-open before closing. Default 2. */
  successThreshold?: number;
  /** How long an open breaker waits before allowing a probe (ms). Default 30s. */
  resetTimeoutMs?: number;
  /** Optional rolling window (ms); 0 = count since last state change. */
  windowMs?: number;
  /** Predicate deciding whether an error counts as a failure. Default: all. */
  isFailure?: (err: unknown) => boolean;
  clock?: BreakerEngineClock;
}

export interface BreakerStats {
  state: BreakerState;
  consecutiveFailures: number;
  consecutiveSuccesses: number;
  totalCalls: number;
  totalFailures: number;
  totalRejections: number;
  lastFailureAt: number;
  lastStateChangeAt: number;
}

/** Serializable snapshot of one breaker (for `BreakerSnapshot`). */
export interface BreakerStateSnapshot {
  endpoint: string;
  state: BreakerState;
  consecutiveFailures: number;
  consecutiveSuccesses: number;
  totalCalls: number;
  totalFailures: number;
  totalRejections: number;
  lastFailureAt: number;
  openedAt: number;
}

/** Whole-registry snapshot, versioned for forward compatibility. */
export interface BreakerRegistrySnapshot {
  version: 1;
  takenAt: number;
  breakers: BreakerStateSnapshot[];
}
