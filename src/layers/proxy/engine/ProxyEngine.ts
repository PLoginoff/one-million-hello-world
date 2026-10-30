/**
 * ProxyEngine
 *
 * Orchestrating facade that composes the engine primitives into one
 * invocation pipeline:
 *
 *   caller ──► ProtectionProxy (policy check)
 *         ──► InterceptorChain (before hooks, short-circuit)
 *         ──► CachingProxy (fresh / stale / miss)
 *         ──► invocation sink: direct target | VirtualProxy | RemoteProxyStub
 *         ──► InterceptorChain (after hooks, reverse order)
 *         ──► ProxyStatistics (record outcome)
 *
 * Every stage is optional and independently configurable — the engine can
 * be as thin as "interceptors around a direct call" or a full
 * protect→intercept→cache→remote pipeline.
 *
 * Introspection: `stats()` returns the shared ProxyStatistics snapshot;
 * every call — allowed, denied, cached, failed, short-circuited — is
 * recorded exactly once.
 *
 * @module ProxyLayer/Engine
 */

import { CachingProxy } from './CachingProxy';
import { InterceptorChain } from './InterceptorChain';
import { ProtectionProxy } from './ProtectionProxy';
import { ProxyStatistics } from './ProxyStatistics';
import { RemoteProxyStub } from './RemoteProxyStub';
import {
  AccessPolicy,
  Clock,
  Invocation,
  InvocationContext,
  ProxyAccessDeniedError,
  ProxyEngineStats,
  systemClock,
} from './types';

/**
 * How the engine reaches the real subject.
 */
export type InvocationSink =
  | { readonly kind: 'direct'; readonly target: Record<string, unknown> }
  | { readonly kind: 'virtual'; readonly factory: () => object | Promise<object> }
  | { readonly kind: 'remote'; readonly stub: RemoteProxyStub };

/**
 * Engine configuration — all features optional, additive.
 */
export interface ProxyEngineOptions {
  readonly sink: InvocationSink;
  /** Default access policy evaluated before interception. */
  readonly accessPolicy?: AccessPolicy;
  /** Per-method policies (override the default). */
  readonly methodPolicies?: Readonly<Record<string, AccessPolicy>>;
  /** Initial interceptors, in execution order. */
  readonly interceptors?: InterceptorChain;
  /** Methods eligible for result caching; requires cache options. */
  readonly cachedMethods?: ReadonlyArray<string>;
  /** Cache TTL in ms. */
  readonly cacheTtlMs?: number;
  /** Stale-while-revalidate window in ms. */
  readonly cacheSwrMs?: number;
  /** Injectable clock. Shared by cache and statistics. */
  readonly clock?: Clock;
  /** Statistics EWMA alpha. */
  readonly statsAlpha?: number;
}

/**
 * Per-call result returned by `ProxyEngine.invoke`.
 */
export interface EngineInvocationResult<R = unknown> {
  readonly value: R;
  readonly durationMs: number;
  /** 'target' | 'cache' | 'shortCircuit' */
  readonly servedBy: 'target' | 'cache' | 'shortCircuit';
}

export class ProxyEngine {
  private readonly _clock: Clock;
  private readonly _chain: InterceptorChain;
  private readonly _statistics: ProxyStatistics;
  private readonly _protection: ProtectionProxy<Record<string, unknown>> | null;
  private readonly _caching: CachingProxy<Record<string, unknown>> | null;
  private readonly _sink: InvocationSink;
  private _virtualTarget: object | null;

  constructor(options: ProxyEngineOptions) {
    this._clock = options.clock ?? systemClock;
    this._chain = options.interceptors ?? new InterceptorChain();
    this._statistics = new ProxyStatistics(options.statsAlpha);
    this._sink = options.sink;
    this._virtualTarget = null;

    // Protection evaluates policies against the logical method name via
    // guard(); the bound target is unused (guarding is dispatch-agnostic).
    if (options.accessPolicy || options.methodPolicies) {
      const protection = new ProtectionProxy<Record<string, unknown>>({}, options.accessPolicy);
      if (options.methodPolicies) {
        for (const [method, policy] of Object.entries(options.methodPolicies)) {
          protection.protect(method, policy);
        }
      }
      this._protection = protection;
    } else {
      this._protection = null;
    }

    if (options.cachedMethods && options.cachedMethods.length > 0) {
      // The cache stores against this synthetic "target" whose single method
      // performs real dispatch — decouples caching from sink mechanics.
      const self = this;
      const cacheTarget: Record<string, unknown> = new Proxy({} as Record<string, unknown>, {
        get(_t, prop): unknown {
          return typeof prop === 'string'
            ? (...args: unknown[]) => self._dispatch(prop, args)
            : undefined;
        },
      });
      this._caching = new CachingProxy<Record<string, unknown>>(cacheTarget, {
        ttl: options.cacheTtlMs,
        staleWhileRevalidateMs: options.cacheSwrMs,
        clock: this._clock,
      });
      for (const method of options.cachedMethods) {
        this._caching.cacheMethod(method);
      }
    } else {
      this._caching = null;
    }
  }

