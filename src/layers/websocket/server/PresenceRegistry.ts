/**
 * PresenceRegistry — who is online, where, and on how many devices.
 *
 * Presence is distinct from rooms: a *user* is online while they hold at
 * least one live connection, anywhere in the server. The registry tracks
 * the `userId → connections` mapping plus arbitrary per-user and
 * per-connection metadata (status, device, custom fields), and pushes
 * transition events to subscribers.
 *
 * Semantics (matching mainstream presence systems):
 *
 *  - `addConnection(userId, connId)` / `removeConnection(connId)` are the
 *    only lifecycle calls. A user is online iff `connections(user).size > 0`.
 *  - Online/offline events fire on the *edge* — the first connection
 *    appearing and the last one disappearing. Adding a second tab fires
 *    `connection-added`, not `online` — subscribers that want per-device
 *    counts subscribe to the same events and read `connectionCount`.
 *  - Subscriptions can be *global* (all users) or *scoped* to a set of
 *    user ids (a contact-list model: "tell me when *these* people change").
 *    Scoped subscriptions are the efficient shape for large user bases —
 *    a fan-out of N global subscribers × M users is wasteful.
 *  - Idle detection: connections may report `lastActivityAt`; `sweep`
 *    marks connections idle past a timeout without disconnecting them,
 *    emitting `idle` so the app can show "away" — keeping the transport
 *    question (still connected?) separate from the activity question.
 *
 * Data structures:
 *  - `users: Map<userId, UserPresence>` where UserPresence owns a
 *    `Map<connId, ConnectionPresence>` — per-user ops are O(1).
 *  - `byConn: Map<connId, userId>` — reverse index so disconnects (which
 *    arrive by connId) are O(1), not O(all users).
 *
 * Complexity: add/remove/setStatus O(1); notify fans out to matched
 * subscribers O(#subscribers); sweep O(total connections).
 *
 * @module WebsocketLayer/Server
 */

export type UserId = string;
export type ConnectionId = string;

/** Standard presence states; `custom` state lives in `metadata`. */
export enum PresenceState {
  ONLINE = 'online',
  IDLE = 'idle',
  OFFLINE = 'offline',
}

/** Per-connection record. */
export interface ConnectionPresence {
  readonly connId: ConnectionId;
  /** User's own connection label (device, tab id, …). */
  readonly label: string | null;
  readonly connectedAt: number;
  /** Last time this connection did anything application-visible. */
  lastActivityAt: number;
  /** True after `sweep` flags the connection idle. */
  idle: boolean;
}

/** Aggregate view of one user. */
export interface UserPresence {
  readonly userId: UserId;
  /** ONLINE while ≥1 connection live; IDLE when all conns idle. */
  readonly state: PresenceState;
  readonly connections: ReadonlyMap<ConnectionId, ConnectionPresence>;
  /** Opaque per-user metadata set via `setUserMetadata`. */
  readonly metadata: Readonly<Record<string, string>>;
}

/** Events emitted to presence subscribers. */
export type PresenceEvent =
  | { readonly kind: 'online'; readonly userId: UserId; readonly at: number }
  | { readonly kind: 'offline'; readonly userId: UserId; readonly at: number }
  | {
      readonly kind: 'connection-added';
      readonly userId: UserId;
      readonly connId: ConnectionId;
      readonly connectionCount: number;
    }
  | {
      readonly kind: 'connection-removed';
      readonly userId: UserId;
      readonly connId: ConnectionId;
      readonly connectionCount: number;
    }
  | { readonly kind: 'idle'; readonly userId: UserId; readonly connId: ConnectionId }
  | { readonly kind: 'active'; readonly userId: UserId; readonly connId: ConnectionId }
  | {
      readonly kind: 'metadata-changed';
      readonly userId: UserId;
      readonly metadata: Readonly<Record<string, string>>;
    };

export type PresenceListener = (event: PresenceEvent) => void;

export interface PresenceRegistryOptions {
  readonly now?: () => number;
}

interface MutableUserPresence {
  userId: UserId;
  connections: Map<ConnectionId, ConnectionPresence>;
  metadata: Record<string, string>;
}

interface Subscription {
  /** Null = global subscription (all users). */
  readonly userIds: ReadonlySet<UserId> | null;
  readonly listener: PresenceListener;
}

export class PresenceRegistry {
  private readonly _users = new Map<UserId, MutableUserPresence>();
  private readonly _byConn = new Map<ConnectionId, UserId>();
  private readonly _subscriptions = new Set<Subscription>();
  private readonly _now: () => number;

  constructor(options: PresenceRegistryOptions = {}) {
    this._now = options.now ?? (() => Date.now());
  }

  /** Users currently online (≥1 connection). */
  get onlineCount(): number {
    return this._users.size;
  }

  get connectionCount(): number {
    return this._byConn.size;
  }

  isOnline(userId: UserId): boolean {
    return this._users.has(userId);
  }

  /** Connection count for a user (0 when offline). */
  connectionsFor(userId: UserId): number {
    return this._users.get(userId)?.connections.size ?? 0;
  }

  /** Snapshot of one user's presence, or null when offline. */
  get(userId: UserId): UserPresence | null {
    const u = this._users.get(userId);
    if (u === undefined) return null;
    return this._present(u);
  }

