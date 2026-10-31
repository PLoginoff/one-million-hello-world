/**
 * API Gateway Engine3 — Shared Types
 *
 * Fourth-generation gateway primitives:
 *
 * - `WsProxyEngine`        — WebSocket upgrade handling plus a codec
 *                            for RFC 6455 frames and a bidirectional
 *                            relay between client and upstream sockets.
 * - `GrpcMethodRouter`     — gRPC-style `/pkg.Service/Method` routing
 *                            with deadline propagation and status codes.
 * - `IdempotencyStore`     — gateway-side request deduplication with
 *                            stored responses, fingerprinting and TTL.
 * - `HealthAwareBalancer`  — upstream selection weighted by live
 *                            health signals (EWMA latency, failures,
 *                            circuit states).
 *
 * All sockets are duck-typed minimal interfaces so the engine is
 * testable without a network. Clocks are injectable.
 *
 * @module ApiGatewayLayer/Engine3
 */

/* ------------------------------------------------------------------ */
/* Clock                                                               */
/* ------------------------------------------------------------------ */

/** Millisecond clock shared by all engine3 classes. */
export interface GatewayClock3 {
  now(): number;
}

export class SystemGatewayClock3 implements GatewayClock3 {
  now(): number {
    return Date.now();
  }
}

/** Deterministic clock for tests. */
export class ManualGatewayClock3 implements GatewayClock3 {
  private _t: number;
  constructor(start: number = 0) {
    this._t = start;
  }
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
/* WebSocket proxying                                                  */
/* ------------------------------------------------------------------ */

/** RFC 6455 opcodes. */
export const WS_OP_CONTINUATION = 0x0;
export const WS_OP_TEXT = 0x1;
export const WS_OP_BINARY = 0x2;
export const WS_OP_CLOSE = 0x8;
export const WS_OP_PING = 0x9;
export const WS_OP_PONG = 0xa;

/** A decoded WebSocket frame. */
export interface WsFrame {
  /** FIN bit — false means a continuation frame follows. */
  readonly fin: boolean;
  readonly opcode: number;
  /** Unmasked payload bytes. */
  readonly payload: Uint8Array;
}

/** Result of attempting to decode frames from a buffer. */
export interface WsDecodeResult {
  /** Complete frames consumed from the front of the buffer. */
  readonly frames: readonly WsFrame[];
  /** Bytes consumed; caller keeps `buffer.slice(consumed)`. */
  readonly consumed: number;
  /** True when the next frame is incomplete — wait for more bytes. */
  readonly incomplete: boolean;
}

/** Inbound HTTP upgrade request as seen by the gateway. */
export interface WsUpgradeRequest {
  readonly method: string;
  readonly path: string;
  /** Lower-cased header map. */
  readonly headers: Readonly<Record<string, string>>;
}

/** Verdict on an upgrade attempt. */
export type WsUpgradeVerdict =
  | { readonly ok: true; readonly acceptKey: string; readonly upstreamPath: string }
  | { readonly ok: false; readonly status: number; readonly reason: string };

/**
 * One direction of an established proxied connection. A real adapter
 * wraps a `net.Socket`; tests use `InMemoryWsEndpoint`.
 */
export interface WsEndpoint {
  /** Send raw bytes (already-encoded frames). */
  send(data: Uint8Array): void;
  /** Terminate the underlying connection. */
  close(): void;
}

/** Callbacks the relay invokes for each direction of traffic. */
export interface WsRelayHooks {
  /** Inspect/transform a decoded frame before forwarding. */
  onFrame?(frame: WsFrame, direction: 'client→upstream' | 'upstream→client'): WsFrame | null;
  /** Called once when either side closes the relay. */
  onClose?(reason: string): void;
}

export interface WsRelayStats {
  readonly framesClientToUpstream: number;
  readonly framesUpstreamToClient: number;
  readonly bytesClientToUpstream: number;
  readonly bytesUpstreamToClient: number;
  readonly pings: number;
  readonly pongs: number;
  readonly closed: boolean;
  readonly closeReason?: string;
}

/* ------------------------------------------------------------------ */
/* gRPC-style routing                                                  */
/* ------------------------------------------------------------------ */

/** Canonical gRPC status codes (subset used at the gateway). */
export type GrpcStatusCode =
  | 'OK'
  | 'CANCELLED'
  | 'UNKNOWN'
  | 'INVALID_ARGUMENT'
  | 'DEADLINE_EXCEEDED'
  | 'NOT_FOUND'
  | 'ALREADY_EXISTS'
  | 'PERMISSION_DENIED'
  | 'RESOURCE_EXHAUSTED'
  | 'UNIMPLEMENTED'
  | 'UNAVAILABLE'
  | 'INTERNAL';

/** An inbound RPC invocation. */
export interface GrpcCall {
  /** Path of the form `/package.Service/Method`. */
  readonly path: string;
  /** Request message (decoded). */
  readonly message: unknown;
  /**
   * Absolute deadline in epoch ms, propagated from the caller's
   * `grpc-timeout` header. Handlers must honor it.
   */
  readonly deadlineMs?: number;
  /** Caller metadata forwarded to the handler. */
  readonly metadata?: Readonly<Record<string, string>>;
}

export interface GrpcResponse<T = unknown> {
  readonly status: GrpcStatusCode;
  readonly message?: T;
  readonly error?: string;
  /** Time left on the propagated deadline when the handler returned. */
  readonly deadlineRemainingMs?: number;
}

/** Method handler. Receives the call and the ms left on its deadline. */
export type GrpcHandler = (
  call: GrpcCall,
  ctx: { deadlineRemainingMs?: number }
) => Promise<GrpcResponse> | GrpcResponse;

export interface GrpcMethodRegistration {
  /** Fully-qualified path: `/pkg.Service/Method`. */
  readonly path: string;
  readonly handler: GrpcHandler;
  /** Default timeout applied when the caller sets no deadline. */
  readonly defaultTimeoutMs?: number;
}

/* ------------------------------------------------------------------ */
/* Idempotent request deduplication                                    */
/* ------------------------------------------------------------------ */

/** A stored response replayed for a duplicate key. */
export interface StoredResponse {
  readonly status: number;
  readonly headers: Readonly<Record<string, string>>;
  readonly body: string;
  /** When the response was first stored (epoch ms). */
  readonly storedAt: number;
  /** When the entry expires (epoch ms). */
  readonly expiresAt: number;
}

export type DedupOutcome =
  /** First time this key was seen — proceed and call `store()`. */
  | { readonly kind: 'miss'; readonly fingerprint: string }
  /**
   * Same key, same fingerprint: a duplicate. Replay the stored
   * response instead of hitting the upstream.
   */
  | { readonly kind: 'hit'; readonly response: StoredResponse }
  /**
   * Same key but the in-flight request hasn't completed yet — the
   * caller should await `promise` for the stored response.
   */
  | { readonly kind: 'in-flight'; readonly fingerprint: string }
  /**
   * Same key but a different body — a genuine idempotency conflict.
   */
  | { readonly kind: 'conflict'; readonly fingerprint: string };

export interface IdempotencyStats {
  readonly entries: number;
  readonly inFlight: number;
  readonly hits: number;
  readonly misses: number;
  readonly conflicts: number;
  readonly expired: number;
}

/* ------------------------------------------------------------------ */
/* Health-aware balancing                                              */
/* ------------------------------------------------------------------ */

/** Live health snapshot for one upstream. */
export interface UpstreamHealth {
  readonly id: string;
  /** Static capacity weight (default 1). */
  readonly weight: number;
  /** EWMA latency in ms; lower is better. */
  readonly ewmaLatencyMs: number;
  /** EWMA error rate in [0,1]. */
  readonly ewmaErrorRate: number;
  /** Consecutive request failures. */
  readonly consecutiveFailures: number;
  /** Circuit state derived from failure streaks. */
  readonly circuit: 'closed' | 'open' | 'half-open';
  /** When an open circuit may be probed again (epoch ms). */
  readonly circuitOpenUntil: number;
  readonly inflight: number;
}

export interface BalancerOptions {
  readonly clock?: GatewayClock3;
  /** EWMA smoothing factor in (0,1]; default 0.2. */
  readonly alpha?: number;
  /** Consecutive failures that trip the circuit; default 5. */
  readonly failureThreshold?: number;
  /** How long an open circuit waits before a probe; default 30s. */
  readonly circuitResetMs?: number;
}
