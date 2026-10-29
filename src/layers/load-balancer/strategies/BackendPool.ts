/**
 * BackendPool
 *
 * Central registry of upstream backends shared by all balancing strategies.
 * Tracks per-backend health state, in-flight connection counts, and latency
 * statistics, and notifies registered strategies when membership changes so
 * strategies like ConsistentHashing can maintain their hash rings.
 *
 * Health model (simple state machine):
 *
 *      probe ok          N probe failures            admin
 *  unhealthy ─────────► healthy ──────────────► unhealthy
 *      ▲                    │                        │
 *      │                    ▼                        │
 *      │                 degraded ◄──── drain ───────┘
 *      │                 (flappy)
 *      └────────────────────┘
 *           probe ok
 *
 * A backend becomes `unhealthy` after `consecutiveFailureThreshold`
 * consecutive failed requests or explicit probe failures. It becomes
 * `degraded` (still routable) when its error rate in the recent window
 * exceeds `degradedErrorRate`.
 *
 * @module LoadBalancerLayer/Strategies
 */

import {
  Backend,
  BackendPoolEntry,
  BackendStatus,
  BalanceRequest,
  BackendSelection,
  IBalancingStrategy,
  createPoolEntry,
  eligibleBackends,
  isEligible,
  recordRequestCompletion,
} from '../types/backend';

/** Pool configuration knobs. */
export interface BackendPoolConfig {
  /**
   * Consecutive failed requests before a backend flips to `unhealthy`.
   * Default: 3.
   */
  consecutiveFailureThreshold?: number;
  /**
   * Fraction of failures inside `recentLatencies`-windowed requests at which
   * the backend is marked `degraded` (routable but deprioritized).
   * Default: 0.5.
   */
  degradedErrorRate?: number;
  /**
   * Maximum time (ms) a backend may stay `unhealthy` before a passive probe
   * (`probe()`) is allowed to half-open it. Default: 10_000.
   */
  unhealthyCooldownMs?: number;
}

interface PoolStats {
  selections: number;
  emptyPoolRejections: number;
  completions: number;
}

/**
 * A live pool of backends with health tracking.
 */
export class BackendPool {
  private readonly _entries: Map<string, BackendPoolEntry>;
  private readonly _strategies: Map<string, IBalancingStrategy>;
  private readonly _failureThreshold: number;
  private readonly _degradedErrorRate: number;
  private readonly _unhealthyCooldownMs: number;
  private readonly _stats: PoolStats;

  constructor(config: BackendPoolConfig = {}) {
    this._entries = new Map();
    this._strategies = new Map();
    this._failureThreshold = Math.max(1, config.consecutiveFailureThreshold ?? 3);
    this._degradedErrorRate = config.degradedErrorRate ?? 0.5;
    this._unhealthyCooldownMs = config.unhealthyCooldownMs ?? 10_000;
    this._stats = { selections: 0, emptyPoolRejections: 0, completions: 0 };
  }

  /** Register a strategy so it receives membership notifications. */
  registerStrategy(strategy: IBalancingStrategy): void {
    this._strategies.set(strategy.name, strategy);
    for (const entry of this._entries.values()) {
      strategy.onBackendAdded?.(entry);
    }
  }

  /** Remove a previously registered strategy. */
  unregisterStrategy(name: string): boolean {
    return this._strategies.delete(name);
  }

  /** Add a backend to the pool. Returns the created entry. */
  addBackend(backend: Backend): BackendPoolEntry {
    const existing = this._entries.get(backend.id);
    if (existing) {
      return existing;
    }
    const entry = createPoolEntry(backend);
    this._entries.set(backend.id, entry);
    for (const s of this._strategies.values()) {
      s.onBackendAdded?.(entry);
    }
    return entry;
  }

  /** Remove a backend by id. Returns true if it was present. */
  removeBackend(id: string): boolean {
    const entry = this._entries.get(id);
    if (!entry) {
      return false;
    }
    this._entries.delete(id);
    for (const s of this._strategies.values()) {
      s.onBackendRemoved?.(entry);
    }
    return true;
  }

  /** Look up a pool entry by backend id. */
  get(id: string): BackendPoolEntry | undefined {
    return this._entries.get(id);
  }

  /** All entries, in insertion order. */
  entries(): BackendPoolEntry[] {
    return Array.from(this._entries.values());
  }

