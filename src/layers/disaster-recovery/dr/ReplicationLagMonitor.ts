/**
 * Disaster Recovery — Replication Lag Monitor
 *
 * Tracks per-replica position lag and derives a *time* lag estimate using an
 * EWMA of each replica's observed apply rate (positions/ms). Time lag is what
 * actually maps to RPO: a replica 1M positions behind but applying 10K/ms is
 * ~100ms stale; the same lag at 10/ms is ~27 hours.
 *
 * Algorithm
 * ---------
 * On each `observe(primary, replica)` call:
 *   1. positionLag = primary.position − replica.position       (exact)
 *   2. applyRate  = Δapplied / Δt since last observation, folded into an EWMA
 *      (α = 0.3 — responsive but noise-tolerant)
 *   3. timeLagMs ≈ positionLag / applyRateEWMA                  (estimate)
 *   4. withinRpo = timeLagMs ≤ rpoMs for the replica's service
 *
 * O(1) per observation, O(R) memory for R replicas.
 *
 * @module DisasterRecovery/DR
 */

import { DrClock, DrNode, LagReading } from './DrTypes';

interface ReplicaState {
  readonly replicaId: string;
  readonly rpoMs: number;
  lastApplied: bigint;
  lastObservedAt: number;
  /** EWMA of apply rate, positions per ms. */
  rateEwma: number;
  /** EWMA of the lag itself for trend reporting. */
  lagEwmaMs: number;
  hasRate: boolean;
  lastReading?: LagReading;
}

export class ReplicationLagMonitor {
  private readonly _clock: DrClock;
  private readonly _states = new Map<string, ReplicaState>();
  private readonly _alpha: number;

  constructor(clock: DrClock = Date.now, alpha = 0.3) {
    if (!(alpha > 0 && alpha <= 1)) throw new RangeError('alpha must be in (0,1]');
    this._clock = clock;
    this._alpha = alpha;
  }

  /** Register a replica with its service's RPO budget. */
  registerReplica(replicaId: string, initial: DrNode, rpoMs: number): void {
    this._states.set(replicaId, {
      replicaId,
      rpoMs,
      lastApplied: initial.appliedPosition,
      lastObservedAt: this._clock(),
      rateEwma: 0,
      lagEwmaMs: 0,
      hasRate: false,
    });
  }

  unregister(replicaId: string): boolean {
    return this._states.delete(replicaId);
  }

  /**
   * Record one observation of primary + replica. Returns the lag reading.
   * Throws when the replica is unregistered — fail loud, a silently
   * unmonitored replica is an RPO blind spot.
   */
  observe(primary: DrNode, replica: DrNode): LagReading {
    const state = this._states.get(replica.nodeId);
    if (!state) {
      throw new Error(`replica '${replica.nodeId}' not registered`);
    }
    const now = this._clock();
    const dt = now - state.lastObservedAt;
    const dApplied = replica.appliedPosition - state.lastApplied;

    // Fold instantaneous rate into EWMA (only when time advanced & progressed).
    if (dt > 0 && dApplied > 0n) {
      const instantRate = Number(dApplied) / dt;
      state.rateEwma = state.hasRate
        ? this._alpha * instantRate + (1 - this._alpha) * state.rateEwma
        : instantRate;
      state.hasRate = true;
    }
    state.lastApplied = replica.appliedPosition;
    state.lastObservedAt = now;

    const positionLag = primary.position - replica.appliedPosition;
    let timeLagMs: number;
    if (positionLag <= 0n) {
      timeLagMs = 0;
    } else if (state.hasRate && state.rateEwma > 0) {
      timeLagMs = Number(positionLag) / state.rateEwma;
    } else {
      // No rate sample yet — fall back to the replica's own write timestamp
      // distance, i.e. how stale its newest applied write is on the wall clock.
      timeLagMs = Math.max(0, now - replica.lastWriteAt);
    }
    state.lagEwmaMs = this._alpha * timeLagMs + (1 - this._alpha) * state.lagEwmaMs;

    const reading: LagReading = {
      replicaId: replica.nodeId,
      positionLag,
      timeLagMs,
      measuredAt: now,
      withinRpo: timeLagMs <= state.rpoMs,
    };
    state.lastReading = reading;
    return reading;
  }

  /** Latest reading per registered replica. */
  latest(): ReadonlyArray<LagReading> {
    const out: LagReading[] = [];
    for (const s of this._states.values()) {
      if (s.lastReading) out.push(s.lastReading);
    }
    return out;
  }

  /** Replicas currently outside their RPO budget. */
  breaching(): ReadonlyArray<LagReading> {
    return this.latest().filter((r) => !r.withinRpo);
  }

  /** Smoothed (EWMA) lag for a replica — better trend signal than instantaneous. */
  smoothedLagMs(replicaId: string): number | undefined {
    const s = this._states.get(replicaId);
    return s?.hasRate || s?.lastReading ? s.lagEwmaMs : undefined;
  }

  /** Current estimated apply rate for a replica (positions/ms). */
  estimatedRate(replicaId: string): number | undefined {
    const s = this._states.get(replicaId);
    return s?.hasRate ? s.rateEwma : undefined;
  }
}
