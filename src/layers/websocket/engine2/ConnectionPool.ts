/**
 * ConnectionPool — client-side pooled websocket connections.
 *
 * A websocket client talking to many origins benefits from pooling just
 * like an HTTP connection pool: TCP+TLS+WS handshakes are expensive, so
 * established connections are kept warm and reused.
 *
 * Pool semantics:
 *  - Idles are keyed by `origin` (scheme://authority). Each origin keeps
 *    a doubly-linked LRU list capped at `maxPerOrigin`.
 *  - `acquire` returns the most-recently-used idle whose generation is
 *    current and TTL fresh — the warmest connection maximizes the chance
 *    server-side state (subscriptions, compression context) is still hot.
 *  - Idle connections older than `idleTtlMs` are reaped lazily on access
 *    and eagerly via `sweep()`.
 *  - `discard` removes a broken connection permanently.
 *  - `invalidateAll` bumps the generation counter — checked-out stale
 *    connections are retired on release (cluster failover safety).
 *  - `maxTotal` caps pool-wide idles; on overflow the globally
 *    least-recently-used idle is evicted (O(#origins) scan).
 *
 * The pool does not perform handshakes — callers provide a factory; the
 * pool decides reuse vs. create vs. evict.
 *
 * Complexity: acquire/release/discard O(1) amortized; global eviction
 * O(#origins); sweep O(total idle).
 *
 * @module WebsocketLayer/Engine2
 */

import { WsClock2, SystemWsClock2 } from './types';

/** A pooled connection handle — what the factory produces per origin. */
export interface PooledConnection {
  /** Unique connection id. */
  readonly id: string;
  /** Origin key this connection was opened for (scheme://authority). */
  readonly origin: string;
  /** Pool generation captured at open time — stale handles are retired. */
  readonly generation: number;
}

export interface ConnectionPoolOptions {
  /** Max idle connections per origin. Default 8. */
  maxPerOrigin?: number;
  /** Max idle connections across all origins. Default 256. */
  maxTotal?: number;
  /** Idle TTL in ms — older idles are reaped. Default 60_000. */
  idleTtlMs?: number;
  /** Max acquire-cycles per connection before retirement. 0 = unlimited. */
  maxUses?: number;
  clock?: WsClock2;
}

interface IdleNode {
  connId: string;
  lastUsedMs: number;
  uses: number;
  prev: IdleNode | null;
  next: IdleNode | null;
}

/** Per-origin doubly-linked idle list. Head = most recently used. */
class OriginList {
  head: IdleNode | null = null;
  tail: IdleNode | null = null;
  size = 0;
  readonly index = new Map<string, IdleNode>();

  pushHead(connId: string, lastUsedMs: number, uses: number): IdleNode {
    const node: IdleNode = { connId, lastUsedMs, uses, prev: null, next: this.head };
    if (this.head) this.head.prev = node;
    this.head = node;
    if (!this.tail) this.tail = node;
    this.index.set(connId, node);
    this.size++;
    return node;
  }

  remove(node: IdleNode): void {
    if (node.prev) node.prev.next = node.next;
    else this.head = node.next;
    if (node.next) node.next.prev = node.prev;
    else this.tail = node.prev;
    this.index.delete(node.connId);
    node.prev = node.next = null;
    this.size--;
  }

  removeHead(): IdleNode | null {
    const n = this.head;
    if (n) this.remove(n);
    return n;
  }

  removeTail(): IdleNode | null {
    const n = this.tail;
    if (n) this.remove(n);
    return n;
  }
}

export type AcquireResult<T extends PooledConnection> =
  | { readonly kind: 'reused'; readonly conn: T }
  | { readonly kind: 'create' };

export class ConnectionPool<T extends PooledConnection = PooledConnection> {
  private readonly _maxPerOrigin: number;
  private readonly _maxTotal: number;
  private readonly _idleTtlMs: number;
  private readonly _maxUses: number;
  private readonly _clock: WsClock2;
  private readonly _origins = new Map<string, OriginList>();
  private readonly _checkedOut = new Map<string, T>();
  private readonly _idleConns = new Map<string, T>();
  private readonly _uses = new Map<string, number>();
  private _generation = 0;
  private _reaped = 0;

  constructor(opts: ConnectionPoolOptions = {}) {
    this._maxPerOrigin = Math.max(1, opts.maxPerOrigin ?? 8);
    this._maxTotal = Math.max(1, opts.maxTotal ?? 256);
    this._idleTtlMs = Math.max(1, opts.idleTtlMs ?? 60_000);
    this._maxUses = Math.max(0, opts.maxUses ?? 0);
    this._clock = opts.clock ?? new SystemWsClock2();
  }

  /** Current pool generation — embed in new connections. */
  get generation(): number {
    return this._generation;
  }

