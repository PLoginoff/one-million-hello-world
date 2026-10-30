/**
 * UpgradeRouter — server-side path routing for WebSocket upgrades.
 *
 * An HTTP server exposes many WebSocket endpoints on one listener
 * (`/ws/chat/:room`, `/ws/notifications`, …). The router sits at the
 * Upgrade boundary and answers, for each inbound HTTP request:
 *
 *   1. **Route** — does the path match a registered pattern? Patterns
 *      support `:param` segments (`/chat/:room`) matched segment-wise;
 *      matched params are handed to the connection handler.
 *   2. **Capacity** — is the route under its per-route connection limit?
 *      Over-limit upgrades get a `503` rejection *before* the handshake —
 *      refusing the upgrade is far cheaper than accepting then closing.
 *   3. **Handshake** — is the request a valid RFC 6455 opening (delegated
 *      to {@link validateHandshake}) including subprotocol negotiation?
 *   4. **Resume** — if the client presents `x-ws-resume` token, verify it
 *      and prepare a replay plan instead of a fresh session.
 *
 * On accept, {@link UpgradeRouter.attach} wires the full per-connection
 * stack:
 *
 * ```
 *   transport bytes → WebSocketSession → ConnectionRateLimiter
 *                                     → PresenceRegistry.touch
 *                                     → route.onMessage
 *   app sends      → SendQueue (backpressure policy)
 *                  → ResumeBuffer.append (sequenced replay log)
 *                  → session.sendMessage → transport
 * ```
 *
 * Disconnects keep the ResumeBuffer for `resumeWindowMs`; a reattach with
 * a valid token replays missed messages then resumes live traffic.
 *
 * Everything is transport-agnostic — the socket boundary is a
 * `TransportSink`, identical to `WebSocketSession`'s own contract.
 *
 * @module WebsocketLayer/Server
 */

import {
  HandshakeRequest,
  HandshakeOptions,
  validateHandshake,
} from '../protocol/Handshake';
import { WebSocketSession, TransportSink } from '../protocol/WebSocketSession';
import { WsMessage, WsCloseCode } from '../protocol/types';
import { ConnectionRateLimiter } from './ConnectionRateLimiter';
import { SendQueue, BackpressurePolicy } from './SendQueue';
import {
  ResumeBuffer,
  ResumeTokenIssuer,
  ResumeToken,
  ResumeResult,
  newConnectionId,
} from './ResumeBuffer';
import { RoomManager } from './RoomManager';
import { PresenceRegistry, UserId } from './PresenceRegistry';

/* ------------------------------------------------------------------ */
/* Route patterns                                                       */
/* ------------------------------------------------------------------ */

/**
 * A route pattern is a `/`-separated path where segments starting with
 * `:` capture one path segment each. A trailing `*` captures the rest.
 *
 *   /ws/chat          → exact match only
 *   /chat/:room       → /chat/general, /chat/eng; params {room: 'general'}
 *   /stream/*         → /stream/a, /stream/a/b/c (rest captured as '*')
 */
export class RoutePattern {
  readonly raw: string;
  private readonly _segments: readonly string[];
  private readonly _paramNames: readonly string[];
  private readonly _regex: RegExp;

  constructor(pattern: string) {
    this.raw = pattern;
    if (!pattern.startsWith('/')) {
      throw new Error(`route pattern must start with '/': ${pattern}`);
    }
    this._segments = pattern.split('/').filter((s) => s.length > 0);
    this._paramNames = this._segments
      .filter((s) => s.startsWith(':') || s === '*')
      .map((s) => (s === '*' ? '*' : s.slice(1)));
    this._regex = RoutePattern._compile(this._segments);
  }

  get paramNames(): readonly string[] {
    return this._paramNames;
  }

  /**
   * Match a concrete request path. Returns captured params on success,
   * null on miss. Matching is O(#segments); params decodeURIComponent'd.
   */
  match(path: string): Readonly<Record<string, string>> | null {
    const clean = path.split('?')[0];
    const m = this._regex.exec(clean);
    if (m === null) return null;
    const params: Record<string, string> = {};
    this._paramNames.forEach((name, i) => {
      params[name] = decodeURIComponent(m[i + 1]);
    });
    return params;
  }

  private static _compile(segments: readonly string[]): RegExp {
    const parts = segments.map((s) => {
      if (s === '*') return '(.+)';
      if (s.startsWith(':')) return '([^/]+)';
      return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    });
    return new RegExp(`^/${parts.join('/')}$`);
  }
}

