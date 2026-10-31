/**
 * Service Operation Registry — per-operation wiring for the resilience
 * primitives.
 *
 * One catalog where each operation declares which engine features it
 * wants:
 *
 *   registry.register('getUser', {
 *     loader: fetchUser,
 *     keyTemplate: 'user:{id}',
 *     cacheTtlMs: 30_000,
 *     coalesce: true,
 *     saga: [reserveStep, chargeStep],
 *   });
 *
 * `invoke('getUser', id)` then composes the right subset of
 * {@link ServiceCache}, {@link RequestCoalescer}, and {@link ServiceSaga}
 * per operation — a service-layer analogue to per-route middleware
 * stacks in the router.
 *
 * The composition order is fixed:
 *   saga (if defined) → coalesce → cache → loader
 *
 * Sagas wrap *everything* (a saga is the operation; cache/coalesce sit
 * inside its single action). Coalescing wraps the cache lookup so a
 * concurrent cold-miss executes the loader once — the dedup window
 * includes the cache check.
 *
 * @module ServiceLayer/Engine
 */

import { RequestCoalescer } from './RequestCoalescer';
import { ServiceCache } from './ServiceCache';
import { ServiceSaga, SagaReport, SagaStep } from './ServiceSaga';
import { Clock, SystemClock } from './TransactionScriptRunner';
import { CircuitRegistry } from './CircuitPropagation';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** One operation's registration. */
export interface OperationDefinition<A extends readonly unknown[], R, C = unknown> {
  /** The terminal work — called on a cold miss. */
  readonly loader: (...args: A) => Promise<R>;
  /** Key template for caching/coalescing (`'user:{id}'`). */
  readonly keyTemplate?: string;
  /** Positional arg names feeding the template (`['id']` → `{id}`). */
  readonly argNames?: readonly string[];
  /** Cache TTL; absent ⇒ no caching. */
  readonly cacheTtlMs?: number;
  /** SWR window (ms). Requires `cacheTtlMs`. */
  readonly staleMs?: number;
  /** Dedup identical concurrent calls. */
  readonly coalesce?: boolean;
  /** Optional saga wrapping the operation (compensation-aware). */
  readonly saga?: readonly SagaStep<C>[];
  /** Circuit upstreams this operation depends on (propagation). */
  readonly dependsOn?: readonly string[];
}

/** Invocation outcome with the feature chain that served it. */
export interface OperationResult<R> {
  readonly value: R;
  /** Which features ran: `saga` / `coalesce` / `cache` / `loader`. */
  readonly servedBy: readonly string[];
  /** Saga report when a saga wrapped the call. */
  readonly sagaReport?: SagaReport;
  /** Cache outcome when caching was on. */
  readonly cache?: 'hit' | 'stale' | 'miss';
  /** Effective circuit state of the operation's upstreams. */
  readonly upstreamState?: string;
}

/** Options for {@link ServiceOperationRegistry}. */
export interface OperationRegistryOptions {
  readonly clock?: Clock;
  readonly cacheMaxEntries?: number;
  readonly circuits?: CircuitRegistry;
}

// ---------------------------------------------------------------------------
// Engine
// ---------------------------------------------------------------------------

/** Internal per-operation state — built lazily on first invoke. */
interface OperationRuntime {
  cache?: ServiceCache;
  coalescer?: RequestCoalescer<readonly unknown[], unknown>;
}

/**
 * Operation catalog.
 *
 * Registration is declarative; invocation composes the requested
 * primitives. Per-operation runtimes (cache/coalescer) are created
 * lazily so a registry with hundreds of ops costs only Map entries
 * until actually used.
 */
export class ServiceOperationRegistry {
  private readonly _defs: Map<string, OperationDefinition<readonly unknown[], unknown>>;
  private readonly _runtimes: Map<string, OperationRuntime>;
  private readonly _clock: Clock;
  private readonly _cacheMaxEntries: number;
  private readonly _circuits: CircuitRegistry | null;

  constructor(options?: OperationRegistryOptions) {
    this._defs = new Map();
    this._runtimes = new Map();
    this._clock = options?.clock ?? new SystemClock();
    this._cacheMaxEntries = options?.cacheMaxEntries ?? 1024;
    this._circuits = options?.circuits ?? null;
  }

  /** Registered operation names. */
  get operations(): readonly string[] {
    return [...this._defs.keys()];
  }

  /** Register an operation. Re-registration overwrites runtime state. */
  register<A extends readonly unknown[], R, C = unknown>(
    name: string,
    def: OperationDefinition<A, R, C>
  ): this {
    this._defs.set(name, def as OperationDefinition<readonly unknown[], unknown>);
    this._runtimes.delete(name);
    if (this._circuits !== null && def.dependsOn !== undefined) {
      for (const up of def.dependsOn) {
        this._circuits.dependOn(name, up);
      }
    }
    return this;
  }

