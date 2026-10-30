/**
 * Service Engine — Shared Types
 *
 * Type definitions for the executable service core:
 * - Unit-of-work per operation (transaction script)
 * - Service middleware pipeline
 * - Idempotency-key store with response replay
 * - Timeout + bulkhead (concurrency cap)
 * - Retry with jitter and circuit-breaker hooks
 *
 * Unlike the `use-cases/` tree — which models *named* business
 * operations — this engine is the *execution substrate* services run
 * on: ordering guarantees, bounded resources, replay dedup.
 *
 * @module ServiceLayer/Engine
 */

// ---------------------------------------------------------------------------
// Unit of work / transaction script
// ---------------------------------------------------------------------------

/**
 * Unit of work abstraction. `commit()`/`rollback()` bracket an
 * operation; `execute()` provides the operation body.
 *
 * Implementations hold the real resources (in-memory stores, staging
 * buffers). The engine only sequences them.
 */
export interface UnitOfWork {
  /** Execute the operation body inside the unit. */
  execute<T>(operation: () => Promise<T>): Promise<T>;
  /** Commit staged changes. */
  commit(): Promise<void>;
  /** Discard staged changes. */
  rollback(): Promise<void>;
}

/** Factory producing a fresh unit of work per operation. */
export type UnitOfWorkFactory = () => UnitOfWork;

// ---------------------------------------------------------------------------
// Service middleware
// ---------------------------------------------------------------------------

/** Service-call context carried through middleware. */
export interface ServiceCallContext {
  /** Operation name (for logs/metrics). */
  readonly operation: string;
  /** Correlation id. */
  readonly correlationId?: string;
  /** Per-call deadline epoch-ms (optional). */
  readonly deadlineMs?: number;
  /** Free-form bag. */
  readonly state: Record<string, unknown>;
}

/** Next-call function — same onion shape as middleware layer. */
export type ServiceNext<T> = () => Promise<T>;

/** Service middleware signature. */
export type ServiceMiddleware = <T>(
  context: ServiceCallContext,
  next: ServiceNext<T>
) => Promise<T>;

// ---------------------------------------------------------------------------
// Idempotency
// ---------------------------------------------------------------------------

/** Stored response for an idempotency key. */
export interface IdempotencyRecord {
  /** The deduplication key. */
  readonly key: string;
  /** Serialized response payload. */
  readonly storedResponse: unknown;
  /** Timestamp the record was written (epoch ms). */
  readonly recordedAtMs: number;
  /** Time-to-live in ms; expired records are evicted lazily. */
  readonly ttlMs: number;
}

/** Configuration for the idempotency store. */
export interface IdempotencyConfig {
  /** Default TTL for records (ms). */
  readonly defaultTtlMs: number;
  /** Maximum records retained; overflow evicts oldest. */
  readonly maxRecords: number;
}

// ---------------------------------------------------------------------------
// Bulkhead + timeout
// ---------------------------------------------------------------------------

/** Bulkhead configuration — concurrency cap per service instance. */
export interface BulkheadConfig {
  /** Maximum concurrent in-flight operations. */
  readonly maxConcurrent: number;
  /** Maximum waiters queued for a slot (0 = unbounded). */
  readonly maxQueued: number;
  /** Queue-wait timeout in ms (rejects waiters that exceed it). */
  readonly queueTimeoutMs: number;
}

/** Bulkhead statistics. */
export interface BulkheadStats {
  readonly inFlight: number;
  readonly queued: number;
  readonly acquired: number;
  readonly rejected: number;
  readonly timedOutInQueue: number;
}

/** Raised when the bulkhead queue is saturated. */
export class BulkheadRejectionError extends Error {
  constructor(public readonly inFlight: number, public readonly queued: number) {
    super(`Bulkhead saturated: ${inFlight} in-flight, ${queued} queued`);
    this.name = 'BulkheadRejectionError';
  }
}

/** Raised when a queued waiter exceeds `queueTimeoutMs`. */
export class BulkheadQueueTimeoutError extends Error {
  constructor(public readonly waitedMs: number) {
    super(`Bulkhead queue wait exceeded ${waitedMs}ms`);
    this.name = 'BulkheadQueueTimeoutError';
  }
}

/** Raised when the service operation exceeds its deadline. */
export class ServiceTimeoutError extends Error {
  readonly timeoutMs: number;
  constructor(timeoutMs: number) {
    super(`Service operation exceeded timeout of ${timeoutMs}ms`);
    this.name = 'ServiceTimeoutError';
    this.timeoutMs = timeoutMs;
  }
}

// ---------------------------------------------------------------------------
// Retry + circuit breaker
// ---------------------------------------------------------------------------

/** Retry policy knobs. */
export interface RetryPolicy {
  /** Max attempts (including the initial call). */
  readonly maxAttempts: number;
  /** Base delay between attempts (ms). */
  readonly baseDelayMs: number;
  /** Max cap on per-attempt delay (ms). */
  readonly maxDelayMs: number;
  /** Jitter ratio in [0,1] applied to the computed delay. */
  readonly jitterRatio: number;
  /** Predicate: which errors are retryable. */
  readonly retryable?: (error: unknown) => boolean;
}

/** Circuit-breaker integration hooks — implemented by the breaker. */
export interface CircuitBreakerHooks {
  /** Called before each attempt; throw to fail fast while open. */
  beforeCall(): void;
  /** Called after a successful call. */
  onSuccess(): void;
  /** Called after a failure that counted toward the breaker. */
  onFailure(error: unknown): void;
}

/** Outcome of a resilient call (retry + breaker + timeout + bulkhead). */
export interface ResilienceReport<T> {
  readonly result: T;
  readonly attempts: number;
  readonly totalMs: number;
  readonly retried: boolean;
  readonly breakerOpen: boolean;
}