/* ------------------------------------------------------------------ */
/* Route definitions                                                    */
/* ------------------------------------------------------------------ */

/** Per-connection inbound-message rate limit. */
export interface RouteRateLimit {
  readonly ratePerSec: number;
  readonly capacity?: number;
  /** Violation score that closes the connection (policy violation). */
  readonly closeAt?: number;
}

/** Resume support: how long a dead connection's buffer is retained. */
export interface RouteResume {
  /** Retain missed messages this long after disconnect. Default 60s. */
  readonly windowMs?: number;
  readonly maxEntries?: number;
  readonly maxBytes?: number;
}

/** Outbound backpressure config for the route's send queues. */
export interface RouteBackpressure {
  readonly highWaterMarkBytes: number;
  readonly maxBytes: number;
  readonly policy: BackpressurePolicy;
}

/** Hooks the application provides per route. */
export interface RouteHooks {
  /**
   * Authorize an upgrade before the handshake is even answered. Throw or
   * return a string reason to reject with 403. May return the userId the
   * connection belongs to (registered in presence on attach).
   */
  readonly authorize?: (ctx: RouteContext) => string | null | Promise<string | null>;
  /** Application message handler — post rate-limit, post presence touch. */
  readonly onMessage?: (conn: ServerConnection, message: WsMessage) => void;
  /** Called when the connection is fully closed (not resumable anymore). */
  readonly onDisconnect?: (connId: string, userId: UserId | null) => void;
  /** Rooms the connection auto-joins on attach. */
  readonly autoJoinRooms?: (conn: ServerConnection) => readonly string[];
}

export interface RouteContext {
  readonly path: string;
  readonly params: Readonly<Record<string, string>>;
  readonly headers: ReadonlyMap<string, string>;
}

export interface RouteDefinition {
  readonly pattern: RoutePattern;
  /** Max simultaneous live connections on this route. Default ∞. */
  readonly maxConnections?: number;
  readonly handshake?: HandshakeOptions;
  readonly rateLimit?: RouteRateLimit;
  readonly resume?: RouteResume | false;
  readonly backpressure?: RouteBackpressure;
  readonly session?: {
    readonly pingIntervalMs?: number;
    readonly pongTimeoutMs?: number;
    readonly maxMessageBytes?: number;
  };
  readonly hooks?: RouteHooks;
}

/* ------------------------------------------------------------------ */
/* Decisions                                                            */
/* ------------------------------------------------------------------ */

export type UpgradeDecision =
  | {
      readonly kind: 'accept';
      readonly route: RouteDefinition;
      readonly connId: string;
      readonly params: Readonly<Record<string, string>>;
      readonly acceptKey: string;
      readonly subprotocol: string | null;
      /** Present when a resume token was honored — replay before live sends. */
      readonly resume: { readonly token: ResumeToken; readonly plan: ResumeResult } | null;
    }
  | {
      readonly kind: 'reject';
      /** HTTP status the server should answer with. */
      readonly status: number;
      readonly errors: readonly string[];
    };

/* ------------------------------------------------------------------ */
/* ServerConnection — the per-connection runtime handle                 */
/* ------------------------------------------------------------------ */

/** What the application sees for one attached connection. */
export class ServerConnection {
  readonly connId: string;
  readonly route: RouteDefinition;
  readonly params: Readonly<Record<string, string>>;
  userId: UserId | null = null;

  private readonly _session: WebSocketSession;
  private readonly _queue: SendQueue;
  private readonly _resume: ResumeBuffer | null;
  private readonly _limiter: ConnectionRateLimiter | null;
  private readonly _closeAt: number;
  private readonly _onTerminated: (connId: string, reason: string) => void;

  constructor(args: {
    connId: string;
    route: RouteDefinition;
    params: Readonly<Record<string, string>>;
    session: WebSocketSession;
    queue: SendQueue;
    resume: ResumeBuffer | null;
    limiter: ConnectionRateLimiter | null;
    closeAt: number;
    onTerminated: (connId: string, reason: string) => void;
  }) {
    this.connId = args.connId;
    this.route = args.route;
    this.params = args.params;
    this._session = args.session;
    this._queue = args.queue;
    this._resume = args.resume;
    this._limiter = args.limiter;
    this._closeAt = args.closeAt;
    this._onTerminated = args.onTerminated;
  }

  get session(): WebSocketSession {
    return this._session;
  }

  /** Internal: replay buffer handle for teardown/resume-adoption. */
  get resumeBuffer(): ResumeBuffer | null {
    return this._resume;
  }

