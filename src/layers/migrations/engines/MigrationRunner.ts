/**
 * MigrationRunner — plans and executes migrations against a store.
 *
 * Responsibilities, in pipeline order:
 *   1. validate the migration set (unique positive versions, sorted)
 *   2. plan — diff declared migrations vs history: pending migrations
 *      apply ascending; applied-but-edited migrations raise
 *      EDITED_MIGRATION unless `ignoreChecksums` is set
 *   3. execute — batched, ordered application with progress callbacks;
 *      each applied row records checksum + batch + duration
 *   4. dry-run — run the whole plan against a throwaway context,
 *      returning the statements + warnings without touching history
 *   5. rollback — reverse the latest batch (or to a target version)
 *      honoring irreversibility and the `allowDataLoss` gate
 *
 * Failure semantics: a failing `up` marks the record `failed` and
 * aborts the batch — matching the "stop on first error" behavior of
 * real runners (Flyway/ActiveRecord). The context is not transactional
 * here, but the history row makes the failure discoverable.
 *
 * @module Migrations/Engines
 */

import { InMemoryMigrationStore, IMigrationStore } from './MigrationStore';
import {
  createContext,
  IClock,
  Migration,
  MigrationContext,
  MigrationDirection,
  MigrationError,
  MigrationPlan,
  MigrationProgress,
  MigrationReport,
  MigrationResult,
  MigrationStatus,
  PlannedMigration,
  ProgressCallback,
  migrationChecksum,
  SystemClock,
} from './types';

/** Options controlling a migrate/rollback run. */
export interface RunOptions {
  /**
   * Allow `down` on migrations flagged `destructive`. Required because
   * reverting a destructive migration can't recover the data it
   * dropped — the caller must opt in explicitly.
   */
  allowDataLoss?: boolean;
  /**
   * Skip checksum verification for already-applied migrations.
   * Dangerous — intended for controlled repair workflows only.
   */
  ignoreChecksums?: boolean;
  /** Stop after applying this many pending migrations. */
  limit?: number;
  /** Migrate only up to (and including) this version. */
  target?: number;
  /** Progress callback fired after each migration attempt. */
  onProgress?: ProgressCallback;
}

export class MigrationRunner {
  private readonly _store: IMigrationStore;
  private readonly _migrations: Map<number, Migration>;
  private readonly _clock: IClock;

  constructor(
    migrations: Migration[] = [],
    store?: IMigrationStore,
    clock: IClock = new SystemClock()
  ) {
    this._store = store ?? new InMemoryMigrationStore(clock);
    this._migrations = new Map();
    this._clock = clock;
    for (const m of migrations) this.register(m);
  }

  /** Add a migration; validates version uniqueness. */
  register(m: Migration): this {
    if (!Number.isInteger(m.version) || m.version <= 0) {
      throw new MigrationError(
        `migration '${m.name}' has invalid version ${m.version}`,
        'VALIDATION'
      );
    }
    const existing = this._migrations.get(m.version);
    if (existing !== undefined && existing.name !== m.name) {
      throw new MigrationError(
        `duplicate version ${m.version}: '${existing.name}' vs '${m.name}'`,
        'DUPLICATE_VERSION',
        { version: m.version }
      );
    }
    this._migrations.set(m.version, m);
    return this;
  }

  store(): IMigrationStore {
    return this._store;
  }

  /** Declared migrations, ascending by version. */
  migrations(): Migration[] {
    return [...this._migrations.values()].sort((a, b) => a.version - b.version);
  }

  /** Registered but not-yet-applied migrations, ascending. */
  pending(): Migration[] {
    const applied = new Set(this._store.applied().map((r) => r.version));
    return this.migrations().filter((m) => !applied.has(m.version));
  }

  /**
   * Verify every applied migration's checksum still matches its
   * declared body. Returns the list of edited versions — the caller
   * decides whether that's fatal (default in plan/execute).
   */
  verifyChecksums(): number[] {
    const edited: number[] = [];
    for (const rec of this._store.applied()) {
      const m = this._migrations.get(rec.version);
      if (m === undefined) continue; // applied but undeclared — divergence, not edit
      const declared = m.checksum ?? migrationChecksum(m);
      if (declared !== rec.checksum) edited.push(rec.version);
    }
    return edited;
  }

  // -----------------------------------------------------------------------
  // Planning
  // -----------------------------------------------------------------------

  /**
   * Compute the up-plan: pending migrations in order, with warnings
   * for destructive ops and edited-history entries.
   */
  plan(options: RunOptions = {}): MigrationPlan {
    const warnings: string[] = [];
    const edited = this.verifyChecksums();
    if (edited.length > 0 && !options.ignoreChecksums) {
      throw new MigrationError(
        `applied migration(s) edited since apply: ${edited.join(', ')}`,
        'EDITED_MIGRATION',
        { versions: edited }
      );
    }
    if (edited.length > 0) {
      warnings.push(`checksum mismatch on applied: ${edited.join(', ')}`);
    }

    let pending = this.pending();
    if (options.target !== undefined) {
      pending = pending.filter((m) => m.version <= (options.target ?? 0));
    }
    if (options.limit !== undefined) {
      pending = pending.slice(0, options.limit);
    }

    const items: PlannedMigration[] = pending.map((migration) => ({
      migration,
      direction: MigrationDirection.Up,
      reason: 'pending',
    }));

    for (const m of pending) {
      if (m.destructive) {
        warnings.push(`migration ${m.version} '${m.name}' is destructive`);
      }
    }
    return { items, warnings };
  }

