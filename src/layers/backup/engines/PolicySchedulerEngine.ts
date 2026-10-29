/**
 * Backup Policy Scheduler Engine
 *
 * Owns the policy registry and decides "is a backup due now?" per
 * (policy, source, kind). Interval-based rather than cron — the question
 * a backup orchestrator actually asks is "has the interval elapsed since
 * the last run of this kind?", which is a simple timestamp comparison.
 *
 * Full-vs-incremental precedence: when both are due, the full wins —
 * running an overdue incremental moments before its scheduled full
 * wastes I/O on a chain the full is about to restart.
 *
 * @module BackupLayer/Engines
 */

import { BackupKind, BackupPolicy, IClock, SystemClock } from './types';

export interface DueWork {
  policyId: string;
  sourceId: string;
  kind: BackupKind;
  /** ms past the scheduled interval — higher = more urgent. */
  overdueByMs: number;
}

export class PolicySchedulerEngine {
  private readonly _policies: Map<string, BackupPolicy>;
  /** `${policyId}${sourceId}${kind}` → last run timestamp. */
  private readonly _lastRun: Map<string, number>;
  private readonly _clock: IClock;

  constructor(clock: IClock = new SystemClock()) {
    this._policies = new Map();
    this._lastRun = new Map();
    this._clock = clock;
  }

  registerPolicy(policy: BackupPolicy): void {
    this._policies.set(policy.id, { ...policy });
  }

  removePolicy(policyId: string): boolean {
    for (const key of [...this._lastRun.keys()]) {
      if (key.startsWith(`${policyId}`)) this._lastRun.delete(key);
    }
    return this._policies.delete(policyId);
  }

  getPolicy(policyId: string): BackupPolicy | null {
    return this._policies.get(policyId) ?? null;
  }

  /** Mark that a run of `kind` happened now for (policy, source). */
  recordRun(policyId: string, sourceId: string, kind: BackupKind): void {
    this._lastRun.set(this._key(policyId, sourceId, kind), this._clock.now());
  }

  /**
   * Is a run of `kind` due for (policy, source)? Due when never run, or
   * when `now - lastRun >= interval`. A full is never blocked by the
   * incremental timer and vice versa.
   */
  isDue(policyId: string, sourceId: string, kind: BackupKind): boolean {
    const policy = this._policies.get(policyId);
    if (!policy) throw new Error(`Unknown policy: ${policyId}`);
    const interval = kind === BackupKind.Full ? policy.fullIntervalMs : policy.incrementalIntervalMs;
    const last = this._lastRun.get(this._key(policyId, sourceId, kind));
    if (last === undefined) return true;
    return this._clock.now() - last >= interval;
  }

  /**
   * All due work across every policy/scope pair, most overdue first.
   * When both kinds are due for a source, only the full is returned.
   */
  dueWork(): DueWork[] {
    const now = this._clock.now();
    const due: DueWork[] = [];
    for (const policy of this._policies.values()) {
      for (const sourceId of policy.scope) {
        const fullDue = this._dueInfo(policy, sourceId, BackupKind.Full, now);
        if (fullDue) {
          due.push(fullDue);
          continue; // full supersedes a pending incremental
        }
        const incDue = this._dueInfo(policy, sourceId, BackupKind.Incremental, now);
        if (incDue) due.push(incDue);
      }
    }
    return due.sort((a, b) => b.overdueByMs - a.overdueByMs);
  }

  private _dueInfo(
    policy: BackupPolicy,
    sourceId: string,
    kind: BackupKind,
    now: number
  ): DueWork | null {
    const interval = kind === BackupKind.Full ? policy.fullIntervalMs : policy.incrementalIntervalMs;
    const last = this._lastRun.get(this._key(policy.id, sourceId, kind));
    const overdueBy = last === undefined ? Number.POSITIVE_INFINITY : now - last - interval;
    if (last !== undefined && overdueBy < 0) return null;
    return { policyId: policy.id, sourceId, kind, overdueByMs: overdueBy };
  }

  private _key(policyId: string, sourceId: string, kind: BackupKind): string {
    return `${policyId}${sourceId}${kind}`;
  }
}
