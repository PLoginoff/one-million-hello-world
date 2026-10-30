/**
 * ConnectionDrainer — graceful shutdown of a websocket node.
 *
 * When a node leaves the cluster (SIGTERM, scale-down, deploy), the load
 * balancer stops sending *new* connections but existing ones may live for
 * hours. Draining nudges them off in waves:
 *
 *  1. `beginDrain()` flips the node to draining; `accept()` now refuses
 *     new connections.
 *  2. Each `tick()` picks the next cohort of connections (oldest first)
 *     and sends a 1001 "going away" close. Cohort size grows
 *     exponentially (`initialCohort × growth^wave`, capped by
 *     `maxCohort`) so quiet nodes drain instantly while busy nodes bleed
 *     off at a bounded rate.
 *  3. Connections that acknowledge the close before `ackDeadlineMs`
 *     finish gracefully; the rest are hard-dropped when their deadline
 *     passes — checked on every tick.
 *  4. `drainComplete()` resolves when zero connections remain; the
 *     overall `maxDrainMs` deadline guarantees termination even if
 *     clients ignore close frames.
 *
 * Connection ordering: a min-ordered queue keyed by accept time (FIFO by
 * insertion order is fine — Map preserves it and accepts are monotonic).
 * Deadlines live in a min-heap keyed by expiry for O(log n) expiry pops.
 *
 * @module WebsocketLayer/Engine2
 */

import { WsClock2, SystemWsClock2 } from './types';

export interface DrainerOptions {
  /** Connections closed on the first drain wave. Default 16. */
  initialCohort?: number;
  /** Cohort growth factor per wave. Default 2 (exponential). */
  growth?: number;
  /** Cap on cohort size per wave. Default 512. */
  maxCohort?: number;
  /** Ms a connection gets to ack a close before hard drop. Default 5000. */
  ackDeadlineMs?: number;
  /** Overall drain budget — after this, everything is hard-dropped.
   *  Default 60_000. */
  maxDrainMs?: number;
  clock?: WsClock2;
}

interface Tracked {
  connId: string;
  acceptedAtMs: number;
  /** Set once a close frame has been sent. */
  closeSentAtMs: number | null;
  closeCode: number | null;
  done: boolean;
  graceful: boolean;
}

interface HeapItem {
  deadline: number;
  connId: string;
}

/** Simple binary min-heap keyed on deadline. */
class DeadlineHeap {
  private a: HeapItem[] = [];
  get size(): number {
    return this.a.length;
  }
  peek(): HeapItem | undefined {
    return this.a[0];
  }
  push(item: HeapItem): void {
    const a = this.a;
    a.push(item);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (a[p].deadline <= a[i].deadline) break;
      [a[p], a[i]] = [a[i], a[p]];
      i = p;
    }
  }
  pop(): HeapItem | undefined {
    const a = this.a;
    if (a.length === 0) return undefined;
    const top = a[0];
    const last = a.pop();
    if (a.length > 0 && last) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < a.length && a[l].deadline < a[m].deadline) m = l;
        if (r < a.length && a[r].deadline < a[m].deadline) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]];
        i = m;
      }
    }
    return top;
  }
}

export type DrainEvent =
  | { readonly kind: 'close-sent'; readonly connId: string; readonly code: number }
  | { readonly kind: 'closed-graceful'; readonly connId: string }
  | { readonly kind: 'dropped'; readonly connId: string }
  | { readonly kind: 'drain-complete' };

export class ConnectionDrainer {
  private readonly _opts: Required<Omit<DrainerOptions, 'clock'>>;
  private readonly _clock: WsClock2;
  private readonly _conns = new Map<string, Tracked>();
  private readonly _deadlines = new DeadlineHeap();
  private _draining = false;
  private _drainStartMs = 0;
  private _wave = 0;

