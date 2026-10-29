/**
 * Disaster Recovery — RTO/RPO Tracker
 *
 * Continuously measures recovery objectives:
 *
 * - **RPO** is measured against the newest available recovery point: the age
 *   `now − max(backup.createdAt, replica.appliedPosition-timestamp)` must be
 *   ≤ `rpoMs`. A replica that has fallen behind inflates RPO risk even while
 *   backups exist.
 * - **RTO** is measured on actual failover/drill events: the wall-clock time
 *   from `disaster declared` to `service restored` is recorded and compared.
 *
 * Measurements are kept in a bounded history per service (ring buffer, O(1)
 * append, O(1) latest) for trend reporting without unbounded growth.
 *
 * @module DisasterRecovery/DR
 */

import {
  DrClock,
  ObjectiveMeasurement,
  ObjectiveStatus,
  RecoveryObjective,
} from './DrTypes';

interface DisasterEvent {
  readonly declaredAt: number;
  restoredAt?: number;
}

export class RtoRpoTracker {
  private readonly _objectives = new Map<string, RecoveryObjective>();
  private readonly _history = new Map<string, ObjectiveMeasurement[]>();
  private readonly _disasters = new Map<string, DisasterEvent>();
  private readonly _clock: DrClock;
  private readonly _maxHistory: number;

  constructor(clock: DrClock = Date.now, maxHistory = 1000) {
    this._clock = clock;
    this._maxHistory = maxHistory;
  }

  registerObjective(objective: RecoveryObjective): void {
    if (objective.rtoMs <= 0 || objective.rpoMs <= 0) {
      throw new RangeError('RTO and RPO must be positive');
    }
    this._objectives.set(objective.serviceId, objective);
  }

  unregister(serviceId: string): boolean {
    this._history.delete(serviceId);
    this._disasters.delete(serviceId);
    return this._objectives.delete(serviceId);
  }

  objectiveFor(serviceId: string): RecoveryObjective | undefined {
    return this._objectives.get(serviceId);
  }

  /**
   * Measure current RPO compliance for a service given the age (ms) of its
   * newest recovery point — i.e. `now − timestampOfNewestRecoverableWrite`.
   * The caller supplies this because the tracker doesn't own the replica/backup
   * clocks.
   */
  measureRpo(serviceId: string, recoveryPointAgeMs: number): ObjectiveMeasurement {
    const obj = this._require(serviceId);
    const warn = obj.warningFraction ?? 0.8;
    const status =
      recoveryPointAgeMs > obj.rpoMs
        ? ObjectiveStatus.BREACHED
        : recoveryPointAgeMs > obj.rpoMs * warn
          ? ObjectiveStatus.WARNING
          : ObjectiveStatus.MET;
    const m: ObjectiveMeasurement = {
      serviceId,
      objective: 'RPO',
      measuredMs: recoveryPointAgeMs,
      targetMs: obj.rpoMs,
      status,
      measuredAt: this._clock(),
    };
    this._record(serviceId, m);
    return m;
  }

  /** Declare a disaster for a service — starts the RTO clock. */
  declareDisaster(serviceId: string): void {
    this._require(serviceId);
    this._disasters.set(serviceId, { declaredAt: this._clock() });
  }

  /**
   * Mark service restored — stops the RTO clock and produces the RTO
   * measurement. Returns null when no disaster was open (idempotent).
   */
  markRestored(serviceId: string): ObjectiveMeasurement | null {
    const obj = this._require(serviceId);
    const event = this._disasters.get(serviceId);
    if (!event || event.restoredAt !== undefined) return null;
    event.restoredAt = this._clock();
    const elapsed = event.restoredAt - event.declaredAt;
    const warn = obj.warningFraction ?? 0.8;
    const status =
      elapsed > obj.rtoMs
        ? ObjectiveStatus.BREACHED
        : elapsed > obj.rtoMs * warn
          ? ObjectiveStatus.WARNING
          : ObjectiveStatus.MET;
    const m: ObjectiveMeasurement = {
      serviceId,
      objective: 'RTO',
      measuredMs: elapsed,
      targetMs: obj.rtoMs,
      status,
      measuredAt: this._clock(),
    };
    this._record(serviceId, m);
    this._disasters.delete(serviceId);
    return m;
  }

  /** Manually record an RTO measurement (e.g. produced by a drill). */
  recordRtoMeasurement(serviceId: string, elapsedMs: number): ObjectiveMeasurement {
    const obj = this._require(serviceId);
    const warn = obj.warningFraction ?? 0.8;
    const status =
      elapsedMs > obj.rtoMs
        ? ObjectiveStatus.BREACHED
        : elapsedMs > obj.rtoMs * warn
          ? ObjectiveStatus.WARNING
          : ObjectiveStatus.MET;
    const m: ObjectiveMeasurement = {
      serviceId,
      objective: 'RTO',
      measuredMs: elapsedMs,
      targetMs: obj.rtoMs,
      status,
      measuredAt: this._clock(),
    };
    this._record(serviceId, m);
    return m;
  }

  /** Bounded measurement history for a service. */
  history(serviceId: string): ReadonlyArray<ObjectiveMeasurement> {
    return this._history.get(serviceId) ?? [];
  }

  /** Latest measurement of each objective kind for a service. */
  latest(serviceId: string): { rto?: ObjectiveMeasurement; rpo?: ObjectiveMeasurement } {
    const hist = this._history.get(serviceId) ?? [];
    let rto: ObjectiveMeasurement | undefined;
    let rpo: ObjectiveMeasurement | undefined;
    for (const m of hist) {
      if (m.objective === 'RTO') rto = m;
      else rpo = m;
    }
    return { rto, rpo };
  }

  /** Services currently in WARNING or BREACHED on either objective. */
  atRisk(): ReadonlyArray<{ serviceId: string; measurement: ObjectiveMeasurement }> {
    const out: Array<{ serviceId: string; measurement: ObjectiveMeasurement }> = [];
    for (const serviceId of this._objectives.keys()) {
      const { rto, rpo } = this.latest(serviceId);
      for (const m of [rto, rpo]) {
        if (m && m.status !== ObjectiveStatus.MET) {
          out.push({ serviceId, measurement: m });
        }
      }
    }
    return out;
  }

  // ------------------------------------------------------------------ private

  private _require(serviceId: string): RecoveryObjective {
    const obj = this._objectives.get(serviceId);
    if (!obj) throw new Error(`no recovery objective registered for '${serviceId}'`);
    return obj;
  }

  private _record(serviceId: string, m: ObjectiveMeasurement): void {
    let hist = this._history.get(serviceId);
    if (!hist) {
      hist = [];
      this._history.set(serviceId, hist);
    }
    hist.push(m);
    if (hist.length > this._maxHistory) {
      hist.splice(0, hist.length - this._maxHistory);
    }
  }
}