  /** Unregister — drops runtime state too. */
  unregister(name: string): boolean {
    this._runtimes.delete(name);
    return this._defs.delete(name);
  }

  /**
   * Invoke an operation, composing its declared primitives.
   * Throws for unregistered names — a miss is a config bug, not a 404.
   */
  async invoke<A extends readonly unknown[], R>(name: string, ...args: A): Promise<OperationResult<R>> {
    const def = this._defs.get(name);
    if (def === undefined) {
      throw new Error(`ServiceOperationRegistry: unregistered operation '${name}'`);
    }
    const runtime = this.runtimeFor(name, def);

    const upstreamState = this._circuits?.effectiveState(name).effective;

    const terminal = async (): Promise<{ value: R; cache?: 'hit' | 'stale' | 'miss' }> => {
      // Coalesce → cache → loader.
      const exec = async (): Promise<{ value: R; cache?: 'hit' | 'stale' | 'miss' }> => {
        if (runtime.cache !== undefined && def.keyTemplate !== undefined) {
          const res = await runtime.cache.call<A, R>({
            service: 'service',
            operation: name,
            keyTemplate: def.keyTemplate,
            argNames: def.argNames,
            loader: def.loader as (...a: A) => Promise<unknown>,
            args,
          });
          return { value: res.value, cache: res.cache };
        }
        return { value: await (def.loader as (...a: A) => Promise<R>)(...args) };
      };

      if (runtime.coalescer !== undefined) {
        return runtime.coalescer.execute(exec) as Promise<{ value: R; cache?: 'hit' | 'stale' | 'miss' }>;
      }
      return exec();
    };

    // Saga wraps everything else when defined. By convention the
    // LAST step's output is the operation result — callers compose
    // steps so the final one produces the returned value.
    if (def.saga !== undefined) {
      const saga = new ServiceSaga(def.saga as readonly SagaStep<unknown>[], { clock: this._clock });
      const report = await saga.run(args);
      const lastStep = def.saga[def.saga.length - 1];
      const value =
        lastStep !== undefined && report.status === 'completed'
          ? (report.outputs.get(lastStep.name) as R)
          : (undefined as unknown as R);
      return {
        value,
        servedBy: ['saga'],
        sagaReport: report,
        upstreamState,
      };
    }

    const res = await terminal();
    const servedBy: string[] = [];
    if (runtime.coalescer !== undefined) {
      servedBy.push('coalesce');
    }
    if (runtime.cache !== undefined) {
      servedBy.push('cache');
    }
    servedBy.push('loader');
    const result: OperationResult<R> = { value: res.value, servedBy };
    const out = result as { cache?: 'hit' | 'stale' | 'miss'; upstreamState?: string };
    if (res.cache !== undefined) {
      out.cache = res.cache;
    }
    if (upstreamState !== undefined) {
      out.upstreamState = upstreamState;
    }
    return result;
  }

  /** Per-operation cache stats (undefined when uncached). */
  cacheStats(name: string): ReturnType<ServiceCache['stats']> | undefined {
    return this._runtimes.get(name)?.cache?.stats();
  }

  /** Per-operation coalescer stats (undefined when not coalesced). */
  coalescerStats(name: string): ReturnType<RequestCoalescer['stats']> | undefined {
    return this._runtimes.get(name)?.coalescer?.stats();
  }

  // ------------------------------------------------------------------
  // Internals
  // ------------------------------------------------------------------

  private runtimeFor(
    name: string,
    def: OperationDefinition<readonly unknown[], unknown>
  ): OperationRuntime {
    const existing = this._runtimes.get(name);
    if (existing !== undefined) {
      return existing;
    }
    const runtime: OperationRuntime = {};
    if (def.cacheTtlMs !== undefined) {
      runtime.cache = new ServiceCache({
        ttlMs: def.cacheTtlMs,
        staleMs: def.staleMs,
        maxEntries: this._cacheMaxEntries,
        clock: this._clock,
      });
    }
    if (def.coalesce === true) {
      const argNames = def.argNames ?? [];
      runtime.coalescer = new RequestCoalescer<readonly unknown[], unknown>({
        keyFn: (...args: readonly unknown[]) => {
          const argMap: Record<string, unknown> = {};
          for (let i = 0; i < args.length; i++) {
            argMap[argNames[i] ?? `arg${i}`] = args[i];
          }
          // When a keyTemplate is configured reuse its rendering;
          // otherwise default to a JSON tuple.
          if (def.keyTemplate !== undefined) {
            let key = def.keyTemplate;
            for (const [k, v] of Object.entries(argMap)) {
              key = key.split(`{${k}}`).join(String(v));
            }
            return key;
          }
          return JSON.stringify(args);
        },
        clock: this._clock,
      });
    }
    this._runtimes.set(name, runtime);
    return runtime;
  }
}
