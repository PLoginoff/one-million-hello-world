/**
 * VersionedStore — schema-versioned read-model rows with lazy migration.
 *
 * Read models evolve: fields get added, renamed, reshaped. Rather than a
 * big-bang backfill, rows carry the schema version they were written
 * under; a read migrates the stored payload through a registered chain
 * of step migrations (v→v+1) to the version the caller asked for. This
 * is the standard "migrate on read" pattern — writes stay cheap, old
 * rows upgrade on touch, and a background pass can reuse the same
 * migration path to rewrite storage eagerly.
 *
 * Migration chain: migrations are registered per (projection, fromVersion)
 * and must be contiguous — a gap means the row is unreadable at the
 * target version and we surface that loudly (UnreadableRowError), since
 * silently returning a stale schema is how versioned stores corrupt
 * downstream consumers.
 *
 * Reads: get(projection, key, toVersion) → migrated payload + versions
 * traversed. Writes always stamp the writer's schema version.
 *
 * Complexity: get O(chain length); put O(1).
 *
 * @module ReadModelLayer/Engine2
 */

import { ProjectionRow } from './types';

/** One migration step: payload(v) → payload(v+1). Pure function. */
export type MigrationFn = (payload: Record<string, unknown>) => Record<string, unknown>;

export class UnreadableRowError extends Error {
  constructor(
    public readonly projection: string,
    public readonly key: string,
    public readonly fromVersion: number,
    public readonly toVersion: number,
    public readonly missingStep: number
  ) {
    super(
      `No migration ${projection} v${missingStep}->v${missingStep + 1}: ` +
        `cannot read row '${key}' (v${fromVersion}) at v${toVersion}`
    );
    this.name = 'UnreadableRowError';
  }
}

export interface ReadResult {
  readonly row: ProjectionRow;
  /** Migrated payload at requested version. */
  readonly payload: Record<string, unknown>;
  /** Versions traversed, e.g. [1,2,3] means v1→v2→v3 applied. */
  readonly migrationsApplied: readonly number[];
}

export class VersionedStore {
  /** rows[projection][key] = row (single-version storage). */
  private readonly _rows = new Map<string, Map<string, ProjectionRow>>();
  /** migrations[projection][fromVersion] = fn */
  private readonly _migrations = new Map<string, Map<number, MigrationFn>>();

  /** Register migration projection v→v+1. Overwrites a previous step. */
  registerMigration(projection: string, fromVersion: number, fn: MigrationFn): void {
    let m = this._migrations.get(projection);
    if (!m) {
      m = new Map();
      this._migrations.set(projection, m);
    }
    m.set(fromVersion, fn);
  }

  /** Write a row at `version` (the writer's schema version). */
  put(row: ProjectionRow): void {
    let p = this._rows.get(row.projection);
    if (!p) {
      p = new Map();
      this._rows.set(row.projection, p);
    }
    p.set(row.key, row);
  }

  /**
   * Read a row migrated to `toVersion`. Throws UnreadableRowError if the
   * migration chain has a gap. Returns the stored row untouched.
   */
  get(projection: string, key: string, toVersion: number): ReadResult | null {
    const row = this._rows.get(projection)?.get(key);
    if (!row) return null;
    let payload = { ...row.payload };
    const applied: number[] = [];
    let v = row.version;
    while (v !== toVersion) {
      const dir = v < toVersion ? 1 : -1;
      const stepFrom = dir > 0 ? v : v - 1;
      const step = this._migrations.get(projection)?.get(stepFrom);
      // No registered down-migrations: rolling back is not supported.
      if (!step || dir < 0) {
        throw new UnreadableRowError(projection, key, row.version, toVersion, stepFrom);
      }
      payload = step(payload);
      applied.push(v);
      v += 1;
    }
    return { row, payload, migrationsApplied: applied };
  }

  /**
   * Migrate-and-rewrite a row in place to `toVersion` (eager backfill
   * for hot rows). Returns the new stored version.
   */
  upgradeInPlace(projection: string, key: string, toVersion: number): number | null {
    const r = this.get(projection, key, toVersion);
    if (!r) return null;
    this.put({ ...r.row, version: toVersion, payload: r.payload });
    return toVersion;
  }

  /** All stored (projection, key, version) — for backfill scans. */
  listVersions(): Array<{ projection: string; key: string; version: number }> {
    const out: Array<{ projection: string; key: string; version: number }> = [];
    for (const [p, rows] of this._rows) {
      for (const [key, row] of rows) out.push({ projection: p, key, version: row.version });
    }
    return out;
  }
}