  constructor(opts: DrainerOptions = {}) {
    this._clock = opts.clock ?? new SystemWsClock2();
    this._opts = {
      initialCohort: Math.max(1, opts.initialCohort ?? 16),
      growth: Math.max(1, opts.growth ?? 2),
      maxCohort: Math.max(1, opts.maxCohort ?? 512),
      ackDeadlineMs: Math.max(1, opts.ackDeadlineMs ?? 5000),
      maxDrainMs: Math.max(1, opts.maxDrainMs ?? 60_000),
    };
  }

  /** Register an open connection. Refused while draining. */
  accept(connId: string, acceptedAtMs?: number): boolean {
    if (this._draining) return false;
    if (this._conns.has(connId)) return false;
    this._conns.set(connId, {
      connId,
      acceptedAtMs: acceptedAtMs ?? this._clock.now(),
      closeSentAtMs: null,
      closeCode: null,
      done: false,
      graceful: false,
    });
    return true;
  }

  /** Remote reported its close ack. Returns false if unknown/already done. */
  reportClosed(connId: string): boolean {
    const t = this._conns.get(connId);
    if (!t || t.done) return false;
    t.done = true;
    t.graceful = true;
    this._conns.delete(connId);
    return true;
  }

  /** Enter draining state — new accepts are refused. */
  beginDrain(): void {
    if (!this._draining) {
      this._draining = true;
      this._drainStartMs = this._clock.now();
      this._wave = 0;
    }
  }

  get draining(): boolean {
    return this._draining;
  }

  /** Live (not yet finished) connections. */
  get remaining(): number {
    return this._conns.size;
  }

  /**
   * Advance the drain. Sends close frames to the next cohort and
   * hard-drops connections whose ack deadline elapsed — or all of them
   * if the overall budget ran out.
   */
  tick(): DrainEvent[] {
    if (!this._draining || this._conns.size === 0) {
      return this._draining && this._conns.size === 0
        ? [{ kind: 'drain-complete' }]
        : [];
    }
    const events: DrainEvent[] = [];
    const now = this._clock.now();

    // Overall budget blown → drop everyone.
    if (now - this._drainStartMs >= this._opts.maxDrainMs) {
      for (const t of this._conns.values()) {
        events.push({ kind: 'dropped', connId: t.connId });
      }
      this._conns.clear();
      events.push({ kind: 'drain-complete' });
      return events;
    }

    // Pop elapsed ack deadlines → hard drop non-responsive conns.
    while (this._deadlines.size > 0) {
      const top = this._deadlines.peek();
      if (!top || top.deadline > now) break;
      this._deadlines.pop();
      const t = this._conns.get(top.connId);
      if (t && !t.done) {
        t.done = true;
        this._conns.delete(t.connId);
        events.push({ kind: 'dropped', connId: t.connId });
      }
    }

    // Next wave: oldest first (Map iteration = insertion order).
    this._wave++;
    const cohort = Math.min(
      this._opts.maxCohort,
      Math.floor(this._opts.initialCohort * this._opts.growth ** (this._wave - 1))
    );
    let sent = 0;
    for (const t of this._conns.values()) {
      if (sent >= cohort) break;
      if (t.closeSentAtMs !== null) continue;
      t.closeSentAtMs = now;
      t.closeCode = 1001;
      this._deadlines.push({ deadline: now + this._opts.ackDeadlineMs, connId: t.connId });
      events.push({ kind: 'close-sent', connId: t.connId, code: 1001 });
      sent++;
    }

    if (this._conns.size === 0) events.push({ kind: 'drain-complete' });
    return events;
  }

  /** Has every connection finished (graceful or dropped)? */
  drainComplete(): boolean {
    return this._draining && this._conns.size === 0;
  }

  /**
   * Connections currently awaiting close ack, ordered by deadline.
   */
  pendingAcks(): string[] {
    const out: string[] = [];
    for (const t of this._conns.values()) {
      if (t.closeSentAtMs !== null && !t.done) out.push(t.connId);
    }
    return out;
  }
}
