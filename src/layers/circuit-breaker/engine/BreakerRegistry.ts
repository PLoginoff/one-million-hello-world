/**
 * BreakerRegistry — lazily provisions one `EndpointBreaker` per key.
 *
 * An API gateway wants "one breaker per route", a service mesh wants
 * "one breaker per (route, upstream)". Neither wants to pre-declare
 * every endpoint. The registry takes a config template plus optional
 * per-endpoint overrides and instantiates breakers on first use:
 *
 *   registry.execute('GET /users', () => http.get('/users'))
 *
 * Features:
 *   - `override(endpoint, cfg)` supplies per-endpoint deltas; overrides
 *     registered before first use are merged into the template.
 *   - `snapshot()` / `restore()` persist breaker state so a restarting
 *     process doesn't lose "this endpoint was flaky" knowledge.
 *   - `executeWithFallback` composes a `FallbackChain` behind the
 *     breaker — rejection or execution failure falls through the chain.
 *   - `metrics()` produces a fleet-wide rollup for dashboards.
 *
 * Complexity: lookup/execute O(1); snapshot O(#breakers).
 *
 * @module CircuitBreakerLayer/Engine
 */

import { EndpointBreaker } from './EndpointBreaker';
import {
  BreakerEngineClock,
  BreakerRegistrySnapshot,
  BreakerState,
  CircuitRejectionError,
  EndpointBreakerConfig,
  SystemEngineClock,
} from './types';
import { FallbackChain, FallbackFunction } from './FallbackChain';

export interface RegistryOptions {
  /** Template applied to every endpoint unless overridden. */
  config?: EndpointBreakerConfig;
  clock?: BreakerEngineClock;
}

export interface FleetMetrics {
  endpoints: number;
  open: number;
  halfOpen: number;
  closed: number;
  totalCalls: number;
  totalFailures: number;
  totalRejections: number;
  /** Worst endpoints by failure count, descending. */
  worstEndpoints: Array<{ endpoint: string; failures: number; state: BreakerState }>;
}

export class BreakerRegistry {
  private readonly _template: EndpointBreakerConfig;
  private readonly _clock: BreakerEngineClock;
  private readonly _breakers = new Map<string, EndpointBreaker>();
  private readonly _overrides = new Map<string, EndpointBreakerConfig>();

  constructor(options: RegistryOptions = {}) {
    this._template = options.config ?? {};
    this._clock = options.clock ?? this._template.clock ?? new SystemEngineClock();
  }

  /** Get (creating if needed) the breaker for `endpoint`. */
  breaker(endpoint: string): EndpointBreaker {
    let b = this._breakers.get(endpoint);
    if (!b) {
      const cfg = { ...this._template, ...this._overrides.get(endpoint), clock: this._clock };
      b = new EndpointBreaker(endpoint, cfg);
      this._breakers.set(endpoint, b);
    }
    return b;
  }

  /** True when a breaker already exists (no creation). */
  has(endpoint: string): boolean {
    return this._breakers.has(endpoint);
  }

  /**
   * Per-endpoint config delta. Must be set before the first use of the
   * endpoint (or call `remove` to force recreation).
   */
  override(endpoint: string, cfg: EndpointBreakerConfig): void {
    this._overrides.set(endpoint, cfg);
    const existing = this._breakers.get(endpoint);
    if (existing) {
      // Apply tunable fields live; structural fields need recreation.
      existing.tune({
        failureThreshold: cfg.failureThreshold,
        resetTimeoutMs: cfg.resetTimeoutMs,
        successThreshold: cfg.successThreshold,
      });
    }
  }

  /** Drop a breaker so the next access recreates it from template+override. */
  remove(endpoint: string): boolean {
    return this._breakers.delete(endpoint);
  }

  /** Run `op` under `endpoint`'s breaker. */
  async execute<T>(endpoint: string, op: () => Promise<T> | T): Promise<T> {
    return this.breaker(endpoint).execute(op);
  }

  /**
   * Run `op` under the breaker; on circuit rejection or operation
   * failure, fall through `fallbacks` in order until one succeeds.
   * The fallbacks themselves are NOT breaker-guarded.
   */
  async executeWithFallback<T>(
    endpoint: string,
    op: () => Promise<T> | T,
    fallbacks: ReadonlyArray<FallbackFunction<T>>,
    chain?: FallbackChain,
  ): Promise<T> {
    const c = chain ?? new FallbackChain();
    return c.run(async () => this.breaker(endpoint).execute(op), fallbacks);
  }

  /** Force every breaker for endpoints matching `predicate` OPEN — a fleet kill switch. */
  openAll(predicate: (endpoint: string) => boolean = () => true): number {
    let n = 0;
    for (const [ep, b] of this._breakers) {
      if (predicate(ep)) {
        b.force(BreakerState.OPEN);
        n++;
      }
    }
    return n;
  }

  /** Force-reset breakers to CLOSED. */
  closeAll(predicate: (endpoint: string) => boolean = () => true): number {
    let n = 0;
    for (const [ep, b] of this._breakers) {
      if (predicate(ep)) {
        b.force(BreakerState.CLOSED);
        n++;
      }
    }
    return n;
  }

  endpoints(): string[] {
    return Array.from(this._breakers.keys());
  }

  get size(): number {
    return this._breakers.size;
  }

  /* ---------------------------------------------------------------- */
  /* Metrics & snapshots                                               */
  /* ---------------------------------------------------------------- */

  metrics(): FleetMetrics {
    let open = 0;
    let halfOpen = 0;
    let closed = 0;
    let calls = 0;
    let failures = 0;
    let rejections = 0;
    const worst: Array<{ endpoint: string; failures: number; state: BreakerState }> = [];
    for (const b of this._breakers.values()) {
      const s = b.stats();
      if (s.state === BreakerState.OPEN) open++;
      else if (s.state === BreakerState.HALF_OPEN) halfOpen++;
      else closed++;
      calls += s.totalCalls;
      failures += s.totalFailures;
      rejections += s.totalRejections;
      worst.push({ endpoint: b.endpoint, failures: s.totalFailures, state: s.state });
    }
    worst.sort((a, b) => b.failures - a.failures);
    return {
      endpoints: this._breakers.size,
      open,
      halfOpen,
      closed,
      totalCalls: calls,
      totalFailures: failures,
      totalRejections: rejections,
      worstEndpoints: worst.slice(0, 10),
    };
  }

  /** Serialize all breaker state for persistence. */
  snapshot(): BreakerRegistrySnapshot {
    return {
      version: 1,
      takenAt: this._clock.now(),
      breakers: Array.from(this._breakers.values()).map((b) => b.snapshot()),
    };
  }

  /**
   * Restore breakers from a snapshot. Only *existing or listed*
   * endpoints are restored; unknown endpoints in the snapshot are
   * materialized so a cold process starts warm.
   */
  restore(snap: BreakerRegistrySnapshot): number {
    let restored = 0;
    for (const s of snap.breakers) {
      const b = this.breaker(s.endpoint);
      b.restore(s);
      restored++;
    }
    return restored;
  }
}

export { CircuitRejectionError };
