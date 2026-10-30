/**
 * WebSocket Engine2 — Shared Types
 *
 * Second-generation websocket primitives: extended CONNECT (RFC 8441)
 * tunnel negotiation, permessage-deflate (RFC 7692) compression with
 * context takeover, a client-side pooled connection pool, a consistent-hash
 * cluster router for locating connection ownership, and coordinated
 * connection draining for graceful shutdown.
 *
 * @module WebsocketLayer/Engine2
 */

/** Injectable clock for idle timeouts, drain deadlines, and rate windows. */
export interface WsClock2 {
  now(): number;
}

export class SystemWsClock2 implements WsClock2 {
  now(): number {
    return Date.now();
  }
}

/** Test clock with manual time control. */
export class ManualWsClock2 implements WsClock2 {
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

/** Identifies a single websocket connection in the cluster. */
export interface WsConnection2 {
  /** Globally unique connection id (assigned at accept time). */
  readonly id: string;
  /** Logical route this connection was upgraded for (e.g. "/chat"). */
  readonly route: string;
  /** Owning user/session key when authenticated — used for
   *  user-level fan-out and cluster stickiness. */
  readonly ownerKey?: string;
  /** Monotonic accept timestamp (ms). */
  readonly acceptedAtMs: number;
  /** Negotiated extensions, e.g. ["permessage-deflate; server_no_context_takeover"]. */
  readonly extensions: readonly string[];
}

/** Lifecycle state of a websocket connection. */
export type WsConnectionState =
  /** Negotiating upgrade/CONNECT — not yet receiving traffic. */
  | 'handshaking'
  /** Fully established — bidirectional traffic allowed. */
  | 'open'
  /** Close handshake initiated or shutdown drain in progress —
   *  no new inbound messages accepted. */
  | 'closing'
  /** Terminal state. */
  | 'closed';

/** Result of a close/drain request for a single connection. */
export interface CloseResult {
  readonly connectionId: string;
  /** Frame close code actually sent (1000 = normal, 1001 = going away). */
  readonly code: number;
  /** True when the remote acknowledged the close in time; false when
   *  the deadline forced a transport-level drop. */
  readonly graceful: boolean;
}

/** Statistics exposed by the engine for health/metrics endpoints. */
export interface Engine2Stats {
  readonly openConnections: number;
  readonly draining: boolean;
  readonly compressedMessages: number;
  readonly compressedBytesIn: number;
  readonly compressedBytesOut: number;
  readonly clusterNodes: number;
}
