/**
 * MigrationStore — the history-table backend.
 *
 * The in-memory implementation mirrors what `schema_migrations` does
 * in a real database: one row per applied migration version holding
 * the checksum, status, batch number, and timing. Rows are never
 * deleted — reverting sets `status = 'reverted'` so the audit trail
 * survives (matches how Flyway's history table works).
 *
 * Batch semantics: each `migrate` run increments the batch number;
 * `rollback` removes the latest batch only, which is the standard
 * "undo the last deploy" unit.
 *
 * @module Migrations/Engines
 */

import {
  IClock,
  MigrationRecord,
  MigrationStatus,
  SystemClock,
} from './types';

/** Read/write contract for migration history. */
export interface IMigrationStore {
  all(): MigrationRecord[];
  get(version: number): MigrationRecord | undefined;
  put(record: MigrationRecord): void;
  /** Highest applied version, or 0 when empty. */
  currentVersion(): number;
  /** The latest batch number, or 0 when nothing applied. */
  currentBatch(): number;
  /** Records in a batch, ascending by version. */
  batch(n: number): MigrationRecord[];
  /** Applied (not reverted/failed) records, ascending. */
  applied(): MigrationRecord[];
}

export class InMemoryMigrationStore implements IMigrationStore {
  private readonly _records = new Map<number, MigrationRecord>();
  private readonly _clock: IClock;

  constructor(clock: IClock = new SystemClock()) {
    this._clock = clock;
  }

  all(): MigrationRecord[] {
    return [...this._records.values()].sort((a, b) => a.version - b.version);
  }

  get(version: number): MigrationRecord | undefined {
    return this._records.get(version);
  }

  put(record: MigrationRecord): void {
    this._records.set(record.version, { ...record });
  }

  currentVersion(): number {
    let max = 0;
    for (const r of this._records.values()) {
      if (r.status === MigrationStatus.Applied && r.version > max) max = r.version;
    }
    return max;
  }

  currentBatch(): number {
    let max = 0;
    for (const r of this._records.values()) {
      if (r.batch > max) max = r.batch;
    }
    return max;
  }

  batch(n: number): MigrationRecord[] {
    return this.all().filter((r) => r.batch === n);
  }

  applied(): MigrationRecord[] {
    return this.all().filter((r) => r.status === MigrationStatus.Applied);
  }

  /** Mark a version reverted — history row is kept. */
  markReverted(version: number, durationMs: number): void {
    const r = this._records.get(version);
    if (r === undefined) return;
    this._records.set(version, {
      ...r,
      status: MigrationStatus.Reverted,
      appliedAt: this._clock.now(),
      durationMs,
    });
  }

  /** Mark a version failed. */
  markFailed(version: number, durationMs: number): void {
    const r = this._records.get(version);
    if (r === undefined) return;
    this._records.set(version, {
      ...r,
      status: MigrationStatus.Failed,
      appliedAt: this._clock.now(),
      durationMs,
    });
  }
}
