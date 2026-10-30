/**
 * DeadlockDetector — wait-for graph cycle detection.
 *
 * Transactions wait on locks held by other transactions; a cycle in
 * the wait-for graph is a deadlock. This keeps the directed graph
 * (tx → tx it's waiting on) and runs DFS on each `wait` edge addition —
 * O(V+E) per check, fine for the small graphs a lock manager carries.
 *
 * Victim selection on cycle detection: the transaction with the fewest
 * `work done` proxy (fewest locks held — cheapest to roll back). The
 * caller aborts the victim; its wait edges are removed via `release`.
 *
 * Timeout fallback: a wait edge older than `timeoutMs` is reported as
 * a suspected deadlock victim too (locks can't be proven deadlocked —
 * the holder may be partitioned, not cyclic).
 *
 * @module UnitOfWorkLayer/Engine2
 */

import { UowClock2, SystemUowClock2 } from './types';

export interface WaitEdge {
  /** Transaction waiting. */
  readonly from: string;
  /** Transaction holding the wanted lock. */
  readonly to: string;
  readonly resource: string;
  readonly sinceMs: number;
}

export interface DeadlockReport {
  readonly victim: string;
  /** The detected cycle as tx names, e.g. ['t1','t2','t1']. */
  readonly cycle: string[];
  /** 'cycle' = proven deadlock; 'timeout' = waited too long (suspected). */
  readonly kind: 'cycle' | 'timeout';
}

export interface DeadlockDetectorOptions {
  /** Report a suspected deadlock for waits older than this (ms). 0 = off. */
  timeoutMs?: number;
  clock?: UowClock2;
}

export class DeadlockDetector {
  /** from → edges outgoing (who from waits on). */
  private readonly _edges = new Map<string, WaitEdge[]>();
  /** locksHeld per tx — victim selection prefers fewest held. */
  private readonly _locksHeld = new Map<string, number>();
  private readonly _timeoutMs: number;
  private readonly _clock: UowClock2;

  constructor(opts: DeadlockDetectorOptions = {}) {
    this._timeoutMs = opts.timeoutMs ?? 0;
    this._clock = opts.clock ?? new SystemUowClock2();
  }

  /** Register that `tx` holds a lock (for victim cost scoring). */
  lockAcquired(tx: string): void {
    this._locksHeld.set(tx, (this._locksHeld.get(tx) ?? 0) + 1);
  }

  /** Remove all waits and locks of a transaction (commit/abort). */
  release(tx: string): void {
    this._edges.delete(tx);
    this._locksHeld.delete(tx);
    for (const [from, edges] of this._edges) {
      const kept = edges.filter((e) => e.to !== tx);
      if (kept.length !== edges.length) this._edges.set(from, kept);
    }
  }

  /**
   * Register `from` waiting on `to` for `resource`. Returns a
   * DeadlockReport when this edge closes a cycle (or times out an old
   * wait), else null. The caller should abort `victim`.
   */
  wait(from: string, to: string, resource: string): DeadlockReport | null {
    const edge: WaitEdge = { from, to, resource, sinceMs: this._clock.now() };
    const list = this._edges.get(from) ?? [];
    list.push(edge);
    this._edges.set(from, list);

    const cycle = this._findCycle(from);
    if (cycle) {
      const victim = this._pickVictim(cycle);
      return { victim, cycle, kind: 'cycle' };
    }
    // Timeout fallback: any wait edge older than timeoutMs is suspicious.
    if (this._timeoutMs > 0) {
      const stale = this._oldestStale();
      if (stale) {
        return { victim: stale.from, cycle: [stale.from, stale.to], kind: 'timeout' };
      }
    }
    return null;
  }

  /** Remove a specific wait edge (lock granted or timed out). */
  grant(from: string, to: string, resource: string): void {
    const list = this._edges.get(from);
    if (!list) return;
    const kept = list.filter((e) => !(e.to === to && e.resource === resource));
    if (kept.length !== list.length) this._edges.set(from, kept);
  }

  /** DFS from `start` looking for a path back to start — O(V+E). */
  private _findCycle(start: string): string[] | null {
    const visited = new Set<string>();
    const stack = new Set<string>();
    const path: string[] = [];
    const dfs = (node: string): string[] | null => {
      visited.add(node);
      stack.add(node);
      path.push(node);
      for (const e of this._edges.get(node) ?? []) {
        if (e.to === start && path.length > 0) {
          path.push(e.to);
          return [...path];
        }
        if (!stack.has(e.to)) {
          const c = dfs(e.to);
          if (c) return c;
        }
      }
      stack.delete(node);
      path.pop();
      return null;
    };
    return dfs(start);
  }

  /** Victim = cycle member holding fewest locks (cheapest abort). */
  private _pickVictim(cycle: string[]): string {
    let victim = cycle[0];
    let best = Infinity;
    for (const tx of cycle.slice(0, -1)) {
      const held = this._locksHeld.get(tx) ?? 0;
      if (held < best) {
        best = held;
        victim = tx;
      }
    }
    return victim;
  }

  /** Oldest wait edge older than timeoutMs, or null. */
  private _oldestStale(): WaitEdge | null {
    const now = this._clock.now();
    let stale: WaitEdge | null = null;
    for (const edges of this._edges.values()) {
      for (const e of edges) {
        if (now - e.sinceMs > this._timeoutMs && (!stale || e.sinceMs < stale.sinceMs)) stale = e;
      }
    }
    return stale;
  }

  /** Current wait edges — for debugging/metrics. */
  edges(): WaitEdge[] {
    const out: WaitEdge[] = [];
    for (const e of this._edges.values()) out.push(...e);
    return out;
  }
}
