/**
 * ExtendedConnect — RFC 8441 "Bootstrapping WebSockets with HTTP/2".
 *
 * HTTP/2 has no Upgrade mechanism, so websockets over H2 use an extended
 * CONNECT request:
 *
 *   :method    = CONNECT
 *   :protocol  = websocket
 *   :scheme    = https
 *   :authority = example.com
 *   :path      = /chat
 *   sec-websocket-protocol = chat.v2, superchat
 *   sec-websocket-extensions = permessage-deflate
 *
 * The server answers with a :status 2xx HEADERS frame; the DATA frames of
 * that stream then carry websocket frames verbatim. This module validates
 * and negotiates such requests and maintains the small amount of
 * per-tunnel state a proxy needs (origin allowed? subprotocol picked?
 * tunnel still alive?).
 *
 * It is deliberately transport-agnostic: a real H2 stack hands us the
 * decoded pseudo-headers; we hand back a verdict and the response headers.
 *
 * Complexity: validate/negotiate are O(#offered-subprotocols); the tunnel
 * registry is a flat Map — O(1) per operation.
 *
 * @module WebsocketLayer/Engine2
 */

import { WsClock2, SystemWsClock2 } from './types';

/** Decoded headers of an extended CONNECT request (pseudo-headers flattened). */
export interface ExtendedConnectRequest {
  /** Must be "CONNECT" (case-insensitive). */
  readonly method: string;
  /** RFC 8441 requires the :protocol pseudo-header to be "websocket". */
  readonly protocol?: string;
  /** :scheme — http or https (wss maps to https). */
  readonly scheme: string;
  /** :authority — host[:port]. */
  readonly authority: string;
  /** :path — the websocket resource path, e.g. "/chat". */
  readonly path: string;
  /** Client-offered subprotocols (sec-websocket-protocol, already split). */
  readonly offeredSubprotocols?: readonly string[];
  /** Client-offered extensions (sec-websocket-extensions, already split). */
  readonly offeredExtensions?: readonly string[];
  /** Optional origin header for CSWSH checks. */
  readonly origin?: string;
}

export type RejectReason =
  | 'not-connect'
  | 'missing-protocol'
  | 'wrong-protocol'
  | 'missing-path'
  | 'origin-denied'
  | 'route-not-found'
  | 'no-subprotocol'
  | 'no-common-extension';

export interface ExtendedConnectAccept {
  readonly ok: true;
  /** Tunnel id assigned to this request. */
  readonly tunnelId: string;
  /** Response headers to send on the HEADERS frame (:status implied 200). */
  readonly responseHeaders: Readonly<Record<string, string>>;
  /** Subprotocol selected from the client's offer list, or null. */
  readonly selectedSubprotocol: string | null;
  /** Extensions selected for the tunnel. */
  readonly selectedExtensions: readonly string[];
}

export interface ExtendedConnectReject {
  readonly ok: false;
  readonly reason: RejectReason;
  /** HTTP status to report (400/403/404/405). */
  readonly status: number;
}

export type ExtendedConnectVerdict = ExtendedConnectAccept | ExtendedConnectReject;

export interface ExtendedConnectOptions {
  /** Server-supported subprotocols in preference order. Empty = none required. */
  supportedSubprotocols?: readonly string[];
  /** Server-supported extension tokens. Empty = none supported. */
  supportedExtensions?: readonly string[];
  /** Allowed origins for the Origin header. Empty = allow all (non-browser). */
  allowedOrigins?: readonly string[];
  /** Route table: which :path values map to handlers. Empty = accept any path. */
  routes?: readonly string[];
  /** If true and the client offers no subprotocol but the server requires
   *  one, reject instead of picking the first server preference. Default false. */
  requireSubprotocol?: boolean;
  /** If true and extension lists don't intersect, reject. Default false —
   *  extensions are optional per RFC. */
  requireExtensions?: boolean;
  clock?: WsClock2;
}

interface Tunnel {
  id: string;
  path: string;
  authority: string;
  subprotocol: string | null;
  extensions: readonly string[];
  openedAtMs: number;
  closed: boolean;
}

export class ExtendedConnect {
  private readonly _subprotocols: readonly string[];
  private readonly _extensions: readonly string[];
  private readonly _origins: readonly string[];
  private readonly _routes: readonly string[];
  private readonly _requireSub: boolean;
  private readonly _requireExt: boolean;
  private readonly _clock: WsClock2;
  private readonly _tunnels = new Map<string, Tunnel>();
  private _nextId = 1;

  constructor(opts: ExtendedConnectOptions = {}) {
    this._subprotocols = opts.supportedSubprotocols ?? [];
    this._extensions = opts.supportedExtensions ?? [];
    this._origins = opts.allowedOrigins ?? [];
    this._routes = opts.routes ?? [];
    this._requireSub = opts.requireSubprotocol ?? false;
    this._requireExt = opts.requireExtensions ?? false;
    this._clock = opts.clock ?? new SystemWsClock2();
  }

