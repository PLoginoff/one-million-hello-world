/**
 * gRPC-Style Method Router
 *
 * Routes `/package.Service/Method` paths to registered handlers with
 * gRPC semantics the gateway can enforce generically:
 *
 *  - **Deadline propagation** — the caller's `grpc-timeout` header
 *    (gRPC's `nH|nM|nS|nm|nu|nn` format) is parsed to an absolute
 *    deadline; the remaining budget is re-derived per call and handed
 *    to the handler. A handler that overruns its deadline yields
 *    `DEADLINE_EXCEEDED` at the gateway even if it later resolves.
 *
 *  - **Status mapping** — handlers return `GrpcResponse`s; thrown
 *    `GrpcError`s map to their status code, other throwables map to
 *    `INTERNAL`, unknown paths to `UNIMPLEMENTED`.
 *
 * Path parsing is strict: exactly two segments, both non-empty,
 * service segment in `pkg.Service` form (at least one dot, i.e. a
 * package prefix, or a bare `Service` name is accepted too).
 *
 * Dispatch is O(1) map lookup — no trie needed since gRPC paths are
 * exact, not hierarchical.
 *
 * @module ApiGatewayLayer/Engine3
 */

import {
  GatewayClock3,
  GrpcCall,
  GrpcHandler,
  GrpcMethodRegistration,
  GrpcResponse,
  GrpcStatusCode,
  SystemGatewayClock3,
} from './types3';

/** Error with an explicit gRPC status code. */
export class GrpcError extends Error {
  constructor(
    readonly status: GrpcStatusCode,
    message: string
  ) {
    super(message);
    this.name = 'GrpcError';
  }
}

/** Timeout unit → milliseconds multiplier, per gRPC spec. */
const TIMEOUT_UNITS: Record<string, number> = {
  H: 3_600_000,
  M: 60_000,
  S: 1_000,
  m: 1,
  u: 0.001,
  n: 0.000_001,
};

/**
 * Parse a `grpc-timeout` header value like `250m`, `1.5S`, `10u`.
 * Max 8 digits per spec; returns milliseconds (fractional allowed) or
 * undefined for malformed values.
 */
export function parseGrpcTimeout(header: string): number | undefined {
  const m = /^(\d{1,8})([HMSmun])$/.exec(header.trim());
  if (!m) return undefined;
  const value = Number(m[1]);
  const unit = TIMEOUT_UNITS[m[2]!];
  if (unit === undefined) return undefined;
  return value * unit;
}

/** Parsed form of a gRPC path. */
export interface ParsedGrpcPath {
  readonly service: string;
  readonly method: string;
  readonly path: string;
}

/**
 * Split `/pkg.Service/Method` into parts. Returns undefined for
 * malformed paths (missing leading slash, wrong segment count,
 * empty service/method).
 */
export function parseGrpcPath(path: string): ParsedGrpcPath | undefined {
  if (!path.startsWith('/')) return undefined;
  const parts = path.slice(1).split('/');
  if (parts.length !== 2) return undefined;
  const [service, method] = parts as [string, string];
  if (service.length === 0 || method.length === 0) return undefined;
  if (service.includes(' ') || method.includes(' ')) return undefined;
  return { service, method, path: `/${service}/${method}` };
}

interface Registered {
  readonly handler: GrpcHandler;
  readonly defaultTimeoutMs?: number;
}

export interface GrpcRouterOptions {
  readonly clock?: GatewayClock3;
  /** Fallback timeout when neither caller nor method sets one. */
  readonly defaultTimeoutMs?: number;
}

export class GrpcMethodRouter {
  private readonly methods = new Map<string, Registered>();
  private readonly clock: GatewayClock3;
  private readonly fallbackTimeoutMs: number | undefined;

  constructor(options: GrpcRouterOptions = {}) {
    this.clock = options.clock ?? new SystemGatewayClock3();
    this.fallbackTimeoutMs = options.defaultTimeoutMs;
  }

  /** Register a handler at `/pkg.Service/Method`. */
  register(reg: GrpcMethodRegistration): void {
    const parsed = parseGrpcPath(reg.path);
    if (!parsed) {
      throw new Error(`invalid gRPC path: ${reg.path}`);
    }
    if (this.methods.has(parsed.path)) {
      throw new Error(`method already registered: ${parsed.path}`);
    }
    this.methods.set(parsed.path, { handler: reg.handler, defaultTimeoutMs: reg.defaultTimeoutMs });
  }

  /** Remove a method. Returns false if it wasn't registered. */
  unregister(path: string): boolean {
    const parsed = parseGrpcPath(path);
    if (!parsed) return false;
    return this.methods.delete(parsed.path);
  }

  /** List registered paths (sorted). */
  routes(): string[] {
    return [...this.methods.keys()].sort();
  }

  /**
   * Invoke a call. `call.deadlineMs` may come straight from
   * `parseGrpcTimeout()` + `clock.now()`; when absent the registered
   * default (or router fallback) applies.
   *
   * Deadline enforcement is cooperative: the remaining budget is
   * exposed to the handler, and if the handler resolves after the
   * deadline the gateway reports `DEADLINE_EXCEEDED` — matching gRPC
   * behavior where the server wins the race, not the slow handler.
   */
  async invoke(call: GrpcCall): Promise<GrpcResponse> {
    const parsed = parseGrpcPath(call.path);
    if (!parsed) {
      return { status: 'UNIMPLEMENTED', error: `malformed path ${call.path}` };
    }
    const reg = this.methods.get(parsed.path);
    if (!reg) {
      return { status: 'UNIMPLEMENTED', error: `no handler for ${parsed.path}` };
    }

    const now = this.clock.now();
    const deadlineMs =
      call.deadlineMs ??
      (reg.defaultTimeoutMs !== undefined
        ? now + reg.defaultTimeoutMs
        : this.fallbackTimeoutMs !== undefined
          ? now + this.fallbackTimeoutMs
          : undefined);

    if (deadlineMs !== undefined && now >= deadlineMs) {
      return {
        status: 'DEADLINE_EXCEEDED',
        error: 'deadline already exceeded on arrival',
        deadlineRemainingMs: 0,
      };
    }

    const remaining = deadlineMs !== undefined ? Math.max(0, deadlineMs - now) : undefined;
    const effectiveCall: GrpcCall = { ...call, deadlineMs };

    try {
      const res = await reg.handler(effectiveCall, { deadlineRemainingMs: remaining });
      const left = deadlineMs !== undefined ? Math.max(0, deadlineMs - this.clock.now()) : undefined;
      // A resolved-but-late handler loses to the deadline.
      if (deadlineMs !== undefined && this.clock.now() > deadlineMs && res.status === 'OK') {
        return { status: 'DEADLINE_EXCEEDED', error: 'handler completed after deadline', deadlineRemainingMs: 0 };
      }
      return { ...res, deadlineRemainingMs: left };
    } catch (e) {
      if (e instanceof GrpcError) {
        return { status: e.status, error: e.message };
      }
      return { status: 'INTERNAL', error: (e as Error).message };
    }
  }
}