  /**
   * Try to reuse an idle connection for `origin`; 'create' signals the
   * caller to open a fresh one. Stale/expired idles are reaped first.
   */
  acquire(origin: string): AcquireResult<T> {
    const list = this._origins.get(origin);
    if (!list) return { kind: 'create' };
    this._reapExpired(list);
    const node = list.removeHead(); // MRU — warmest connection
    if (!node) {
      if (list.size === 0) this._origins.delete(origin);
      return { kind: 'create' };
    }
    const conn = this._idleConns.get(node.connId);
    this._idleConns.delete(node.connId);
    if (!conn || conn.generation !== this._generation) {
      this._uses.delete(node.connId);
      if (list.size === 0) this._origins.delete(origin);
      return { kind: 'create' };
    }
    this._uses.set(conn.id, node.uses + 1);
    if (list.size === 0) this._origins.delete(origin);
    this._checkedOut.set(conn.id, conn);
    return { kind: 'reused', conn };
  }

  /**
   * Return a connection to the pool. Stale-generation or max-uses-exceeded
   * connections are retired instead of pooled.
   */
  release(conn: T): void {
    this._checkedOut.delete(conn.id);
    if (conn.generation !== this._generation) {
      this._uses.delete(conn.id);
      return; // stale — drop
    }
    const uses = this._uses.get(conn.id) ?? 0;
    if (this._maxUses > 0 && uses >= this._maxUses) {
      this._uses.delete(conn.id);
      return; // retired
    }
    const list = this._listFor(conn.origin);
    while (list.size >= this._maxPerOrigin) {
      const ev = list.removeTail();
      if (ev) {
        this._idleConns.delete(ev.connId);
        this._uses.delete(ev.connId);
      }
    }
    while (this.totalIdle >= this._maxTotal) {
      const ev = this._evictGlobalOldest();
      if (!ev) break;
      this._idleConns.delete(ev.connId);
      this._uses.delete(ev.connId);
    }
    list.pushHead(conn.id, this._clock.now(), uses);
    this._idleConns.set(conn.id, conn);
  }

  /** Permanently drop a connection (protocol error, reset, etc.). */
  discard(connId: string): boolean {
    this._checkedOut.delete(connId);
    this._uses.delete(connId);
    this._idleConns.delete(connId);
    for (const [origin, list] of this._origins) {
      const node = list.index.get(connId);
      if (node) {
        list.remove(node);
        if (list.size === 0) this._origins.delete(origin);
        return true;
      }
    }
    return false;
  }

  /**
   * Bump the generation — all current idles and future releases of old
   * handles are retired. Used after cluster failover.
   */
  invalidateAll(): void {
    this._generation++;
    this._origins.clear();
    this._idleConns.clear();
    this._uses.clear();
  }

  /** Number of idle connections across the pool. */
  get totalIdle(): number {
    let n = 0;
    for (const list of this._origins.values()) n += list.size;
    return n;
  }

  /** Idle count for one origin. */
  idle(origin: string): number {
    return this._origins.get(origin)?.size ?? 0;
  }

  /** Is this connection currently checked out? */
  isCheckedOut(connId: string): boolean {
    return this._checkedOut.has(connId);
  }

  /** Count of connections reaped by TTL sweeps. */
  get reapedCount(): number {
    return this._reaped;
  }

  /**
   * Eager sweep — expire all TTL-exceeded idles. Returns reaped ids.
   * Lists are ordered MRU→LRU so each origin scan stops at the first
   * fresh entry: O(#expired + #origins).
   */
  sweep(): string[] {
    const out: string[] = [];
    const now = this._clock.now();
    for (const [origin, list] of this._origins) {
      while (list.tail && now - list.tail.lastUsedMs > this._idleTtlMs) {
        const node = list.removeTail();
        if (node) {
          out.push(node.connId);
          this._idleConns.delete(node.connId);
          this._uses.delete(node.connId);
          this._reaped++;
        }
      }
      if (list.size === 0) this._origins.delete(origin);
    }
    return out;
  }

  private _listFor(origin: string): OriginList {
    let l = this._origins.get(origin);
    if (!l) {
      l = new OriginList();
      this._origins.set(origin, l);
    }
    return l;
  }

  private _reapExpired(list: OriginList): void {
    const now = this._clock.now();
    while (list.tail && now - list.tail.lastUsedMs > this._idleTtlMs) {
      const e = list.removeTail();
      if (e) {
        this._idleConns.delete(e.connId);
        this._uses.delete(e.connId);
        this._reaped++;
      }
    }
  }

  /** Evict the globally least-recently-used idle across all origins. */
  private _evictGlobalOldest(): IdleNode | null {
    let oldest: { origin: string; node: IdleNode } | null = null;
    for (const [origin, list] of this._origins) {
      if (list.tail && (!oldest || list.tail.lastUsedMs < oldest.node.lastUsedMs)) {
        oldest = { origin, node: list.tail };
      }
    }
    if (!oldest) return null;
    const l = this._origins.get(oldest.origin);
    if (!l) return null;
    l.remove(oldest.node);
    if (l.size === 0) this._origins.delete(oldest.origin);
    return oldest.node;
  }
}