  /** The engine's interceptor chain (immutable — mutate via withInterceptor). */
  get chain(): InterceptorChain {
    return this._chain;
  }

  /** Statistics snapshot — see ProxyStatistics.snapshot. */
  stats(): ProxyEngineStats {
    return this._statistics.snapshot();
  }

  /** Live statistics registry (e.g. to call reset()). */
  get statistics(): ProxyStatistics {
    return this._statistics;
  }

  /**
   * Executes one proxied invocation through the full pipeline.
   *
   * @throws ProxyAccessDeniedError, RemoteInvocationError, target errors —
   *   all recorded in statistics before propagating.
   */
  async invoke<R = unknown>(
    method: string,
    args: readonly unknown[] = [],
    context: InvocationContext = { attributes: {} }
  ): Promise<EngineInvocationResult<R>> {
    const startedAt = this._clock();

    // 1. Protection stage — runs outside the interceptor chain so denied
    //    calls never reach before-hooks.
    if (this._protection) {
      try {
        this._protection.guard(method, args, context);
      } catch (error) {
        this._recordFailure(method, startedAt, error);
        throw error;
      }
    }

    // 2. Interceptor chain wrapping dispatch (with optional caching inside).
    const invocation: Invocation = { method, args, startedAt, context };
    let servedBy: 'target' | 'cache' | 'shortCircuit' = 'target';
    let cacheStatus: string = 'miss';

    try {
      const result = await this._chain.run(invocation, async () => {
        if (this._caching && this._caching.isCacheable(method)) {
          const cached = await this._caching.invoke(method, args);
          cacheStatus = cached.cacheStatus;
          return cached.value;
        }
        return this._dispatch(method, args);
      });

      if (result.shortCircuited) {
        servedBy = 'shortCircuit';
      } else if (cacheStatus === 'fresh' || cacheStatus === 'stale') {
        servedBy = 'cache';
      }

      const durationMs = this._clock() - startedAt;
      this._statistics.record({
        method,
        durationMs,
        at: startedAt,
        outcome:
          servedBy === 'cache' ? 'cacheHit' : servedBy === 'shortCircuit' ? 'shortCircuit' : 'success',
      });
      return { value: result.value as R, durationMs, servedBy };
    } catch (error) {
      this._recordFailure(method, startedAt, error);
      throw error;
    }
  }

  private _recordFailure(method: string, startedAt: number, error: unknown): void {
    this._statistics.record({
      method,
      durationMs: this._clock() - startedAt,
      at: startedAt,
      outcome: 'failure',
      error: error instanceof Error ? error.message : String(error),
    });
  }

  /**
   * Resolves the invocation sink and performs the real call.
   */
  private async _dispatch(method: string, args: readonly unknown[]): Promise<unknown> {
    switch (this._sink.kind) {
      case 'direct': {
        const fn = this._sink.target[method];
        if (typeof fn !== 'function') {
          throw new TypeError(`ProxyEngine: '${method}' is not callable on target`);
        }
        return (fn as (...a: unknown[]) => unknown).apply(this._sink.target, [...args]);
      }
      case 'virtual': {
        if (this._virtualTarget === null) {
          this._virtualTarget = await this._sink.factory();
        }
        const fn = (this._virtualTarget as Record<string, unknown>)[method];
        if (typeof fn !== 'function') {
          throw new TypeError(`ProxyEngine: '${method}' is not callable on virtual target`);
        }
        return (fn as (...a: unknown[]) => unknown).apply(this._virtualTarget, [...args]);
      }
      case 'remote':
        return this._sink.stub.invoke(method, args);
    }
  }
}
