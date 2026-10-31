/**
 * ReadReplicaRouter — consistency-aware routing for stream reads.
 *
 * A sharded store with replicas has two read paths, and choosing is a
 * consistency decision, not a load decision:
 *
 *   primary  — always current; costs write-node capacity.
 *   replica  — may lag by `positionLag` events / `timeLagMs` ms;
 *              costs nothing on the write path.
 *
 * The router expresses staleness *tolerance* rather than a binary
 * primary/replica flag, because real callers have nuanced needs:
 *
 *   - a balance display tolerates seconds of staleness → replica
 *   - a "did my command land?" read right after a write → needs
 *     read-your-writes: route to primary until the replica's cursor
 *     passes the position the writer saw (tracked per stream here)
 *   - an auditor's backfill tolerates anything → replica round-robin
 *
 * `ReadConsistency`:
 *   'strong'        → always primary
 *   'eventual'      → replica if registered, else primary
 *   'bounded'       → replica only if its lag <= the configured bound
 *   'read-your-writes' → replica only if it covers the positions this
 *                     router previously observed for the stream
 *
 * When several replicas qualify, `pick` is round-robin (cheap, spreads
 * load) — replica choice within tolerance doesn't change semantics.
 *
 * @module EventSourcing/Engine
 */

import { ShardedEventStore, ShardedStoredEvent } from './ShardedEventStore';
import { EventStoreReplication } from './EventStoreReplication';
import { IClock, SystemClock } from '../../observability/engine/signals';

export type ReadConsistency = 'strong' | 'eventual' | 'bounded' | 'read-your-writes';

export interface BoundedStaleness {
  /** Max acceptable position lag (events behind primary head). */
  readonly maxPositionLag?: number;
  /** Max acceptable time lag in ms since last apply. */
  readonly maxTimeLagMs?: number;
}

export type RouteTarget = 'primary' | { replica: string };

export interface RouteDecisionRecord {
  readonly streamId: string;
  readonly consistency: ReadConsistency;
  readonly target: RouteTarget;
  /** Why the decision went this way — surfaced for diagnostics. */
  readonly reason: string;
  readonly decidedAt: number;
}

/**
 * Router. Hold one per read path; it tracks the last write position the
 * caller observed per stream (fed via `noteWrite`) so read-your-writes
 * checks are per-router, per-caller-session — which matches how a real
 * client session behaves.
 */
export class ReadReplicaRouter {
  private readonly _primary: ShardedEventStore;
  private readonly _replications: EventStoreReplication[] = [];
  private readonly _clock: IClock;
  private _rr = 0;
  /** streamId -> shardPosition+1 the writer must see reflected. */
  private readonly _minCovered = new Map<string, number>();
  private readonly _decisions: RouteDecisionRecord[] = [];

  constructor(primary: ShardedEventStore, clock: IClock = new SystemClock()) {
    this._primary = primary;
    this._clock = clock;
  }

  /** Register a replica (via its replication controller). */
  addReplica(replication: EventStoreReplication): void {
    this._replications.push(replication);
  }

  /**
   * Called by the write path after an append: the router now requires any
   * replica serving this stream to cover `position + 1` on the owning
   * shard. This is the session stickiness bit — without it,
   * 'read-your-writes' couldn't distinguish "stale" from "replica".
   */
  noteWrite(streamId: string): void {
    const shardId = this._primary.shardOf(streamId);
    const head = this._primary.shardHead(shardId);
    if (head >= 0) this._minCovered.set(streamId, head + 1);
  }

  /**
   * Choose where a stream read should go.
   *
   * Falls back to primary whenever no replica qualifies — availability
   * beats freshness for reads that made it this far.
   */
  route(
    streamId: string,
    consistency: ReadConsistency,
    bound: BoundedStaleness = {}
  ): RouteDecisionRecord {
    const shardId = this._primary.shardOf(streamId);
    const now = this._clock.nowMs();
    let target: RouteTarget = 'primary';
    let reason = 'no replicas registered';

    if (consistency === 'strong') {
      reason = 'strong consistency requires primary';
    } else if (this._replications.length > 0) {
      const eligible = this._replications.filter((r) =>
        this._qualifies(r, shardId, streamId, consistency, bound)
      );
      if (eligible.length > 0) {
        const pick = eligible[this._rr++ % eligible.length];
        target = { replica: pick.replica.name };
        reason = `replica '${pick.replica.name}' within ${consistency} bounds`;
      } else {
        reason = `no replica satisfies ${consistency}; fell back to primary`;
      }
    }

    const decision: RouteDecisionRecord = { streamId, consistency, target, reason, decidedAt: now };
    this._decisions.push(decision);
    if (this._decisions.length > 1024) this._decisions.splice(0, 256); // bounded history
    return decision;
  }

  private _qualifies(
    r: EventStoreReplication,
    shardId: string,
    streamId: string,
    consistency: ReadConsistency,
    bound: BoundedStaleness
  ): boolean {
    const lag = r.lag().find((l) => l.shardId === shardId);
    // Replica doesn't know the shard → it can't serve the stream.
    if (!lag) return false;
    switch (consistency) {
      case 'eventual':
        return true;
      case 'bounded': {
        const posOk =
          bound.maxPositionLag === undefined || lag.positionLag <= bound.maxPositionLag;
        const timeOk =
          bound.maxTimeLagMs === undefined ||
          (lag.timeLagMs >= 0 && lag.timeLagMs <= bound.maxTimeLagMs);
        return posOk && timeOk;
      }
      case 'read-your-writes': {
        const need = this._minCovered.get(streamId);
        return need === undefined || lag.replicaCursor >= need;
      }
      default:
        return false;
    }
  }

  /**
   * Convenience: route + read in one call. Returns the events and the
   * decision record so callers can log/audit the choice.
   */
  read(
    streamId: string,
    consistency: ReadConsistency,
    bound: BoundedStaleness = {},
    options: { fromVersion?: number; limit?: number } = {}
  ): { events: ShardedStoredEvent[]; decision: RouteDecisionRecord } {
    const decision = this.route(streamId, consistency, bound);
    const events =
      decision.target === 'primary'
        ? this._primary.readStream(streamId, options)
        : this._replicationByName(decision.target.replica)
            ?.replica.readStream(streamId, options) ?? [];
    return { events, decision };
  }

  private _replicationByName(name: string): EventStoreReplication | undefined {
    return this._replications.find((r) => r.replica.name === name);
  }

  /** Routing history (bounded to the last ~1k decisions). */
  decisions(): readonly RouteDecisionRecord[] {
    return this._decisions;
  }

  /** Replica names currently registered. */
  replicaNames(): string[] {
    return this._replications.map((r) => r.replica.name);
  }
}
