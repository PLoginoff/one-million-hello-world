/**
 * RequestQueue — bounded per-backend request queueing.
 *
 * When a backend is momentarily saturated (all connection slots busy) the
 * load balancer can park the request on a per-backend FIFO instead of
 * failing over immediately — smoothing bursts and preserving session
 * affinity. Queues are bounded in depth and per-request wait: an enqueue
 * that would exceed `maxDepth` returns `dropped: full`, and a parked
 * request that isn't dequeued within `maxWaitMs` is reported `expired`.
 *
 * Design notes:
 *  - FIFO via an array + head index — O(1) enqueue/dequeue without the
 *    O(n) cost of Array.shift(). Compaction happens when the head index
 *    passes half the array length.
 *  - Expired entries are pruned lazily on dequeue/peek and eagerly via
 *    `sweepExpired()`.
 *
 * @module LoadBalancerLayer/Engine2
 */

import { LbClock2, SystemLbClock2 } from './types';

export interface QueuedRequest<T = unknown> {
  readonly requestId: string;
  readonly payload: T;
  readonly enqueuedAtMs: number;
  /** Absolute deadline — after this the request is stale. */
  readonly deadlineMs: number;
}

export type EnqueueResult =
  | { readonly ok: true; readonly depth: number }
  | { readonly ok: false; readonly reason: 'full' | 'duplicate' };

export type DequeueResult<T = unknown> =
  | { readonly kind: 'request'; readonly request: QueuedRequest<T> }
  | { readonly kind: 'empty' };

export interface RequestQueueOptions {
  /** Max queued requests per backend. Default 256. */
  maxDepth?: number;
  /** Max ms a request may sit in queue before expiring. Default 5_000. */
  maxWaitMs?: number;
  clock?: LbClock2;
}

interface BackendQueue<T> {
  items: QueuedRequest<T>[];
  head: number;
}

export class RequestQueue<T = unknown> {
  private readonly _maxDepth: number;
  private readonly _maxWaitMs: number;
  private readonly _clock: LbClock2;
  private readonly _queues = new Map<string, BackendQueue<T>>();
  private _totalEnqueued = 0;
  private _totalDequeued = 0;
  private _totalDropped = 0;
  private _totalExpired = 0;

  constructor(opts: RequestQueueOptions = {}) {
    this._maxDepth = Math.max(1, opts.maxDepth ?? 256);
    this._maxWaitMs = Math.max(1, opts.maxWaitMs ?? 5_000);
    this._clock = opts.clock ?? new SystemLbClock2();
  }

  /** Park a request for a backend. O(1). */
  enqueue(backendId: string, requestId: string, payload: T): EnqueueResult {
    const q = this._queueFor(backendId);
    if (q.items.some((it) => it.requestId === requestId && !this._expired(it))) {
      return { ok: false, reason: 'duplicate' };
    }
    if (this._live(q) >= this._maxDepth) {
      this._totalDropped++;
      return { ok: false, reason: 'full' };
    }
    const now = this._clock.now();
    q.items.push({
      requestId,
      payload,
      enqueuedAtMs: now,
      deadlineMs: now + this._maxWaitMs,
    });
    this._totalEnqueued++;
    return { ok: true, depth: this._live(q) };
  }

  /**
   * Pop the oldest non-expired request for a backend. Expired head
   * entries are skipped (and counted). O(k) where k = expired head items.
   */
  dequeue(backendId: string): DequeueResult<T> {
    const q = this._queues.get(backendId);
    if (!q) return { kind: 'empty' };
    while (q.head < q.items.length) {
      const item = q.items[q.head];
      q.head++;
      if (this._expired(item)) {
        this._totalExpired++;
        continue;
      }
      this._compact(q);
      this._totalDequeued++;
      return { kind: 'request', request: item };
    }
    this._compact(q);
    return { kind: 'empty' };
  }

  /** Peek at the oldest live request without removing it. */
  peek(backendId: string): QueuedRequest<T> | null {
    const q = this._queues.get(backendId);
    if (!q) return null;
    while (q.head < q.items.length && this._expired(q.items[q.head])) {
      q.head++;
    }
    this._compact(q);
    return q.head < q.items.length ? q.items[q.head] : null;
  }

  /** Number of live (non-expired) requests queued for a backend. */
  depth(backendId: string): number {
    const q = this._queues.get(backendId);
    if (!q) return 0;
    let n = 0;
    for (let i = q.head; i < q.items.length; i++) {
      if (!this._expired(q.items[i])) n++;
    }
    return n;
  }

  /** Total live requests across all backends. */
  get totalDepth(): number {
    let n = 0;
    for (const [id] of this._queues) n += this.depth(id);
    return n;
  }

  /** Remove every expired request. Returns how many were dropped. */
  sweepExpired(): number {
    let removed = 0;
    for (const [id] of this._queues) {
      const q = this._queues.get(id);
      if (!q) continue;
      const keep = q.items.slice(q.head).filter((it) => {
        if (this._expired(it)) {
          removed++;
          return false;
        }
        return true;
      });
      q.items = keep;
      q.head = 0;
      if (keep.length === 0) this._queues.delete(id);
    }
    this._totalExpired += removed;
    return removed;
  }

  /** Drop all queued requests for a backend (e.g. on ejection). */
  clear(backendId: string): number {
    const q = this._queues.get(backendId);
    if (!q) return 0;
    const n = q.items.length - q.head;
    this._queues.delete(backendId);
    return n;
  }

  get stats(): { enqueued: number; dequeued: number; dropped: number; expired: number } {
    return {
      enqueued: this._totalEnqueued,
      dequeued: this._totalDequeued,
      dropped: this._totalDropped,
      expired: this._totalExpired,
    };
  }

  /* ---------------------------------------------------------------- */

  private _queueFor(backendId: string): BackendQueue<T> {
    let q = this._queues.get(backendId);
    if (!q) {
      q = { items: [], head: 0 };
      this._queues.set(backendId, q);
    }
    return q;
  }

  private _live(q: BackendQueue<T>): number {
    let n = 0;
    for (let i = q.head; i < q.items.length; i++) {
      if (!this._expired(q.items[i])) n++;
    }
    return n;
  }

  private _expired(it: QueuedRequest<T>): boolean {
    return this._clock.now() >= it.deadlineMs;
  }

  /**
   * Amortized compaction: once more than half the backing array is dead
   * head space, slice it away. Keeps dequeue O(1) amortized.
   */
  private _compact(q: BackendQueue<T>): void {
    if (q.head > 0 && q.head * 2 >= q.items.length) {
      q.items = q.items.slice(q.head);
      q.head = 0;
    }
    if (q.items.length === 0) q.head = 0;
  }
}