  /** Sequenced send — records in the replay buffer, then queues. */
  send(payload: Buffer | string, binary = false): boolean {
    const data = typeof payload === 'string' ? Buffer.from(payload, 'utf8') : payload;
    this._resume?.append(data, binary);
    return this._queue.enqueue(data, binary);
  }

  /** Inbound admission control — call for each application message. */
  admitMessage(cost = 1): boolean {
    if (this._limiter === null) return true;
    const d = this._limiter.admit(cost);
    if (!d.allowed && this._closeAt > 0 && d.violationScore >= this._closeAt) {
      this._onTerminated(this.connId, 'rate-limit-violation');
      this._session.close(WsCloseCode.POLICY_VIOLATION, 'rate limit exceeded');
    }
    return d.allowed;
  }

  /** Current resume token (lastSeq = last sent seq). */
  resumeToken(issuer: ResumeTokenIssuer): string | null {
    if (this._resume === null) return null;
    // lastSeq the client has received ≈ nextSeq-1 minus unsent queue; we
    // conservatively token at nextSeq-1 — replay sends the same entries
    // again, which the client dedupes by seq.
    return issuer.issue(this.connId, this._resume.nextSeq - 1);
  }

  close(code = WsCloseCode.NORMAL, reason = ''): void {
    this._session.close(code, reason);
  }
}

/* ------------------------------------------------------------------ */
/* Router                                                               */
/* ------------------------------------------------------------------ */

export interface UpgradeRouterOptions {
  /** Default per-route backpressure when the route doesn't specify. */
  readonly defaultBackpressure?: RouteBackpressure;
  /** Token issuer for resume support. Required when any route enables resume. */
  readonly tokenIssuer?: ResumeTokenIssuer;
  /** Shared room manager — connections can join/broadcast via router. */
  readonly rooms?: RoomManager;
  /** Shared presence registry — userId from `authorize` hooks is tracked. */
  readonly presence?: PresenceRegistry;
  /** Injectable clock + scheduler forwarded to sessions and buffers. */
  readonly now?: () => number;
  readonly setTimeoutFn?: (fn: () => void, ms: number) => unknown;
  readonly clearTimeoutFn?: (handle: unknown) => void;
}

interface DeadConnection {
  readonly route: RouteDefinition;
  readonly buffer: ResumeBuffer;
  readonly userId: UserId | null;
  readonly disconnectedAt: number;
}

const DEFAULT_BACKPRESSURE: RouteBackpressure = {
  highWaterMarkBytes: 256 * 1024,
  maxBytes: 1024 * 1024,
  policy: BackpressurePolicy.DROP_NEWEST,
};

export class UpgradeRouter {
  private readonly _routes: RouteDefinition[] = [];
  private readonly _live = new Map<string, ServerConnection>();
  private readonly _dead = new Map<string, DeadConnection>();
  private readonly _issuer: ResumeTokenIssuer | null;
  private readonly _rooms: RoomManager | null;
  private readonly _presence: PresenceRegistry | null;
  private readonly _defaults: RouteBackpressure;
  private readonly _now: () => number;
  private readonly _setTimeout: (fn: () => void, ms: number) => unknown;
  private readonly _clearTimeout: (handle: unknown) => void;
  private readonly _sweepInterval: number = 5_000;
  private _sweepTimer: unknown = null;
  private _sweeping = false;

  constructor(options: UpgradeRouterOptions = {}) {
    this._issuer = options.tokenIssuer ?? null;
    this._rooms = options.rooms ?? null;
    this._presence = options.presence ?? null;
    this._defaults = options.defaultBackpressure ?? DEFAULT_BACKPRESSURE;
    this._now = options.now ?? (() => Date.now());
    this._setTimeout = options.setTimeoutFn ?? ((fn, ms) => setTimeout(fn, ms));
    this._clearTimeout = options.clearTimeoutFn ?? ((h) => clearTimeout(h as NodeJS.Timeout));
  }

  /** All registered routes (order matters — first match wins). */
  get routes(): readonly RouteDefinition[] {
    return this._routes;
  }

  get liveConnections(): number {
    return this._live.size;
  }

  /** Register a route. First-registered wins on ambiguous patterns. */
  addRoute(route: RouteDefinition): this {
    if (route.resume !== undefined && route.resume !== false && this._issuer === null) {
      throw new Error(`route ${route.pattern.raw} enables resume but no tokenIssuer configured`);
    }
    this._routes.push(route);
    this._ensureSweeper();
    return this;
  }

  /** Look up an attached connection. */
  connection(connId: string): ServerConnection | undefined {
    return this._live.get(connId);
  }

