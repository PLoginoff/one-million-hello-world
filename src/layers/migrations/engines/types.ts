/**
 * Migrations Engine — Core Types
 *
 * Vocabulary for a real migration runner:
 *   - `Migration`          — a versioned up/down script pair
 *   - `MigrationRecord`    — a row in the history table (with checksum)
 *   - `MigrationPlan`      — ordered list of pending migrations + warnings
 *   - `MigrationReport`    — what a run did (applied/skipped/failed)
 *   - `MigrationContext`   — the in-memory "database" scripts run against
 *   - `ConflictReport`     — divergent-branch detection results
 *
 * Versioning model: integer versions with an optional branch tag.
 * Versions must be unique and positive; application order is strictly
 * ascending. A migration's checksum covers its `id + up/down source`
 * so editing an already-applied migration is detectable.
 *
 * @module Migrations/Engines
 */

import { createHash } from 'crypto';

// ---------------------------------------------------------------------------
// Migration definition
// ---------------------------------------------------------------------------

/** Direction a migration can run. */
export enum MigrationDirection {
  Up = 'up',
  Down = 'down',
}

/**
 * A versioned migration. `up` mutates the schema/data forward; `down`
 * reverses it. `reversible` defaults to true — set false for
 * irreversible operations (data loss, dropped columns) which then
 * require `allowDataLoss` to roll back.
 */
export interface Migration {
  /** Unique positive integer version (application order). */
  version: number;
  /** Human-readable name, e.g. `'create_users_table'`. */
  name: string;
  /** Optional branch label for divergent-branch detection. */
  branch?: string;
  /** Forward migration. */
  up(ctx: MigrationContext): void | Promise<void>;
  /** Reverse migration. Absent ⇒ irreversible. */
  down?(ctx: MigrationContext): void | Promise<void>;
  /** Explicit irreversibility flag (down absent ⇒ implied). */
  reversible?: boolean;
  /** Set when `up`/`down` destroy data — surfaces as a warning and
   *  requires `allowDataLoss` when running `down`. */
  destructive?: boolean;
  /** Optional expected checksum — when set, mismatch fails planning. */
  checksum?: string;
}

/** Injectable clock. */
export interface IClock {
  now(): number;
}

export class SystemClock implements IClock {
  now(): number {
    return Date.now();
  }
}

export class TestClock implements IClock {
  private _t: number;
  constructor(start = 0) {
    this._t = start;
  }
  now(): number {
    return this._t;
  }
  advance(ms: number): void {
    this._t += ms;
  }
}

// ---------------------------------------------------------------------------
// History records
// ---------------------------------------------------------------------------

/** Lifecycle status of an applied migration. */
export enum MigrationStatus {
  Applied = 'applied',
  Reverted = 'reverted',
  Failed = 'failed',
}

/** A row in the migration history table. */
export interface MigrationRecord {
  version: number;
  name: string;
  /** SHA-256 of the migration's canonical form at apply time. */
  checksum: string;
  status: MigrationStatus;
  /** Epoch ms when last applied/reverted. */
  appliedAt: number;
  /** Wall-clock duration of the last up/down run. */
  durationMs: number;
  /** Branch tag, if the migration declared one. */
  branch?: string;
  /** Which batch this migration was applied in (1-based). */
  batch: number;
}

// ---------------------------------------------------------------------------
// Context — the "database" migrations operate on
// ---------------------------------------------------------------------------

/**
 * The surface migrations mutate. `state` is an arbitrary key/value
 * bag scripts can use to simulate schema; `tables` models named row
 * sets for data migrations; `executedSql` records every `execute()`
 * call so dry-run can report the statements without applying them.
 */
export interface MigrationContext {
  state: Map<string, unknown>;
  tables: Map<string, Map<string, Record<string, unknown>>>;
  executedSql: string[];
  /** When true, `execute()` records SQL but `state`/`tables` writes are
   *  still applied to a *disposable copy* — see MigrationRunner.dryRun. */
  dryRun: boolean;
  /** Record a SQL statement (always logged; executed by the adapter). */
  execute(sql: string): void;
  /** Convenience: create a table bucket. */
  createTable(name: string): void;
  dropTable(name: string): void;
  insertRow(table: string, key: string, row: Record<string, unknown>): void;
  deleteRow(table: string, key: string): void;
  tableRows(table: string): Record<string, unknown>[];
}

/** Build a real context. */
export function createContext(dryRun = false): MigrationContext {
  const executedSql: string[] = [];
  const state = new Map<string, unknown>();
  const tables = new Map<string, Map<string, Record<string, unknown>>>();
  return {
    state,
    tables,
    executedSql,
    dryRun,
    execute(sql: string) {
      executedSql.push(sql);
    },
    createTable(name: string) {
      if (!tables.has(name)) tables.set(name, new Map());
    },
    dropTable(name: string) {
      tables.delete(name);
    },
    insertRow(table: string, key: string, row: Record<string, unknown>) {
      let t = tables.get(table);
      if (!t) {
        t = new Map();
        tables.set(table, t);
      }
      t.set(key, row);
    },
    deleteRow(table: string, key: string) {
      tables.get(table)?.delete(key);
    },
    tableRows(table: string) {
      const t = tables.get(table);
      return t ? [...t.values()] : [];
    },
  };
}

// ---------------------------------------------------------------------------
// Plans / reports
// ---------------------------------------------------------------------------

/** A migration plus the reason it's in the plan. */
export interface PlannedMigration {
  migration: Migration;
  direction: MigrationDirection;
  /** e.g. 'pending' | 'rollback' | 'edited-checksum'. */
  reason: string;
}

/** Ordered plan with warnings (destructive ops, edited checksums). */
export interface MigrationPlan {
  items: PlannedMigration[];
  warnings: string[];
}

/** Per-migration outcome inside a run. */
export interface MigrationResult {
  version: number;
  name: string;
  direction: MigrationDirection;
  status: 'applied' | 'skipped' | 'failed';
  durationMs: number;
  error?: string;
}

/** Aggregate run report. */
export interface MigrationReport {
  results: MigrationResult[];
  /** Final batch number after the run. */
  batch: number;
  /** true when the run was a dry-run (nothing persisted). */
  dryRun: boolean;
}

/** Progress event fired between migrations in a batch. */
export interface MigrationProgress {
  completed: number;
  total: number;
  current: MigrationResult;
}

export type ProgressCallback = (p: MigrationProgress) => void;

// ---------------------------------------------------------------------------
// Checksums
// ---------------------------------------------------------------------------

/**
 * Canonical checksum of a migration: SHA-256 over `version | name |
 * up-source | down-source`. Function sources are stringified — editing
 * an applied migration's body changes the checksum and is detected.
 */
export function migrationChecksum(m: Migration): string {
  const parts = [
    String(m.version),
    m.name,
    m.branch ?? '',
    m.up.toString(),
    m.down === undefined ? '' : m.down.toString(),
  ];
  return createHash('sha256').update(parts.join('|')).digest('hex');
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class MigrationError extends Error {
  constructor(
    message: string,
    readonly code:
      | 'EDITED_MIGRATION'
      | 'DIVERGENT_BRANCH'
      | 'DUPLICATE_VERSION'
      | 'GAP'
      | 'IRREVERSIBLE'
      | 'DATA_LOSS'
      | 'APPLY_FAILED'
      | 'NOTHING_TO_REVERT'
      | 'VALIDATION',
    readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'MigrationError';
  }
}