  /** Versions with no registered migration but an applied record —
   *  the "history has migrations we don't know about" case. */
  unknownApplied(): number[] {
    return this._store
      .applied()
      .filter((r) => !this._migrations.has(r.version))
      .map((r) => r.version);
  }

  // -----------------------------------------------------------------------
  // Execution
  // -----------------------------------------------------------------------

  /**
   * Apply pending migrations in order. Each runs inside the same
   * context; failures mark the row and abort the batch.
   */
  async migrate(ctx: MigrationContext, options: RunOptions = {}): Promise<MigrationReport> {
    const plan = this.plan(options);
    const results: MigrationResult[] = [];
    const batch = this._store.currentBatch() + 1;

    let completed = 0;
    for (const item of plan.items) {
      const m = item.migration;
      const start = this._clock.now();
      const checksum = m.checksum ?? migrationChecksum(m);
      try {
        await m.up(ctx);
        const durationMs = this._clock.now() - start;
        this._store.put({
          version: m.version,
          name: m.name,
          checksum,
          status: MigrationStatus.Applied,
          appliedAt: this._clock.now(),
          durationMs,
          ...(m.branch !== undefined ? { branch: m.branch } : {}),
          batch,
        });
        const r: MigrationResult = {
          version: m.version,
          name: m.name,
          direction: MigrationDirection.Up,
          status: 'applied',
          durationMs,
        };
        results.push(r);
        completed += 1;
        options.onProgress?.({ completed, total: plan.items.length, current: r });
      } catch (err) {
        const durationMs = this._clock.now() - start;
        this._store.put({
          version: m.version,
          name: m.name,
          checksum,
          status: MigrationStatus.Failed,
          appliedAt: this._clock.now(),
          durationMs,
          ...(m.branch !== undefined ? { branch: m.branch } : {}),
          batch,
        });
        const r: MigrationResult = {
          version: m.version,
          name: m.name,
          direction: MigrationDirection.Up,
          status: 'failed',
          durationMs,
          error: err instanceof Error ? err.message : String(err),
        };
        results.push(r);
        completed += 1;
        options.onProgress?.({ completed, total: plan.items.length, current: r });
        break;
      }
    }
    return { results, batch, dryRun: false };
  }

  /**
   * Roll back the latest applied batch, or down to (excluding)
   * `target` version. Destructive migrations require allowDataLoss.
   */
  async rollback(
    ctx: MigrationContext,
    options: RunOptions & { steps?: number } = {}
  ): Promise<MigrationReport> {
    const batch = options.target !== undefined
      ? this._store.currentBatch() // target-based rollback ignores batch
      : this._store.currentBatch();

    let toRevert = this._store
      .applied()
      .filter((r) =>
        options.target !== undefined ? r.version > (options.target ?? 0) : r.batch === batch
      )
      .sort((a, b) => b.version - a.version); // descend

    if (options.steps !== undefined && options.target === undefined) {
      toRevert = toRevert.slice(0, options.steps);
    }

    if (toRevert.length === 0) {
      throw new MigrationError('nothing to revert', 'NOTHING_TO_REVERT');
    }

    const results: MigrationResult[] = [];
    let completed = 0;
    for (const rec of toRevert) {
      const m = this._migrations.get(rec.version);
      const start = this._clock.now();
      const base: Omit<MigrationResult, 'status'> = {
        version: rec.version,
        name: rec.name,
        direction: MigrationDirection.Down,
        durationMs: 0,
      };

      if (m === undefined) {
        results.push({ ...base, status: 'skipped', error: 'migration not registered' });
        continue;
      }
      if (m.down === undefined || m.reversible === false) {
        results.push({ ...base, status: 'skipped', error: 'irreversible migration' });
        continue;
      }
      if (m.destructive && !options.allowDataLoss) {
        results.push({
          ...base,
          status: 'skipped',
          error: 'destructive — pass allowDataLoss to revert',
        });
        continue;
      }

      try {
        await m.down(ctx);
        const durationMs = this._clock.now() - start;
        if (this._store instanceof InMemoryMigrationStore) {
          this._store.markReverted(rec.version, durationMs);
        } else {
          this._store.put({ ...rec, status: MigrationStatus.Reverted, durationMs });
        }
        const r: MigrationResult = { ...base, status: 'applied', durationMs };
        results.push(r);
        completed += 1;
        options.onProgress?.({ completed, total: toRevert.length, current: r });
      } catch (err) {
        const durationMs = this._clock.now() - start;
        const r: MigrationResult = {
          ...base,
          status: 'failed',
          durationMs,
          error: err instanceof Error ? err.message : String(err),
        };
        results.push(r);
        completed += 1;
        options.onProgress?.({ completed, total: toRevert.length, current: r });
        break;
      }
    }
    return { results, batch, dryRun: false };
  }