  /**
   * Decide whether to upgrade `request`. Pure decision — no session is
   * created; call {@link attach} on `accept`.
   */
  async decide(request: HandshakeRequest): Promise<UpgradeDecision> {
    const path = request.path.split('?')[0];
    const route = this._routes.find((r) => r.pattern.match(path) !== null);
    if (route === undefined) {
      return { kind: 'reject', status: 404, errors: [`no WebSocket route for ${path}`] };
    }
    const params = route.pattern.match(path) as Record<string, string>;

    // Per-route capacity check — before handshake validation, because
    // overload rejection shouldn't leak whether the handshake was valid.
    const max = route.maxConnections ?? Number.POSITIVE_INFINITY;
    if (this._routeLiveCount(route) >= max) {
      return { kind: 'reject', status: 503, errors: ['route connection limit reached'] };
    }

    // Application authorization hook.
    if (route.hooks?.authorize !== undefined) {
      const ctx: RouteContext = { path, params, headers: request.headers };
      const result = await route.hooks.authorize(ctx);
      if (typeof result === 'string') {
        return { kind: 'reject', status: 403, errors: [result] };
      }
    }

    const validation = validateHandshake(request, route.handshake ?? {});
    if (!validation.valid) {
      return { kind: 'reject', status: 400, errors: validation.errors };
    }

    // Resume token honored?
    let resume: { token: ResumeToken; plan: ResumeResult } | null = null;
    const resumeHeader = request.headers.get('x-ws-resume');
    if (resumeHeader !== undefined && this._issuer !== null && route.resume !== false) {
      const token = this._issuer.verify(resumeHeader);
      if (token !== null) {
        const dead = this._dead.get(token.connectionId);
        if (dead !== undefined && dead.route === route) {
          resume = { token, plan: dead.buffer.replayAfter(token.lastSeq) };
        }
      }
    }

    return {
      kind: 'accept',
      route,
      connId: newConnectionId(),
      params,
      acceptKey: validation.acceptKey as string,
      subprotocol: validation.subprotocol,
      resume,
    };
  }

  /**
   * Wire the full per-connection stack for an accepted upgrade.
   * `transport` is the outbound byte sink (socket.write).
   *
   * If the decision carried a resume plan, the old buffer is adopted so
   * sequence numbers continue, and the caller should flush
   * `decision.resume.plan.messages` through {@link ServerConnection.send}
   * replay *before* live traffic.
   */
  attach(decision: Extract<UpgradeDecision, { kind: 'accept' }>, transport: TransportSink): ServerConnection {
    const route = decision.route;
    const bp = route.backpressure ?? this._defaults;

    // Adopt the dead connection's buffer on resume, else start fresh.
    let buffer: ResumeBuffer | null = null;
    if (decision.resume !== null && route.resume !== false) {
      const dead = this._dead.get(decision.resume.token.connectionId);
      if (dead !== undefined) {
        buffer = dead.buffer;
        this._dead.delete(decision.resume.token.connectionId);
      }
    }
    if (buffer === null && route.resume !== undefined && route.resume !== false) {
      buffer = new ResumeBuffer({
        maxEntries: route.resume.maxEntries,
        maxBytes: route.resume.maxBytes,
        now: this._now,
      });
    }

    // `session`/`conn` are referenced by each other's callbacks; both are
    // assigned below before any callback can fire (listeners only run in
    // response to receiveData/close).
    let session: WebSocketSession;
    let conn: ServerConnection;

    const queue = new SendQueue(
      (entry) => {
        const ok = session.sendMessage(entry.payload, entry.binary);
        if (ok) session.flush();
        return ok;
      },
      {
        highWaterMarkBytes: bp.highWaterMarkBytes,
        maxBytes: bp.maxBytes,
        policy: bp.policy,
        now: this._now,
        onPolicyClose: () => {
          session.close(WsCloseCode.INTERNAL_ERROR, 'send queue overflow');
        },
      }
    );

    const limiter =
      route.rateLimit !== undefined
        ? new ConnectionRateLimiter({
            ratePerSec: route.rateLimit.ratePerSec,
            capacity: route.rateLimit.capacity,
            now: this._now,
          })
        : null;

    session = new WebSocketSession(
      {
        isServer: true,
        transport,
        pingIntervalMs: route.session?.pingIntervalMs ?? 0,
        pongTimeoutMs: route.session?.pongTimeoutMs,
        maxMessageBytes: route.session?.maxMessageBytes,
        now: this._now,
        setTimeoutFn: this._setTimeout,
        clearTimeoutFn: this._clearTimeout,
      },
      {
        onMessage: (message) => {
          if (!conn.admitMessage()) return;
          this._presence?.touch(conn.connId);
          route.hooks?.onMessage?.(conn, message);
        },
        onClose: () => this._teardown(conn.connId, false),
      }
    );

    conn = new ServerConnection({
      connId: decision.connId,
      route,
      params: decision.params,
      session,
      queue,
      resume: buffer,
      limiter,
      closeAt: route.rateLimit?.closeAt ?? 0,
      onTerminated: (connId) => this._teardown(connId, true),
    });

    session.open();
    this._live.set(conn.connId, conn);

    // Auto-join rooms if the route defines them.
    const roomsToJoin = route.hooks?.autoJoinRooms?.(conn) ?? [];
    if (this._rooms !== null) {
      for (const room of roomsToJoin) {
        try {
          this._rooms.join(room, conn.connId);
        } catch {
          // Caps exceeded — surfacing via hooks would be nicer; skip silently.
        }
      }
    }
    return conn;
  }

