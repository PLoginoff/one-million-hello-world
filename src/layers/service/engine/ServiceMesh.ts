/**
 * Service Mesh Hooks — sidecar-style interception for service calls.
 *
 * A `ServiceMesh` sits *beside* the service (the "sidecar" model):
 * every outbound call is routed through a chain of interceptors that
 * can observe, mutate, short-circuit, or decorate the request/response.
 *
 * Interceptor onion (same reduceRight as HTTP middleware):
 *
 *   before ──► [telemetry] ──► [auth] ──► [retry] ──► call ──► after
 *
 * Use cases: mTLS identity injection, distributed-tracing spans,
 * fault-injection for chaos tests, rate-limit headers, per-call
 * deadline propagation.
 *
 * Each interceptor sees a `MeshCall` envelope (service name, operation,
 * args, per-call state). Returning `MeshResult` directly short-circuits
 * the remaining chain — e.g. a cache-hit interceptor that never lets
 * the real service run.
 *
 * @module ServiceLayer/Engine
 */

import { Clock, SystemClock } from './TransactionScriptRunner';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** The outbound service invocation being intercepted. */
export interface MeshCall<A extends readonly unknown[] = readonly unknown[]> {
  /** Target service name (`'payments'`, ...). */
  readonly service: string;
  /** Operation within the service (`'charge'`). */
  readonly operation: string;
  /** Operation arguments — mutable so interceptors can rewrite. */
  args: A;
  /** Per-call deadline (epoch ms) propagated via state. */
  readonly deadlineMs?: number;
  /** Correlation id — auto-generated when absent. */
  readonly correlationId: string;
  /** Free-form per-call bag shared down the chain. */
  readonly state: Record<string, unknown>;
}

/** The intercepted call's result. */
export interface MeshResult<R = unknown> {
  readonly value: R;
  /** Latency of the *underlying* call only (ms). */
  readonly durationMs: number;
  /** Which interceptors ran (for diagnostics). */
  readonly chain: readonly string[];
}

/** Next-hop in the interceptor chain — opaque: interceptors don't
 * see concrete arg/result types (the sidecar model treats payloads
 * as pass-through bytes).
 */
export type MeshNext = (call: MeshCall) => Promise<unknown>;

/** One interceptor — name for diagnostics, `handle` for the onion. */
export interface MeshInterceptor {
  readonly name: string;
  handle(call: MeshCall, next: MeshNext): Promise<unknown>;
}

/** Terminal transport — what the sidecar wraps. */
export type MeshTransport<A extends readonly unknown[] = readonly unknown[], R = unknown> =
  (call: MeshCall<A>) => Promise<R>;

/** Options for {@link ServiceMesh}. */
export interface ServiceMeshOptions {
  readonly clock?: Clock;
  readonly correlationId?: () => string;
}

// ---------------------------------------------------------------------------
// Engine
// ---------------------------------------------------------------------------

/**
 * Sidecar mesh.
 *
 * Interceptors compose in registration order: `use(a); use(b)` yields
 * `a(b(transport))`. Order matters — a tracing interceptor registered
 * first sees the whole downstream latency; registered last it sees
 * only the transport hop.
 */
export class ServiceMesh {
  private readonly _interceptors: MeshInterceptor[];
  private readonly _clock: Clock;
  private readonly _correlationId: () => string;
  private _idSeq: number;

  constructor(options?: ServiceMeshOptions) {
    this._interceptors = [];
    this._clock = options?.clock ?? new SystemClock();
    this._correlationId = options?.correlationId ?? (() => `call-${++this._idSeq}`);
    this._idSeq = 0;
  }

  /** Append an interceptor to the chain. */
  use(interceptor: MeshInterceptor): this {
    this._interceptors.push(interceptor);
    return this;
  }

  /** Convenience wrapper for inline middleware functions. */
  intercept(
    name: string,
    fn: (call: MeshCall, next: MeshNext) => Promise<unknown>
  ): this {
    return this.use({ name, handle: fn });
  }

  /**
   * Invoke `transport` through the interceptor chain.
   * The transport's own latency is measured *inside* the onion.
   */
  async invoke<A extends readonly unknown[], R>(
    service: string,
    operation: string,
    args: A,
    transport: MeshTransport<A, R>,
    options?: { deadlineMs?: number; state?: Record<string, unknown> }
  ): Promise<MeshResult<R>> {
    const call: MeshCall<A> = {
      service,
      operation,
      args,
      deadlineMs: options?.deadlineMs,
      correlationId: this._correlationId(),
      state: options?.state ?? {},
    };

    const chainRan: string[] = [];
    const start = this._clock.now();

    // Build the onion — innermost adapts the opaque chain to the
    // typed transport.
    let innermost: MeshNext = async (c) => transport(c as MeshCall<A>);
    for (let i = this._interceptors.length - 1; i >= 0; i--) {
      const interceptor = this._interceptors[i];
      const next = innermost;
      innermost = async (c) => {
        chainRan.push(interceptor.name);
        return interceptor.handle(c, next);
      };
    }

    const value = (await innermost(call)) as R;
    return { value, durationMs: this._clock.now() - start, chain: chainRan };
  }
}

// ---------------------------------------------------------------------------
// Canned interceptors — the common sidecar toolbox
// ---------------------------------------------------------------------------

/** Tracing interceptor — records per-call spans. */
export function tracingInterceptor(
  sink: { record(span: { service: string; operation: string; durationMs: number; error?: unknown }): void },
  clock: Clock = new SystemClock()
): MeshInterceptor {
  return {
    name: 'tracing',
    handle: async (call, next) => {
      const start = clock.now();
      try {
        const value = await next(call);
        sink.record({ service: call.service, operation: call.operation, durationMs: clock.now() - start });
        return value;
      } catch (error) {
        sink.record({ service: call.service, operation: call.operation, durationMs: clock.now() - start, error });
        throw error;
      }
    },
  };
}

/** Header-injection interceptor — stamps correlation + tenant into state. */
export function contextPropagationInterceptor(
  extras: Record<string, unknown>
): MeshInterceptor {
  return {
    name: 'context-propagation',
    handle: async (call, next) => {
      call.state['correlationId'] = call.correlationId;
      for (const [k, v] of Object.entries(extras)) {
        call.state[k] = v;
      }
      return next(call);
    },
  };
}

/** Cache interceptor — memoizes by operation+args key, short-circuits. */
export function cacheInterceptor(
  store: Map<string, unknown>,
  keyFor: (call: MeshCall) => string
): MeshInterceptor {
  return {
    name: 'cache',
    handle: async (call, next) => {
      const key = keyFor(call);
      if (store.has(key)) {
        return store.get(key);
      }
      const value = await next(call);
      store.set(key, value);
      return value;
    },
  };
}
