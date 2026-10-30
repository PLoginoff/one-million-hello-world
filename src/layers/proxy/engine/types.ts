/**
 * Proxy Engine Types
 *
 * Shared contracts for the proxy engine subsystem: invocation frames,
 * interceptor chains, access-control contexts, introspection statistics,
 * and the simulated network transport used by the remote proxy stub.
 *
 * The engine treats a "target" as any object exposing callable methods.
 * Proxies do not wrap targets via the ES `Proxy` trap API; instead they
 * expose an explicit `invoke()` surface so that interception, statistics,
 * and access control can be implemented deterministically in pure
 * TypeScript with no runtime magic.
 *
 * @module ProxyLayer/Engine
 */

/**
 * Injectable clock. Returns milliseconds since the Unix epoch.
 * Inject a fake in tests to control TTL / stale-while-revalidate windows.
 */
export type Clock = () => number;

/**
 * Returns a high-resolution duration sample in milliseconds.
 * Defaults to `Date.now` deltas; tests may inject a monotonic fake.
 */
export type ClockFn = Clock;

/**
 * The default wall clock.
 */
export const systemClock: Clock = () => Date.now();

/**
 * A callable method on a proxied target.
 */
export type TargetMethod = (...args: unknown[]) => unknown;

/**
 * Any object whose own enumerable function properties can be proxied.
 */
export type ProxiableTarget = Record<string, unknown>;

/**
 * One method invocation flowing through the proxy engine.
 */
export interface Invocation {
  /** Method name being invoked. */
  readonly method: string;
  /** Positional arguments supplied by the caller. */
  readonly args: readonly unknown[];
  /** Time the invocation entered the engine (ms). */
  readonly startedAt: number;
  /** Caller-supplied opaque context (e.g. principal, trace id). */
  readonly context: InvocationContext;
}

/**
 * Opaque per-call context. Carries the principal for protection proxies
 * and is passed untouched to interceptors and serializers.
 */
export interface InvocationContext {
  /** Authenticated principal, if any (used by ProtectionProxy). */
  readonly principal?: Principal;
  /** Correlation / trace id propagated to remote stubs. */
  readonly correlationId?: string;
  /** Free-form attributes for interceptors. */
  readonly attributes: Record<string, unknown>;
}

/**
 * An authenticated caller for the protection proxy.
 */
export interface Principal {
  readonly id: string;
  readonly roles: readonly string[];
  readonly claims: Record<string, unknown>;
}

/**
 * Result of a successful invocation.
 */
export interface InvocationResult<T = unknown> {
  readonly value: T;
  /** Wall-clock duration of the underlying call in ms. */
  readonly durationMs: number;
  /** True when the value came from a proxy-local cache rather than the target. */
  readonly fromCache: boolean;
}

/**
 * Decision returned by interceptor `before` hooks.
 *
 * - `continue` — proceed down the chain and into the target.
 * - `shortCircuit` — skip the target entirely and return `value` to the
 *   caller. Remaining `before` hooks still run their `after` counterparts
 *   on unwind (see InterceptorChain for exact semantics).
 * - `throw` semantics are expressed by throwing inside the hook.
 */
export type InterceptorDecision =
  | { readonly kind: 'continue' }
  | { readonly kind: 'shortCircuit'; readonly value: unknown };

/**
 * Controls how an interceptor participates in the chain.
 */
export interface Interceptor {
  /** Human-readable name, used in introspection and error messages. */
  readonly name: string;
  /**
   * Runs before the target invocation, in registration order.
   * May mutate `invocation.args` copies, observe, or short-circuit.
   */
  before?(invocation: Invocation): InterceptorDecision | Promise<InterceptorDecision>;
  /**
   * Runs after the target invocation, in reverse registration order.
   * Receives the produced value (or short-circuit value) and may replace it.
   * On error it is invoked with `error` set and `value` undefined; throwing
   * or returning keeps/replaces the error depending on implementation.
   */
  after?(
    invocation: Invocation,
    outcome: { value?: unknown; error?: unknown }
  ): { value?: unknown; error?: unknown } | Promise<{ value?: unknown; error?: unknown }>;
}