  /**
   * The socket delivered bytes — forward into the session.
   */
  receive(conn: ServerConnection, chunk: Buffer): void {
    conn.session.receiveData(chunk);
  }

  /** The socket went away without a close handshake. */
  transportEnded(conn: ServerConnection): void {
    conn.session.transportEnded();
    this._teardown(conn.connId, false);
  }

  /**
   * Attach a userId to the connection (post-authorize) — registers
   * presence. Call once after attach when the route's authorize hook
   * resolved a user out-of-band.
   */
  identify(conn: ServerConnection, userId: UserId): void {
    conn.userId = userId;
    this._presence?.addConnection(userId, conn.connId);
  }

  /**
   * Replay a resume plan through the connection's send path, then hand
   * the client its new resume token for the *next* disconnect.
   */
  replayResumePlan(conn: ServerConnection, decision: Extract<UpgradeDecision, { kind: 'accept' }>): number {
    if (decision.resume === null || decision.resume.plan.kind !== 'replay') return 0;
    let replayed = 0;
    for (const m of decision.resume.plan.messages) {
      if (conn.send(m.payload, m.binary)) replayed++;
    }
    return replayed;
  }

  /** Stop the background sweeper (test teardown). */
  dispose(): void {
    if (this._sweepTimer !== null) {
      this._clearTimeout(this._sweepTimer);
      this._sweepTimer = null;
    }
  }

  /**
   * Expire dead connection state past each route's resume window.
   * Called by the sweeper; exposed for tests with manual clocks.
   */
  sweepExpiredResumeState(now = this._now()): number {
    let expired = 0;
    for (const [connId, dead] of [...this._dead]) {
      const windowMs = dead.route.resume === false || dead.route.resume === undefined
        ? 0
        : dead.route.resume.windowMs ?? 60_000;
      if (now - dead.disconnectedAt > windowMs) {
        this._dead.delete(connId);
        expired++;
        dead.buffer.clear();
      }
    }
    return expired;
  }

  // ------------------------------------------------------------------

  private _routeLiveCount(route: RouteDefinition): number {
    let n = 0;
    for (const c of this._live.values()) {
      if (c.route === route) n++;
    }
    return n;
  }

  /**
   * Connection lifecycle end: remove from live, clean presence + rooms,
   * keep (or discard) the resume buffer for the route's window.
   */
  private _teardown(connId: string, _terminated: boolean): void {
    const conn = this._live.get(connId);
    if (conn === undefined) return;
    this._live.delete(connId);
    const userId = this._presence !== null
      ? this._presence.removeConnection(connId)
      : conn.userId;
    if (this._rooms !== null) {
      this._rooms.leaveAll(connId);
    }
    // Persist the buffer for resume if the route opted in.
    const resumeCfg = conn.route.resume;
    if (resumeCfg !== undefined && resumeCfg !== false) {
      const buffer = conn.resumeBuffer;
      if (buffer !== null) {
        this._dead.set(connId, {
          route: conn.route,
          buffer,
          userId: conn.userId,
          disconnectedAt: this._now(),
        });
      }
    }
    conn.route.hooks?.onDisconnect?.(connId, userId ?? conn.userId);
  }

  private _ensureSweeper(): void {
    if (this._sweeping) return;
    this._sweeping = true;
    const tick = () => {
      this.sweepExpiredResumeState();
      this._sweepTimer = this._setTimeout(tick, this._sweepInterval);
    };
    this._sweepTimer = this._setTimeout(tick, this._sweepInterval);
  }
}
