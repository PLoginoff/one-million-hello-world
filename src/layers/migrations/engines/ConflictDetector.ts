/**
 * ConflictDetector — divergent-branch and ordering analysis.
 *
 * Two real checks:
 *
 *   1. **Divergent branches** — when the same version number was applied
 *      from two different migration bodies (two feature branches each
 *      added `v12`). Detected by comparing the stored checksum of an
 *      applied record against every registered migration carrying a
 *      different name at the same version — and by finding applied
 *      records with no matching declaration ("orphan" migrations).
 *
 *   2. **Ordering gaps** — a migration declared with a version lower
 *      than the current head but never applied (someone added an
 *      old-versioned migration after the fact). These apply in
 *      declared order but break the "versions only move forward"
 *      invariant real runners enforce.
 *
 * @module Migrations/Engines
 */

import { IMigrationStore } from './MigrationStore';
import { Migration, MigrationStatus, migrationChecksum } from './types';

/** One detected conflict. */
export interface MigrationConflict {
  kind: 'edited' | 'orphan' | 'duplicate_version' | 'out_of_order';
  version: number;
  /** Human-readable description. */
  message: string;
  /** The conflicting migration names, where applicable. */
  parties: string[];
}

export interface ConflictReport {
  conflicts: MigrationConflict[];
  /** true when no conflicts were found. */
  clean: boolean;
}

export class ConflictDetector {
  /**
   * Compare the declared migration set against history.
   *
   * - `edited`: applied record's checksum ≠ declared body's checksum.
   * - `orphan`: applied record has no declared migration at that
   *   version (the file was deleted or belongs to another branch).
   * - `duplicate_version`: two declared migrations share a version
   *   (caught earlier at register time, but detectable here when the
   *   runner was bypassed).
   * - `out_of_order`: pending migration whose version is below the
   *   current applied head — will create a non-monotonic history.
   */
  static analyze(declared: readonly Migration[], store: IMigrationStore): ConflictReport {
    const conflicts: MigrationConflict[] = [];
    const byVersion = new Map<number, Migration[]>();
    for (const m of declared) {
      const list = byVersion.get(m.version) ?? [];
      list.push(m);
      byVersion.set(m.version, list);
    }

    // duplicate_version
    for (const [version, list] of byVersion) {
      if (list.length > 1) {
        conflicts.push({
          kind: 'duplicate_version',
          version,
          message: `version ${version} declared ${list.length} times`,
          parties: list.map((m) => m.name),
        });
      }
    }

    const applied = store.applied();
    const head = store.currentVersion();
    const declaredByVersion = new Map<number, Migration>();
    for (const m of declared) {
      if (!declaredByVersion.has(m.version)) declaredByVersion.set(m.version, m);
    }

    for (const rec of applied) {
      const m = declaredByVersion.get(rec.version);
      if (m === undefined) {
        conflicts.push({
          kind: 'orphan',
          version: rec.version,
          message: `applied migration '${rec.name}' (v${rec.version}) has no declared migration`,
          parties: [rec.name],
        });
        continue;
      }
      const checksum = m.checksum ?? migrationChecksum(m);
      if (checksum !== rec.checksum) {
        conflicts.push({
          kind: 'edited',
          version: rec.version,
          message: `applied migration '${m.name}' (v${rec.version}) was edited after apply`,
          parties: [m.name],
        });
      }
    }

    // out_of_order: declared-and-unapplied below head
    const appliedVersions = new Set(applied.map((r) => r.version));
    for (const m of declared) {
      if (!appliedVersions.has(m.version) && m.version < head) {
        conflicts.push({
          kind: 'out_of_order',
          version: m.version,
          message: `pending migration '${m.name}' (v${m.version}) is below applied head v${head}`,
          parties: [m.name],
        });
      }
    }

    // Also flag applied-but-failed rows as edited-adjacent signal.
    for (const rec of store.all()) {
      if (rec.status === MigrationStatus.Failed) {
        conflicts.push({
          kind: 'edited',
          version: rec.version,
          message: `migration v${rec.version} '${rec.name}' is in failed state`,
          parties: [rec.name],
        });
      }
    }

    return { conflicts, clean: conflicts.length === 0 };
  }

  /**
   * Detect *branch* divergence specifically: applied records whose
   * `branch` tag differs from the declared migration's branch at the
   * same version — the classic "two PRs each added vN" collision.
   */
  static branchDivergence(
    declared: readonly Migration[],
    store: IMigrationStore
  ): MigrationConflict[] {
    const out: MigrationConflict[] = [];
    const byVersion = new Map<number, Migration>();
    for (const m of declared) {
      if (!byVersion.has(m.version)) byVersion.set(m.version, m);
    }
    for (const rec of store.applied()) {
      const m = byVersion.get(rec.version);
      if (m === undefined) continue;
      const appliedBranch = rec.branch ?? '';
      const declaredBranch = m.branch ?? '';
      if (appliedBranch !== declaredBranch) {
        out.push({
          kind: 'duplicate_version',
          version: rec.version,
          message:
            `v${rec.version} applied from branch '${appliedBranch || 'main'}' ` +
            `but declared on '${declaredBranch || 'main'}'`,
          parties: [rec.name, m.name],
        });
      }
    }
    return out;
  }
}
