/**
 * Blue-Green Deploy — Version Registry
 *
 * Tracks which artifact versions ran where, when, and with what outcome —
 * the source of truth for "what's live?", "what was the last good version?"
 * and "how long has this version been soaking?". Supports the rollback
 * decision "revert to last-good" without relying on deployment history in
 * external systems.
 *
 * Versions are ordered by deployment time. `markBad()` poisons a version so
 * it can never be selected as a rollback target — rollback must skip known-
 * bad releases, not just "the previous one".
 *
 * @module BlueGreenDeploy/Deploy
 */

import { BgClock, EnvColor } from './BlueGreenTypes';

export type VersionOutcome = 'deployed' | 'completed' | 'rolled-back' | 'failed' | 'bad';

export interface VersionRecord {
  readonly version: string;
  readonly env: EnvColor;
  readonly deployedAt: number;
  /** Monotonic registration order — breaks deployedAt ties deterministically. */
  readonly seq: number;
  finishedAt?: number;
  outcome: VersionOutcome;
}

export class VersionRegistry {
  private readonly _clock: BgClock;
  private readonly _records: VersionRecord[] = [];
  private readonly _byVersion = new Map<string, VersionRecord>();
  private _seq = 0;

  constructor(clock: BgClock = Date.now) {
    this._clock = clock;
  }

  /** Register a deployment start for a version. */
  deployStarted(version: string, env: EnvColor): VersionRecord {
    const rec: VersionRecord = {
      version,
      env,
      deployedAt: this._clock(),
      seq: this._seq++,
      outcome: 'deployed',
    };
    this._records.push(rec);
    this._byVersion.set(version, rec);
    return rec;
  }

  /** Mark the outcome of a registered version. */
  finish(version: string, outcome: Exclude<VersionOutcome, 'deployed'>): void {
    const rec = this._byVersion.get(version);
    if (!rec) throw new Error(`unknown version '${version}'`);
    rec.outcome = outcome;
    rec.finishedAt = this._clock();
  }

  /** Permanently poison a version — excluded from all rollback selection. */
  markBad(version: string, _reason = ''): void {
    const rec = this._byVersion.get(version);
    if (rec) {
      rec.outcome = 'bad';
      rec.finishedAt = rec.finishedAt ?? this._clock();
    }
  }

  get(version: string): VersionRecord | undefined {
    return this._byVersion.get(version);
  }

  /** All records newest-first (deploy time, then registration order). */
  history(): ReadonlyArray<VersionRecord> {
    return [...this._records].sort((a, b) => b.deployedAt - a.deployedAt || b.seq - a.seq);
  }

  /** Currently live version = newest 'completed' or still 'deployed' record. */
  current(): VersionRecord | undefined {
    for (const r of this.history()) {
      if (r.outcome === 'completed' || r.outcome === 'deployed') return r;
    }
    return undefined;
  }

  /**
   * Last good rollback target: newest 'completed' version that is not the
   * current one and not marked bad. Returns undefined when nothing qualifies —
   * callers must handle "nowhere safe to roll back to" explicitly.
   */
  lastGood(excludeVersion?: string): VersionRecord | undefined {
    const current = this.current()?.version;
    for (const r of this.history()) {
      if (r.version === current || r.version === excludeVersion) continue;
      if (r.outcome === 'completed') return r;
    }
    return undefined;
  }

  /** Soak time of the current version (ms since deploy). */
  currentSoakMs(): number {
    const c = this.current();
    return c ? this._clock() - c.deployedAt : 0;
  }

  /** Success rate over the last n completed-or-finished deployments. */
  successRate(n = 10): number {
    const finished = this.history().filter((r) => r.outcome !== 'deployed').slice(0, n);
    if (finished.length === 0) return 1;
    const ok = finished.filter((r) => r.outcome === 'completed').length;
    return ok / finished.length;
  }
}
