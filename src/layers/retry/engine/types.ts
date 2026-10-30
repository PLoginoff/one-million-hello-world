/**
 * Retry Engine — shared types.
 *
 * Vocabulary:
 * - `RetryEngineClock`   — injectable clock; budgets refill, retry-after
 *                          delays and adaptive backoff are all deterministic
 *                          under `ManualEngineClock`.
 * - `RetryBudget`        — token-bucket that bounds retries/sec fleet-wide
 *                          (Google SRE "retry budget" pattern): each retry
 *                          costs a token, tokens refill over time.
 * - `RetryAfterParser`   — parses HTTP `Retry-After` (seconds | HTTP-date |
 *                          delta-ms conventions) into a delay.
 * - `RetryEngine`        — the executor: classifies failure reasons, honors
 *                          retry-after, consults the budget, skips retries
 *                          for non-idempotent operations.
 * - `AdaptiveBackoff`    — learns a per-operation base delay from observed
 *                          success latency (EMA) instead of guessing.
 *
 * @module RetryLayer/Engine
 */

/* ------------------------------------------------------------------ */
/* Clock                                                               */
/* ------------------------------------------------------------------ */

export interface RetryEngineClock {
  now(): number;
}

export class SystemEngineClock implements RetryEngineClock {
  now(): number {
    return Date.now();
  }
}

/** Deterministic clock for tests. */
export class ManualEngineClock implements RetryEngineClock {
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

export class RetryEngineError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'RetryEngineError';
    this.code = code;
    if (typeof Error.captureStackTrace === 'function') {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

/** Retries stopped because the budget is exhausted (fail-fast). */
export class RetryBudgetExhaustedError extends RetryEngineError {
  readonly scope: string;
  constructor(scope: string) {
    super('BUDGET_EXHAUSTED', `Retry budget for "${scope}" is exhausted; not retrying`);
    this.name = 'RetryBudgetExhaustedError';
    this.scope = scope;
  }
}

/** The operation is non-idempotent and must not be retried. */
export class NonIdempotentError extends RetryEngineError {
  constructor() {
    super('NON_IDEMPOTENT', 'Operation is not marked idempotent; refusing to retry');
    this.name = 'NonIdempotentError';
  }
}

/* ------------------------------------------------------------------ */
/* Failure classification                                              */
/* ------------------------------------------------------------------ */

/** Why an attempt failed — drives retry eligibility and delay choice. */
export enum RetryReason {
  /** The operation exceeded its deadline (no response received). */
  TIMEOUT = 'timeout',
  /** The transport/connector threw (connection refused, DNS, reset). */
  TRANSPORT_ERROR = 'transport-error',
  /** Server answered 5xx. */
  SERVER_ERROR = 'server-error',
  /** Server answered 429 — retry-after usually present. */
  RATE_LIMITED = 'rate-limited',
  /** Server answered 4xx (non-429) — usually NOT retryable. */
  CLIENT_ERROR = 'client-error',
  /** Anything else (thrown non-HTTP error, assertion, bug). */
  UNKNOWN = 'unknown',
}

/**
 * Failure descriptor handed to the classifier. Produced by whoever
 * wraps the transport — the engine never inspects raw exceptions for
 * HTTP semantics it can't see.
 */
export interface AttemptFailure {
  /** Error thrown, if the attempt threw. */
  error?: unknown;
  /** HTTP status code, if a response was received. */
  statusCode?: number;
  /** True when the attempt hit the caller's deadline. */
  timedOut?: boolean;
  /** Raw `Retry-After` header value, if present. */
  retryAfterHeader?: string;
}

/** Classify `failure` into a `RetryReason` + whether retrying is sane. */
export interface ClassifiedFailure {
  reason: RetryReason;
  /** Whether this class of failure is retryable at all. */
  retryable: boolean;
  /** Server-mandated delay parsed from retry-after, if any (ms). */
  retryAfterMs?: number;
}

/** Idempotency surface: callers tag operations so the engine can refuse. */
export type Idempotency = 'idempotent' | 'non-idempotent' | 'unknown';

/** FNV-1a 32-bit hash — dependency-free fingerprinting for dedup keys. */
export function fnv1a32(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h >>> 0;
}
