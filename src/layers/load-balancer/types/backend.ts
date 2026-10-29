/**
 * Backend Types for Load Balancer
 *
 * Shared type definitions describing upstream backend servers and the
 * routing inputs consumed by the balancing strategies.
 *
 * @module LoadBalancerLayer/Types
 */

/**
 * Lifecycle/health status of a single backend.
 *
 * - `healthy`   — eligible for routing
 * - `degraded`  — eligible, but weighted down by most strategies
 * - `unhealthy` — excluded from routing until a health probe passes
 * - `draining`  — no new connections; existing connections are allowed to finish
 */
export type BackendStatus = 'healthy' | 'degraded' | 'unhealthy' | 'draining';

/**
 * Immutable description of an upstream backend server.
 */
export interface Backend {
  /** Unique identifier, e.g. `api-us-east-1a-01`. */
  readonly id: string;
  /** DNS name or IP address. */
  readonly host: string;
  /** TCP port. */
  readonly port: number;
  /**
   * Static relative weight (default 1). Used by WeightedRoundRobin and
   * as the divisor for LeastConnections (effective load = conns / weight).
   */
  readonly weight: number;
  /** Arbitrary tags (region, zone, version) available to routing policies. */
  readonly metadata: Readonly<Record<string, string>>;
  /** Whether the backend is administratively enabled. */
  readonly enabled: boolean;
}

/** Options accepted by {@link createBackend}. */
export interface BackendOptions {
  weight?: number;
  metadata?: Record<string, string>;
  enabled?: boolean;
}

/**
 * Construct a {@link Backend} with defaults applied.
 *
 * @param id      unique backend identifier
 * @param host    DNS name or IP
 * @param port    TCP port
 * @param options weight/metadata/enabled overrides
 */
export function createBackend(id: string, host: string, port: number, options: BackendOptions = {}): Backend {
  return {
    id,
    host,
    port,
    weight: Math.max(1, Math.floor(options.weight ?? 1)),
    metadata: Object.freeze({ ...(options.metadata ?? {}) }),
    enabled: options.enabled ?? true,
  };
}

/**
 * A routing decision produced by a balancing strategy.
 */
export interface BackendSelection {
  /** The chosen backend. */
  readonly backend: Backend;
  /** Name of the strategy that made the choice. */
  readonly strategy: string;
  /** Wall-clock selection time in nanoseconds-ish (ms float). */
  readonly selectedAt: number;
  /** Strategy-specific diagnostic info (e.g. chosen score, ring point). */
  readonly diagnostics?: Readonly<Record<string, unknown>>;
}

/**
 * Client/request context handed to {@link IBalancingStrategy.select}.
 */
export interface BalanceRequest {
  /** Remote client IP (for IPHash / sticky sessions). */
  readonly clientIp?: string;
  /** Logical key used by consistent hashing (defaults to clientIp). */
  readonly affinityKey?: string;
  /** HTTP request path, if any. */
  readonly path?: string;
  /** Arbitrary request metadata. */
  readonly metadata?: Readonly<Record<string, unknown>>;
}

/**
 * Contract implemented by every load balancing algorithm.
 *
 * Implementations MUST be safe to call concurrently: selection is pure
 * bookkeeping — the caller owns actually opening the connection.
 */
export interface IBalancingStrategy {
  /** Unique strategy name (e.g. `round-robin`). */
  readonly name: string;

  /**
   * Choose a backend for a request.
   *
   * @param backends live backend pool (tracked instances)
   * @param request  routing context
   * @returns a selection, or `undefined` when no eligible backend exists
   */
  select(backends: readonly BackendPoolEntry[], request: BalanceRequest): BackendSelection | undefined;

  /** Called when a backend joins the pool. Default: no-op. */
  onBackendAdded?(backend: BackendPoolEntry): void;

  /** Called when a backend leaves the pool. Default: no-op. */
  onBackendRemoved?(backend: BackendPoolEntry): void;
}

/**
 * A backend plus its live runtime state inside the pool.
 * The mutable fields are owned by {@link BackendPool}; strategies may read them.
 */
export interface BackendPoolEntry {
  readonly backend: Backend;
  /** Current health status. */
  status: BackendStatus;
  /** Number of in-flight connections/requests. */
  activeConnections: number;
  /** Exponentially-weighted moving average of response time (ms). */
  ewmaResponseTimeMs: number;
  /** Lifetime counters. */
  totalRequests: number;
  totalFailures: number;
  consecutiveFailures: number;
  /** Timestamps for health checking. */
  lastSuccessAt: number;
  lastFailureAt: number;
  /** Rolling window of the last N response samples for percentile stats. */
  readonly recentLatencies: number[];
}

/** Maximum number of latency samples retained per backend. */
export const LATENCY_WINDOW_SIZE = 64;

/**
 * Create the mutable pool entry for a backend.
 */
export function createPoolEntry(backend: Backend): BackendPoolEntry {
  return {
    backend,
    status: backend.enabled ? 'healthy' : 'unhealthy',
    activeConnections: 0,
    ewmaResponseTimeMs: 0,
    totalRequests: 0,
    totalFailures: 0,
    consecutiveFailures: 0,
    lastSuccessAt: 0,
    lastFailureAt: 0,
    recentLatencies: [],
  };
}

/**
 * Record a completed request on a pool entry (side-effecting helper shared
 * by the pool and by tests that simulate completions).
 *
 * @param entry      pool entry to update
 * @param latencyMs  observed request latency
 * @param ok         whether the request succeeded
 * @param now        timestamp override (defaults to Date.now())
 */
export function recordRequestCompletion(
  entry: BackendPoolEntry,
  latencyMs: number,
  ok: boolean,
  now: number = Date.now()
): void {
  entry.activeConnections = Math.max(0, entry.activeConnections - 1);
  entry.totalRequests += 1;

  const latency = Math.max(0, latencyMs);
  if (entry.ewmaResponseTimeMs === 0) {
    entry.ewmaResponseTimeMs = latency;
  } else {
    // EWMA with alpha = 0.2 — recent samples dominate but history decays smoothly.
    entry.ewmaResponseTimeMs = 0.2 * latency + 0.8 * entry.ewmaResponseTimeMs;
  }

  entry.recentLatencies.push(latency);
  if (entry.recentLatencies.length > LATENCY_WINDOW_SIZE) {
    entry.recentLatencies.shift();
  }

  if (ok) {
    entry.lastSuccessAt = now;
    entry.consecutiveFailures = 0;
  } else {
    entry.lastFailureAt = now;
    entry.totalFailures += 1;
    entry.consecutiveFailures += 1;
  }
}

/**
 * Return true when an entry is eligible to receive new traffic.
 */
export function isEligible(entry: BackendPoolEntry): boolean {
  return entry.backend.enabled && (entry.status === 'healthy' || entry.status === 'degraded');
}

/**
 * Filter helper: returns only routable entries.
 */
export function eligibleBackends(pool: readonly BackendPoolEntry[]): BackendPoolEntry[] {
  return pool.filter(isEligible);
}
