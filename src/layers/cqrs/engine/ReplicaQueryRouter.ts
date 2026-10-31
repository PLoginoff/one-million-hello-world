/**
 * ReplicaQueryRouter — serve reads from primary or replica by staleness.
 *
 * `QueryRouter` picks which read MODEL answers a query. This router sits
 * one level lower: given a resolved model, which *copy* of it answers —
 * the primary `ReadModelStore` or a `ReplicaReadStore`?
 *
 * The decision is a staleness budget, matching how real CQRS deployments
 * tier reads:
 *
 *   'strong'          → primary (the only copy guaranteed current)
 *   'bounded-events'  → a replica whose position lag for the model's
 *                       projection is <= maxEventsBehind
 *   'bounded-ms'      → a replica whose last-apply is within maxIdleMs
 *   'any'             → any replica, round-robin (analytics, backfills)
 *
 * On top sits a **session floor**: callers that just wrote can pin the
 * positions they observed (`pinWrite`). A 'read-your-writes' route only
 * goes to replicas whose checkpoint covers those positions — the CQRS
 * equivalent of the event-store router's write tracking.
 *
 * Falls back to primary whenever no replica qualifies: for reads that
 * reached this point, availability beats freshness.
 *
 * @module CqrsLayer/Engine
 */

import { ReadModelStore } from './ReadModelStore';
import { ReadModelReplication, ReplicaReadStore } from './ReadModelReplication';
import { IClock, SystemClock } from '../../observability/engine/signals';

export type FreshnessPolicy =
  | { kind: 'strong' }
  | { kind: 'any' }
  | { kind: 'bounded-events'; maxEventsBehind: number }
  | { kind: 'bounded-ms'; maxIdleMs: number }
  | { kind: 'read-your-writes' };

export type ReplicaTarget = 'primary' | { replica: ReplicaReadStore; lag: number };

export interface ReplicaRouteDecision {
  readonly policy: FreshnessPolicy['kind'];
  readonly target: 'primary' | string;
  readonly reason: string;
  readonly decidedAt: number;
}

interface ReplicaEntry {
  readonly replication: ReadModelReplication;
  readonly name: string;
}

/**
 * Router over a primary + registered replicas. One instance per query
 * service; `pinWrite` positions are per-router (per caller session).
 */
export class ReplicaQueryRouter {
  private readonly _primary: ReadModelStore;
  private readonly _replicas: ReplicaEntry[] = [];
  private readonly _clock: IClock;
  private _rr = 0;
  /** projection -> minimum position a replica must cover for RYW reads. */
  private readonly _floor = new Map<string, number>();
  private readonly _decisions: ReplicaRouteDecision[] = [];

  constructor(primary: ReadModelStore, clock: IClock = new SystemClock()) {
    this._primary = primary;
    this._clock = clock;
  }

  /** Register a replica through its replication controller. */
  addReplica(name: string, replication: ReadModelReplication): void {
    this._replicas.push({ replication, name });
  }

  /**
   * The write path reports the highest position it committed. RYW reads
   * then refuse replicas that haven't covered it — the session sees its
   * own writes even when reads are replica-routed.
   */
  pinWrite(projection: string, position: number): void {
    const cur = this._floor.get(projection) ?? -1;
    if (position > cur) this._floor.set(projection, position);
  }

  /**
   * Pick a copy to serve `projection`'s model under `policy`.
   */
  route(projection: string, policy: FreshnessPolicy): ReplicaRouteDecision {
    const now = this._clock.nowMs();
    let target: 'primary' | string = 'primary';
    let reason = 'no replicas registered';

    if (policy.kind === 'strong') {
      reason = 'strong reads require the primary';
    } else if (this._replicas.length > 0) {
      const eligible = this._replicas.filter((r) => this._qualifies(r, projection, policy));
      if (eligible.length > 0) {
        const pick = eligible[this._rr++ % eligible.length];
        target = pick.name;
        reason = `replica '${pick.name}' satisfies ${policy.kind}`;
      } else {
        reason = `no replica satisfies ${policy.kind}; primary fallback`;
      }
    }

    const decision: ReplicaRouteDecision = { policy: policy.kind, target, reason, decidedAt: now };
    this._decisions.push(decision);
    if (this._decisions.length > 1024) this._decisions.splice(0, 256);
    return decision;
  }

  private _qualifies(r: ReplicaEntry, projection: string, policy: FreshnessPolicy): boolean {
    const st = r.replication.staleness();
    switch (policy.kind) {
      case 'any':
        return true;
      case 'bounded-events': {
        const lag = st.positionLag.get(projection);
        // Unknown projection on the replica → treat as infinite lag.
        return lag !== undefined && lag <= policy.maxEventsBehind;
      }
      case 'bounded-ms': {
        return st.idleMs >= 0 && st.idleMs <= policy.maxIdleMs;
      }
      case 'read-your-writes': {
        const floor = this._floor.get(projection);
        if (floor === undefined) return true; // no writes pinned this session
        return r.replication.replica.checkpoint(projection) >= floor;
      }
      default:
        return false;
    }
  }

  /**
   * Route + return the store to query. Callers then read it identically
   * to the primary (`get`, `findBy`, `all`) — replicas implement the
   * same surface.
   */
  storeFor(projection: string, policy: FreshnessPolicy): { store: ReadModelStore; decision: ReplicaRouteDecision } {
    const decision = this.route(projection, policy);
    if (decision.target === 'primary') {
      return { store: this._primary, decision };
    }
    const entry = this._replicas.find((r) => r.name === decision.target);
    return { store: entry ? entry.replication.replica.store : this._primary, decision };
  }

  decisions(): readonly ReplicaRouteDecision[] {
    return this._decisions;
  }

  replicaNames(): string[] {
    return this._replicas.map((r) => r.name);
  }
}
