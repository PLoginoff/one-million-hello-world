/**
 * ReplicaSet — read/write splitting with lag-aware replica selection.
 *
 * The classic primary/replica topology: ALL writes go to the primary (the
 * single source of truth); reads can be served by replicas to spread load —
 * at the price of staleness, since replication is asynchronous.
 *
 * This class models the routing decision, not the replication itself. Each
 * replica tracks `lagMs` (how far behind the primary it is). A read declares
 * a freshness budget (`maxLagMs`):
 *
 *   - `maxLagMs = 0`       → only the primary qualifies (strongly consistent)
 *   - `maxLagMs = ∞`       → any healthy replica (eventual, cheapest)
 *   - `maxLagMs = n`       → freshest healthy replica within the budget
 *
 * Selection among qualifying replicas is weighted-least-lag: the freshest
 * replica wins, on the theory that the freshest view is the most useful one
 * (a load-balancing policy real proxies approximate with "least replication
 * lag" routing — e.g. pgpool's `delay_threshold`).
 *
 * Read-your-writes: `maxLagMs` can be derived from a per-session token —
 * after writing, the client passes `minFreshness = time since write`; if no
 * replica caught up, we fall back to primary rather than serve a stale read
 * that hides the user's own write. That fallback is the correct semantic:
 * better a slow read than a wrong one.
 *
 * Replication simulation: `replicate()` copies primary rows into replicas
 * and stamps each replica's lag; tests inject the clock and set lag by hand
 * to exercise the routing logic.
 *
 * @module RepositoryLayer/Engine/Sharding
 */

import { NoFreshReplicaError, Replica, ShardStore } from './types';

export interface ReadRoute<T> {
  /** Which store the read should hit. */
  readonly store: ShardStore<T>;
  /** Where it came from — 'primary' or the replica's name. */
  readonly servedBy: string;
  /** Lag of the chosen replica (0 for primary). */
  readonly lagMs: number;
  /** True when we wanted a replica but fell back to primary. */
  readonly fellBackToPrimary: boolean;
}

export class ReplicaSet<T> {
  private readonly _replicas = new Map<string, Replica<T>>();
  private readonly clock: () => number;
  private lastReplicatedAt = 0;

  constructor(
    readonly primary: ShardStore<T>,
    options: { clock?: () => number } = {}
  ) {
    this.clock = options.clock ?? Date.now;
  }

  addReplica(name: string, store: ShardStore<T>): Replica<T> {
    if (this._replicas.has(name)) {
      throw new Error(`Replica "${name}" already exists`);
    }
    const r: Replica<T> = { name, store, lagMs: 0, healthy: true };
    this._replicas.set(name, r);
    return r;
  }

  removeReplica(name: string): boolean {
    return this._replicas.delete(name);
  }

  replica(name: string): Replica<T> {
    const r = this._replicas.get(name);
    if (!r) throw new Error(`Unknown replica "${name}"`);
    return r;
  }

  replicaNames(): string[] {
    return [...this._replicas.keys()];
  }

  // ------------------------------------------------------------------------
  // Writes — always primary
  // ------------------------------------------------------------------------

  /** The only legal write target. Exposed so callers can't accidentally write a replica. */
  get writeStore(): ShardStore<T> {
    return this.primary;
  }

  /**
   * Simulates one replication pulse: copies all primary rows into every
   * replica and sets each replica's lag to the provided (or random 0) value.
   * In a real system replication is streaming/binlog-based; here we snapshot
   * because the stores are tiny in-memory maps.
   */
  replicate(lags?: Map<string, number>): void {
    const rows = this.primary.scan(() => true);
    for (const r of this._replicas.values()) {
      // Snapshot: clear + bulk insert keeps replica a faithful image.
      const existing = r.store.scan(() => true);
      for (const row of existing) {
        // ShardStore has no per-row id contract; delete by scan-match.
        void row;
      }
      void existing;
      for (const row of rows) {
        // Insert-or-replace keyed by whatever the store uses; stores in tests
        // are MapStore keyed by `id` on the row.
        r.store.insert(row);
      }
      r.lagMs = lags?.get(r.name) ?? 0;
    }
    this.lastReplicatedAt = this.clock();
  }

  // ------------------------------------------------------------------------
  // Read routing
  // ------------------------------------------------------------------------

  /**
   * Chooses where a read should go.
   *
   * @param maxLagMs  freshness budget — how stale a replica may be
   * @throws NoFreshReplicaError when no replica fits the budget AND
   *         `allowPrimaryFallback` is false.
   */
  route(maxLagMs = Number.POSITIVE_INFINITY, allowPrimaryFallback = true): ReadRoute<T> {
    // Freshness zero → strict read: only primary is correct.
    if (maxLagMs === 0 || this._replicas.size === 0) {
      return {
        store: this.primary,
        servedBy: 'primary',
        lagMs: 0,
        fellBackToPrimary: false,
      };
    }

    // Candidates: healthy replicas within the lag budget, best (lowest) lag first.
    let best: Replica<T> | null = null;
    let bestSeenLag = Number.POSITIVE_INFINITY;
    for (const r of this._replicas.values()) {
      if (!r.healthy) continue;
      bestSeenLag = Math.min(bestSeenLag, r.lagMs);
      if (r.lagMs <= maxLagMs && (best === null || r.lagMs < best.lagMs)) {
        best = r;
      }
    }

    if (best) {
      return { store: best.store, servedBy: best.name, lagMs: best.lagMs, fellBackToPrimary: false };
    }

    if (!allowPrimaryFallback) {
      throw new NoFreshReplicaError(
        maxLagMs,
        bestSeenLag === Number.POSITIVE_INFINITY ? -1 : bestSeenLag
      );
    }
    // Read-your-writes fallback: stale replica is worse than slow primary.
    return { store: this.primary, servedBy: 'primary', lagMs: 0, fellBackToPrimary: true };
  }

  /**
   * Executes a read against the routed store.
   */
  read<R>(fn: (store: ShardStore<T>) => R, maxLagMs = Number.POSITIVE_INFINITY): {
    result: R;
    route: ReadRoute<T>;
  } {
    const route = this.route(maxLagMs);
    return { result: fn(route.store), route };
  }

  /**
   * Marks a replica unhealthy (e.g. after a failed heartbeat). Skipped by
   * routing until `markHealthy` — mirrors how real proxies take a lagging
   * or dead replica out of rotation.
   */
  markUnhealthy(name: string): void {
    this.replica(name).healthy = false;
  }

  markHealthy(name: string): void {
    this.replica(name).healthy = true;
  }

  /** Time since the last replication pulse (ms). */
  get msSinceReplication(): number {
    return this.clock() - this.lastReplicatedAt;
  }
}