  /**
   * Run the whole pending plan against a throwaway context and return
   * the recorded SQL plus warnings — nothing touches the real store.
   */
  async dryRun(ctx: MigrationContext, options: RunOptions = {}): Promise<MigrationReport & { sql: string[]; warnings: string[] }> {
    const plan = this.plan(options);
    const scratch = createContext(true);
    // Seed scratch with the real context's tables so data migrations
    // see representative state without mutating it.
    for (const [name, rows] of ctx.tables) {
      scratch.tables.set(name, new Map(rows));
    }
    for (const [k, v] of ctx.state) scratch.state.set(k, v);

    const results: MigrationResult[] = [];
    for (const item of plan.items) {
      const m = item.migration;
      const start = this._clock.now();
      try {
        await m.up(scratch);
        results.push({
          version: m.version,
          name: m.name,
          direction: MigrationDirection.Up,
          status: 'applied',
          durationMs: this._clock.now() - start,
        });
      } catch (err) {
        results.push({
          version: m.version,
          name: m.name,
          direction: MigrationDirection.Up,
          status: 'failed',
          durationMs: this._clock.now() - start,
          error: err instanceof Error ? err.message : String(err),
        });
        break;
      }
    }
    return {
      results,
      batch: this._store.currentBatch() + 1,
      dryRun: true,
      sql: [...scratch.executedSql],
      warnings: plan.warnings,
    };
  }

  // -----------------------------------------------------------------------
  // Squashing
  // -----------------------------------------------------------------------

  /**
   * Merge a contiguous run of *applied* migrations into one synthetic
   * migration whose `up` replays the originals in order. The history
   * rows are collapsed into a single record carrying the combined
   * checksum — this is the standard "consolidate old migrations"
   * operation done on a merged baseline.
   *
   * Squash constraints (enforced):
   *   - every migration in [from, to] must be applied
   *   - the range must be contiguous in applied order
   *   - the squashed migration gets `version = to` so future versions
   *     continue from where the range ended
   */
  squash(fromVersion: number, toVersion: number, squashedName: string): Migration {
    const applied = this._store.applied();
    const inRange = applied.filter((r) => r.version >= fromVersion && r.version <= toVersion);
    const expected = this.migrations().filter(
      (m) => m.version >= fromVersion && m.version <= toVersion
    );
    if (inRange.length !== expected.length || expected.length === 0) {
      throw new MigrationError(
        `cannot squash ${fromVersion}..${toVersion}: range not fully applied or empty`,
        'VALIDATION',
        { applied: inRange.length, expected: expected.length }
      );
    }
    const ordered = [...expected].sort((a, b) => a.version - b.version);

    const originals = ordered.map((m) => `${m.version}:${m.name}`);
    const squashed: Migration = {
      version: toVersion,
      name: squashedName,
      up: async (ctx) => {
        for (const m of ordered) await m.up(ctx);
      },
      ...(ordered.every((m) => m.down !== undefined)
        ? {
            down: async (ctx: MigrationContext) => {
              for (const m of [...ordered].reverse()) await m.down?.(ctx);
            },
          }
        : {}),
      reversible: ordered.every((m) => m.down !== undefined && m.reversible !== false),
    };

    // Collapse history rows: remove per-version records, insert one
    // squashed record at `toVersion` with combined checksum input.
    const combined = createCombinedChecksum(ordered);
    const batch = this._store.currentBatch();
    for (const r of inRange) {
      // Delete by overwriting is not possible via IMigrationStore —
      // rewrite the record into reverted then fold the squashed row in.
      if (this._store instanceof InMemoryMigrationStore) {
        this._store.markReverted(r.version, r.durationMs);
      }
    }
    this._store.put({
      version: toVersion,
      name: `${squashedName} [squashed ${ordered.length}]`,
      checksum: combined,
      status: MigrationStatus.Applied,
      appliedAt: this._clock.now(),
      durationMs: inRange.reduce((a, r) => a + r.durationMs, 0),
      batch,
    });

    // Replace registered migrations in the range with the squashed one.
    for (const m of ordered) this._migrations.delete(m.version);
    this._migrations.set(toVersion, squashed);
    void originals;
    return squashed;
  }
}

function createCombinedChecksum(migrations: Migration[]): string {
  // FNV-1a over concatenated per-migration checksums — order matters.
  const hex = migrations.map(migrationChecksum).join('');
  let h1 = 0x811c9dc5;
  let h2 = 0x811c9dc5;
  for (let i = 0; i < hex.length; i++) {
    const c = hex.charCodeAt(i);
    if (i % 2 === 0) {
      h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    } else {
      h2 = Math.imul(h2 ^ c, 0x01000193) >>> 0;
    }
  }
  return (h1.toString(16) + h2.toString(16)).padEnd(64, '0').slice(0, 64);
}
