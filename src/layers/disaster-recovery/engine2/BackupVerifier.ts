/**
 * Backup / Restore-Point Verification
 *
 * The DR assumption that kills companies: "we have backups" unverified
 * is "we hope we have backups". This module tracks declared restore
 * points (snapshots, WAL archives, export dumps) and proves they're
 * usable — freshness (a backup older than its RPO window is a paper
 * backup), completeness (the declared buckets all present), and
 * restorability (a checksum'd test-restore signature on record).
 *
 * `verify` answers, per target dataset:
 *   - Is there a restore point inside the RPO window?
 *   - Does it cover every expected bucket?
 *   - Has a test restore ever validated it (and is that validation
 *     still fresh)?
 *
 * The verdict is a score + issue list an auditor can act on.
 *
 * @module DisasterRecoveryLayer/Engine2
 */

import { DrClock2, SystemDrClock2 } from './types';

export interface RestorePoint {
  readonly id: string;
  readonly dataset: string;
  readonly takenAt: number;
  /** Buckets the point covers (tables, partitions, namespaces). */
  readonly buckets: readonly string[];
  /** A test-restore checksum signature recorded when it was proven. */
  readonly restoreProof?: {
    readonly at: number;
    readonly signature: string;
  };
}

export interface DatasetTarget {
  readonly dataset: string;
  /** Buckets that MUST be covered. */
  readonly expectedBuckets: readonly string[];
  /** Max acceptable backup age (RPO window). */
  readonly rpoMs: number;
  /** Max acceptable proof age — a proof older than this is stale. */
  readonly proofMaxAgeMs: number;
}

export type BackupIssueKind =
  | 'no-restore-point'
  | 'stale-restore-point'
  | 'missing-buckets'
  | 'unproven'
  | 'stale-proof';

export interface BackupIssue {
  readonly kind: BackupIssueKind;
  readonly detail: string;
}

export interface DatasetVerdict {
  readonly dataset: string;
  readonly ok: boolean;
  readonly issues: readonly BackupIssue[];
  /** The point evaluated (latest inside/outside the window). */
  readonly point?: RestorePoint;
}

export class BackupVerifier {
  private readonly _clock: DrClock2;
  private readonly _points = new Map<string, RestorePoint[]>();

  constructor(clock: DrClock2 = new SystemDrClock2()) {
    this._clock = clock;
  }

  register(point: RestorePoint): void {
    const list = this._points.get(point.dataset) ?? [];
    list.push(point);
    // Keep newest-first for cheap latest scans.
    list.sort((a, b) => b.takenAt - a.takenAt);
    this._points.set(point.dataset, list);
  }

  points(dataset: string): readonly RestorePoint[] {
    return this._points.get(dataset) ?? [];
  }

  /** Evaluate one dataset's newest usable point against its target. */
  verify(target: DatasetTarget): DatasetVerdict {
    const issues: BackupIssue[] = [];
    const candidates = this._points.get(target.dataset) ?? [];
    if (candidates.length === 0) {
      return {
        dataset: target.dataset,
        ok: false,
        issues: [{ kind: 'no-restore-point', detail: 'no restore points registered' }],
      };
    }

    const now = this._clock.now();
    // Newest point inside the RPO window wins; else flag staleness on the newest overall.
    const inWindow = candidates.find((p) => now - p.takenAt <= target.rpoMs);
    const point = inWindow ?? candidates[0];
    if (point === undefined) {
      return {
        dataset: target.dataset,
        ok: false,
        issues: [{ kind: 'no-restore-point', detail: 'no restore points registered' }],
      };
    }
    if (inWindow === undefined) {
      issues.push({
        kind: 'stale-restore-point',
        detail: `newest point is ${now - point.takenAt}ms old (RPO ${target.rpoMs}ms)`,
      });
    }

    const covered = new Set(point.buckets);
    const missing = target.expectedBuckets.filter((b) => !covered.has(b));
    if (missing.length > 0) {
      issues.push({
        kind: 'missing-buckets',
        detail: `point '${point.id}' is missing buckets: ${missing.join(', ')}`,
      });
    }

    if (point.restoreProof === undefined) {
      issues.push({ kind: 'unproven', detail: 'no test-restore proof on record' });
    } else if (now - point.restoreProof.at > target.proofMaxAgeMs) {
      issues.push({
        kind: 'stale-proof',
        detail: `proof is ${now - point.restoreProof.at}ms old (max ${target.proofMaxAgeMs}ms)`,
      });
    }

    return { dataset: target.dataset, ok: issues.length === 0, issues, point };
  }

  /** Evaluate every declared target. */
  verifyAll(targets: readonly DatasetTarget[]): DatasetVerdict[] {
    return targets.map((t) => this.verify(t));
  }
}