  /** Entries currently eligible for routing. */
  routable(): BackendPoolEntry[] {
    return eligibleBackends(this.entries());
  }

  /** Number of registered backends. */
  get size(): number {
    return this._entries.size;
  }

  /**
   * Route a request using a registered strategy.
   *
   * On success the returned selection's `activeConnections` is already
   * incremented — the caller MUST call {@link complete} when done.
   */
  route(strategyName: string, request: BalanceRequest = {}): BackendSelection | undefined {
    const strategy = this._strategies.get(strategyName);
    if (!strategy) {
      throw new Error(`Unknown strategy: ${strategyName}`);
    }

    const candidates = this.routable();
    if (candidates.length === 0) {
      this._stats.emptyPoolRejections += 1;
      return undefined;
    }

    const selection = strategy.select(candidates, request);
    this._stats.selections += 1;
    if (selection) {
      const entry = this._entries.get(selection.backend.id);
      if (entry && isEligible(entry)) {
        entry.activeConnections += 1;
      }
    }
    return selection;
  }

  /**
   * Report completion of a request previously handed to `backendId`.
   * Updates EWMA latency, consecutive-failure counters, and health status.
   */
  complete(backendId: string, latencyMs: number, ok: boolean): void {
    const entry = this._entries.get(backendId);
    if (!entry) {
      return;
    }
    this._stats.completions += 1;
    recordRequestCompletion(entry, latencyMs, ok);
    this._applyHealthRules(entry);
  }

  /**
   * Passive probe: if an unhealthy backend's cooldown has expired, half-open
   * it by transitioning to `degraded` so a single trial request can pass.
   * Returns the new status.
   */
  probe(id: string, now: number = Date.now()): BackendStatus | undefined {
    const entry = this._entries.get(id);
    if (!entry) {
      return undefined;
    }
    if (entry.status === 'unhealthy' && entry.backend.enabled) {
      if (now - entry.lastFailureAt >= this._unhealthyCooldownMs) {
        entry.status = 'degraded';
      }
    }
    return entry.status;
  }

  /** Force a backend's status (administrative action, e.g. drain for deploy). */
  setStatus(id: string, status: BackendStatus): boolean {
    const entry = this._entries.get(id);
    if (!entry) {
      return false;
    }
    entry.status = status;
    if (status === 'unhealthy') {
      entry.consecutiveFailures = Math.max(entry.consecutiveFailures, this._failureThreshold);
    } else if (status === 'healthy') {
      entry.consecutiveFailures = 0;
    }
    return true;
  }

  /** Administrative drain: stop new connections to a backend. */
  drain(id: string): boolean {
    return this.setStatus(id, 'draining');
  }

  /** Pool-level counters. */
  stats(): Readonly<PoolStats> {
    return { ...this._stats };
  }

  /**
   * Aggregate snapshot useful for dashboards: per-backend status, connections,
   * and EWMA latency.
   */
  snapshot(): Array<{
    id: string;
    status: BackendStatus;
    activeConnections: number;
    ewmaResponseTimeMs: number;
    totalRequests: number;
    totalFailures: number;
  }> {
    return this.entries().map((e) => ({
      id: e.backend.id,
      status: e.status,
      activeConnections: e.activeConnections,
      ewmaResponseTimeMs: e.ewmaResponseTimeMs,
      totalRequests: e.totalRequests,
      totalFailures: e.totalFailures,
    }));
  }

  /**
   * Apply the health state machine after a request completes.
   */
  private _applyHealthRules(entry: BackendPoolEntry): void {
    if (entry.status === 'draining' || !entry.backend.enabled) {
      return;
    }

    if (entry.consecutiveFailures >= this._failureThreshold) {
      entry.status = 'unhealthy';
      return;
    }

    const observed = entry.recentLatencies.length;
    if (observed >= 8 && entry.totalRequests > 0) {
      const recentFailures = Math.min(entry.totalFailures, observed);
      const errorRate = entry.totalRequests > 0 ? entry.totalFailures / entry.totalRequests : 0;
      // Degrade when lifetime error rate is high AND we've collected enough data
      // to be confident it is not a cold-start blip.
      if (errorRate > this._degradedErrorRate && recentFailures >= 4) {
        entry.status = 'degraded';
        return;
      }
    }

    if (entry.status !== 'unhealthy') {
      entry.status = 'healthy';
    }
  }
}