/**
 * Access decision made by a ProtectionProxy policy.
 */
export interface AccessDecision {
  readonly allowed: boolean;
  readonly reason?: string;
}

/**
 * A policy decides whether a principal may invoke a method.
 * Implemented as a function for composability (and/or/not combinators
 * are provided by ProtectionProxy).
 */
export type AccessPolicy = (principal: Principal | undefined, method: string, args: readonly unknown[]) => AccessDecision;

/**
 * Per-method statistics maintained by the introspection registry.
 */
export interface MethodStats {
  /** Total invocations attempted (including denied/failed). */
  calls: number;
  /** Invocations that completed without throwing. */
  successes: number;
  /** Invocations that threw or were denied by policy. */
  failures: number;
  /** Invocations served from a proxy-local cache. */
  cacheHits: number;
  /** Short-circuited before reaching the target. */
  shortCircuits: number;
  /** Epoch ms of the most recent invocation attempt, or null. */
  lastInvokedAt: number | null;
  /** Wall duration of the last successful call in ms. */
  lastDurationMs: number | null;
  /** Exponential moving average of successful durations (ms). */
  avgDurationMs: number;
  /** Last error message, if any. */
  lastError: string | null;
}

/**
 * Engine-wide statistics snapshot.
 */
export interface ProxyEngineStats {
  readonly totalCalls: number;
  readonly totalSuccesses: number;
  readonly totalFailures: number;
  readonly methods: Readonly<Record<string, MethodStats>>;
}

/**
 * Wire envelope used by the remote proxy stub. The stub serializes an
 * invocation into this shape, hands it to a `Transport`, and decodes the
 * returned envelope — a faithful simulation of RPC without real sockets.
 */
export interface WireRequest {
  /** Correlation id echoed back in the response. */
  readonly id: string;
  /** Remote method name. */
  readonly method: string;
  /** JSON-safe argument list. */
  readonly args: readonly unknown[];
  /** Serializer format tag (e.g. 'json'). */
  readonly format: string;
}

/**
 * Wire response envelope returned by a `Transport`.
 */
export interface WireResponse {
  readonly id: string;
  readonly ok: boolean;
  /** JSON-safe payload when `ok` is true. */
  readonly value?: unknown;
  /** Structured error when `ok` is false. */
  readonly error?: { name: string; message: string };
}

/**
 * Simulated network hop. `send` is async to model latency; implementations
 * may add jitter, drops, or reordering for testing resilience logic.
 */
export interface Transport {
  send(request: WireRequest): Promise<WireResponse>;
}

/**
 * Serializer contract for the remote stub. `JsonSerializer` is provided;
 * alternative codecs can implement the same pair.
 */
export interface Serializer {
  readonly format: string;
  encode(args: readonly unknown[]): readonly unknown[];
  decodeValue(value: unknown): unknown;
}

/**
 * Error thrown when the protection proxy denies access.
 */
export class ProxyAccessDeniedError extends Error {
  readonly method: string;
  readonly principalId: string | null;
  constructor(method: string, principalId: string | null, reason?: string) {
    super(`Access denied for principal '${principalId ?? 'anonymous'}' on '${method}'${reason ? `: ${reason}` : ''}`);
    this.name = 'ProxyAccessDeniedError';
    this.method = method;
    this.principalId = principalId;
  }
}

/**
 * Error thrown when the remote stub receives a failed wire response.
 */
export class RemoteInvocationError extends Error {
  readonly remoteName: string;
  constructor(remoteName: string, message: string) {
    super(`Remote invocation failed (${remoteName}): ${message}`);
    this.name = 'RemoteInvocationError';
    this.remoteName = remoteName;
  }
}
