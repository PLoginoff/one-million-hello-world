/**
 * Relay Leader Election (stub)
 *
 * Guarantees at most one *active* relay per partition at a time, the
 * safety property the sharding design needs: if two workers both
 * believed they led partition 3, they could interleave claims and
 * still break nothing (claims are atomic) — but a stuck leader would
 * halt the shard forever without failover.
 *
 * The mechanism is a fencing-token lease:
 *
 *   - `acquire(partition, workerId)` grants leadership when the
 *     partition is free or the incumbent's lease has lapsed. Each grant
 *     carries a strictly larger `fencingToken`.
 *   - `renew` extends the incumbent's lease; only the holder may renew
 *     and only inside the lease window.
 *   - `check(partition, fencingToken)` is the gate a relay calls before
 *     every batch: stale holders present a stale token and lose. In a
 *     real system the token is forwarded to the claimed resource (here,
 *     the record store's claim call) which rejects fenced writers.
 *   - `stepDown` releases voluntarily.
 *
 * Deliberately single-node and synchronous — a stub that models the
 * protocol honestly so the relay path is exercised the same way it will
 * be against a real coordinator (etcd/ZK/DB advisory lock).
 *
 * @module OutboxLayer/Engine2
 */

import { LeadershipGrant, OutboxClock2, SystemOutboxClock2 } from './types';

export class LeadershipError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LeadershipError';
  }
}

interface PartitionLease {
  workerId: string;
  fencingToken: number;
  leaseUntil: number;
  grantedAt: number;
}

export class LeaderElection {
  private readonly _clock: OutboxClock2;
  private readonly _leaseMs: number;
  private readonly _leases = new Map<number, PartitionLease>();
  private _tokenCounter = 0;

  /**
   * @param leaseMs how long a grant stays valid without renewal.
   *   Must exceed the relay's poll cadence by a safe factor (the clock
   *   is injected — a real deployment needs NTP-bounded skew).
   */
  constructor(leaseMs: number, clock: OutboxClock2 = new SystemOutboxClock2()) {
    if (leaseMs <= 0) throw new Error('leaseMs must be positive');
    this._leaseMs = leaseMs;
    this._clock = clock;
  }

  /** Current holder of a partition, or null when free/expired. */
  leader(partition: number): LeadershipGrant | null {
    const l = this._leases.get(partition);
    if (!l || l.leaseUntil <= this._clock.now()) return null;
    return {
      partition,
      workerId: l.workerId,
      grantedAt: l.grantedAt,
      leaseUntil: l.leaseUntil,
      fencingToken: l.fencingToken,
    };
  }

  /**
   * Take leadership of a partition. Succeeds when it is free, when the
   * incumbent's lease has lapsed (failover), or when `workerId` already
   * holds it (idempotent re-acquire = renew). Returns the grant with
   * its fencing token; throws when another live worker holds it.
   */
  acquire(partition: number, workerId: string): LeadershipGrant {
    const now = this._clock.now();
    const cur = this._leases.get(partition);
    if (cur && cur.leaseUntil > now && cur.workerId !== workerId) {
      throw new LeadershipError(
        `partition ${partition} is held by '${cur.workerId}' until ${cur.leaseUntil}`
      );
    }
    const token = ++this._tokenCounter;
    const lease: PartitionLease = {
      workerId,
      fencingToken: token,
      leaseUntil: now + this._leaseMs,
      grantedAt: cur && cur.workerId === workerId ? cur.grantedAt : now,
    };
    this._leases.set(partition, lease);
    return {
      partition,
      workerId,
      grantedAt: lease.grantedAt,
      leaseUntil: lease.leaseUntil,
      fencingToken: token,
    };
  }

  /** Extend the incumbent's lease. Only the holder may renew. */
  renew(partition: number, workerId: string, fencingToken: number): LeadershipGrant {
    const cur = this._leases.get(partition);
    const now = this._clock.now();
    if (!cur || cur.leaseUntil <= now) {
      throw new LeadershipError(`partition ${partition} has no live lease to renew`);
    }
    if (cur.workerId !== workerId || cur.fencingToken !== fencingToken) {
      throw new LeadershipError(`stale credentials for partition ${partition}`);
    }
    cur.leaseUntil = now + this._leaseMs;
    return {
      partition,
      workerId,
      grantedAt: cur.grantedAt,
      leaseUntil: cur.leaseUntil,
      fencingToken: cur.fencingToken,
    };
  }

  /**
   * The fencing check a relay performs before each batch: true iff the
   * token is the partition's current token (and the lease is live).
   */
  check(partition: number, fencingToken: number): boolean {
    const cur = this._leases.get(partition);
    if (!cur || cur.leaseUntil <= this._clock.now()) return false;
    return cur.fencingToken === fencingToken;
  }

  /** Voluntary release; other workers may acquire immediately. */
  stepDown(partition: number, workerId: string): boolean {
    const cur = this._leases.get(partition);
    if (!cur || cur.workerId !== workerId) return false;
    this._leases.delete(partition);
    return true;
  }

  /** Live leases — diagnostics for the relay dashboard. */
  active(): LeadershipGrant[] {
    const out: LeadershipGrant[] = [];
    for (const p of this._leases.keys()) {
      const g = this.leader(p);
      if (g) out.push(g);
    }
    return out;
  }
}