  /**
   * Validate + negotiate an extended CONNECT request.
   * Pure function of the request and configuration — no state mutated
   * except on success, when the tunnel is registered.
   */
  negotiate(req: ExtendedConnectRequest): ExtendedConnectVerdict {
    // RFC 8441 §2: the request is a CONNECT carrying :protocol = websocket.
    if (req.method.toUpperCase() !== 'CONNECT') {
      return this._reject('not-connect', 405);
    }
    if (req.protocol === undefined) {
      return this._reject('missing-protocol', 400);
    }
    if (req.protocol.toLowerCase() !== 'websocket') {
      return this._reject('wrong-protocol', 400);
    }
    if (!req.path || !req.path.startsWith('/')) {
      return this._reject('missing-path', 400);
    }
    if (this._routes.length > 0 && !this._routes.includes(req.path)) {
      return this._reject('route-not-found', 404);
    }
    if (req.origin !== undefined && this._origins.length > 0 && !this._origins.includes(req.origin)) {
      return this._reject('origin-denied', 403);
    }

    const subprotocol = this._pickSubprotocol(req.offeredSubprotocols ?? []);
    if (subprotocol === null && this._requireSub && this._subprotocols.length > 0) {
      return this._reject('no-subprotocol', 400);
    }

    const extensions = this._pickExtensions(req.offeredExtensions ?? []);
    if (extensions.length === 0 && this._requireExt && this._extensions.length > 0) {
      return this._reject('no-common-extension', 400);
    }

    const tunnelId = `tun-${this._nextId++}`;
    this._tunnels.set(tunnelId, {
      id: tunnelId,
      path: req.path,
      authority: req.authority,
      subprotocol,
      extensions,
      openedAtMs: this._clock.now(),
      closed: false,
    });

    const responseHeaders: Record<string, string> = { ':status': '200' };
    if (subprotocol !== null) {
      responseHeaders['sec-websocket-protocol'] = subprotocol;
    }
    if (extensions.length > 0) {
      responseHeaders['sec-websocket-extensions'] = extensions.join(', ');
    }

    return {
      ok: true,
      tunnelId,
      responseHeaders,
      selectedSubprotocol: subprotocol,
      selectedExtensions: extensions,
    };
  }

  /** Does a live (non-closed) tunnel exist with this id? */
  isOpen(tunnelId: string): boolean {
    const t = this._tunnels.get(tunnelId);
    return t !== undefined && !t.closed;
  }

  /** Mark a tunnel closed (stream ended or RST_STREAM received). */
  closeTunnel(tunnelId: string): boolean {
    const t = this._tunnels.get(tunnelId);
    if (!t || t.closed) return false;
    t.closed = true;
    return true;
  }

  /** Remove a tunnel record entirely. */
  forget(tunnelId: string): boolean {
    return this._tunnels.delete(tunnelId);
  }

  /** Snapshot of a live tunnel, or null. */
  tunnel(tunnelId: string): Readonly<Tunnel> | null {
    const t = this._tunnels.get(tunnelId);
    return t && !t.closed ? t : null;
  }

  /** Number of currently open tunnels. */
  get openTunnelCount(): number {
    let n = 0;
    for (const t of this._tunnels.values()) if (!t.closed) n++;
    return n;
  }

  /**
   * Server-driven subprotocol pick: iterate *server* preference order and
   * take the first token the client offered. This keeps server policy in
   * control — e.g. preferring a compact binary protocol even when the
   * client lists a chatty JSON one first.
   */
  private _pickSubprotocol(offered: readonly string[]): string | null {
    const offeredSet = new Set(offered.map((s) => s.trim().toLowerCase()));
    for (const supported of this._subprotocols) {
      if (offeredSet.has(supported.toLowerCase())) return supported;
    }
    // No overlap: if the client offered nothing, RFC 6455 allows the
    // server to proceed with no subprotocol; if the client offered some
    // and none matched, we still proceed with null unless requireSub.
    return null;
  }

  /**
   * Intersect offered extension tokens with supported ones (offer order
   * preserved — the client stated its preference). Parameters attached to
   * the token (e.g. "permessage-deflate; client_max_window_bits=10") are
   * kept verbatim so a downstream negotiator can refine them.
   */
  private _pickExtensions(offered: readonly string[]): string[] {
    const out: string[] = [];
    for (const raw of offered) {
      const token = raw.split(';')[0].trim().toLowerCase();
      if (this._extensions.some((e) => e.toLowerCase() === token)) {
        out.push(raw.trim());
      }
    }
    return out;
  }

  private _reject(reason: RejectReason, status: number): ExtendedConnectReject {
    return { ok: false, reason, status };
  }
}