  /** All online user ids. O(#online). */
  onlineUsers(): UserId[] {
    return [...this._users.keys()];
  }

  /**
   * Register a new connection for `userId`. Fires `online` on the user's
   * first connection, `connection-added` on subsequent ones.
   */
  addConnection(userId: UserId, connId: ConnectionId, label: string | null = null): void {
    if (this._byConn.has(connId)) {
      throw new Error(`connection ${connId} already registered`);
    }
    let u = this._users.get(userId);
    const now = this._now();
    if (u === undefined) {
      u = { userId, connections: new Map(), metadata: {} };
      this._users.set(userId, u);
      u.connections.set(connId, {
        connId,
        label,
        connectedAt: now,
        lastActivityAt: now,
        idle: false,
      });
      this._byConn.set(connId, userId);
      this._emit({ kind: 'online', userId, at: now });
      return;
    }
    u.connections.set(connId, {
      connId,
      label,
      connectedAt: now,
      lastActivityAt: now,
      idle: false,
    });
    this._byConn.set(connId, userId);
    this._emit({
      kind: 'connection-added',
      userId,
      connId,
      connectionCount: u.connections.size,
    });
  }

  /**
   * Drop a connection (on socket close). Fires `offline` when the user's
   * last connection disappears. Returns the owning userId, or null when
   * the connection was unknown.
   */
  removeConnection(connId: ConnectionId): UserId | null {
    const userId = this._byConn.get(connId);
    if (userId === undefined) return null;
    this._byConn.delete(connId);
    const u = this._users.get(userId);
    if (u === undefined) return userId; // defensive; indexes can't diverge
    u.connections.delete(connId);
    if (u.connections.size === 0) {
      this._users.delete(userId);
      this._emit({ kind: 'offline', userId, at: this._now() });
    } else {
      this._emit({
        kind: 'connection-removed',
        userId,
        connId,
        connectionCount: u.connections.size,
      });
    }
    return userId;
  }

  /**
   * Record activity on a connection — clears the idle flag and emits
   * `active` if it was set. Call on every inbound application message.
   */
  touch(connId: ConnectionId): void {
    const userId = this._byConn.get(connId);
    if (userId === undefined) return;
    const u = this._users.get(userId);
    const c = u?.connections.get(connId);
    if (u === undefined || c === undefined) return;
    c.lastActivityAt = this._now();
    if (c.idle) {
      c.idle = false;
      this._emit({ kind: 'active', userId, connId });
    }
  }

  /**
   * Mark connections idle when their last activity is older than
   * `idleAfterMs`. Emits `idle` for each newly-idle connection. Returns
   * the connIds marked.
   */
  sweep(idleAfterMs: number): ConnectionId[] {
    const cutoff = this._now() - idleAfterMs;
    const marked: ConnectionId[] = [];
    for (const u of this._users.values()) {
      for (const c of u.connections.values()) {
        if (!c.idle && c.lastActivityAt <= cutoff) {
          c.idle = true;
          marked.push(c.connId);
          this._emit({ kind: 'idle', userId: u.userId, connId: c.connId });
        }
      }
    }
    return marked;
  }

  /** Replace the user's metadata bag; emits `metadata-changed`. */
  setUserMetadata(userId: UserId, metadata: Readonly<Record<string, string>>): void {
    const u = this._users.get(userId);
    if (u === undefined) return;
    u.metadata = { ...metadata };
    this._emit({ kind: 'metadata-changed', userId, metadata: u.metadata });
  }

  /**
   * Subscribe to presence events.
   * @param userIds scope the subscription to these users; omit for global.
   * @returns unsubscribe function.
   */
  subscribe(listener: PresenceListener, userIds?: Iterable<UserId>): () => void {
    const sub: Subscription = {
      userIds: userIds === undefined ? null : new Set(userIds),
      listener,
    };
    this._subscriptions.add(sub);
    return () => {
      this._subscriptions.delete(sub);
    };
  }

  // ------------------------------------------------------------------

  private _present(u: MutableUserPresence): UserPresence {
    // User-level state aggregates connection idleness: ONLINE when any
    // conn is fresh, IDLE only when *all* conns are idle.
    let allIdle = true;
    for (const c of u.connections.values()) {
      if (!c.idle) {
        allIdle = false;
        break;
      }
    }
    return {
      userId: u.userId,
      state: allIdle && u.connections.size > 0 ? PresenceState.IDLE : PresenceState.ONLINE,
      connections: u.connections,
      metadata: u.metadata,
    };
  }

  private _emit(event: PresenceEvent): void {
    const userId =
      event.kind === 'online' || event.kind === 'offline' || event.kind === 'metadata-changed' ||
      event.kind === 'connection-added' || event.kind === 'connection-removed' ||
      event.kind === 'idle' || event.kind === 'active'
        ? event.userId
        : '';
    for (const sub of this._subscriptions) {
      if (sub.userIds !== null && !sub.userIds.has(userId)) continue;
      try {
        sub.listener(event);
      } catch {
        // A throwing listener must not corrupt registry state or other subs.
      }
    }
  }
}
