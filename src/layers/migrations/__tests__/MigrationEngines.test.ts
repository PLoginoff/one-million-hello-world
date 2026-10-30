/**
 * Migrations engines — versioned scripts, checksums, ordered batches,
 * dry-run, reversible + data-loss gating, conflicts, squashing.
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import {
  ConflictDetector,
  createContext,
  InMemoryMigrationStore,
  Migration,
  MigrationContext,
  MigrationDirection,
  MigrationError,
  MigrationRunner,
  MigrationStatus,
  TestClock,
  migrationChecksum,
} from '../engines';

function mig(version: number, name: string, extra: Partial<Migration> = {}): Migration {
  return {
    version,
    name,
    up: (ctx) => {
      ctx.execute(`-- v${version} ${name} up`);
      ctx.state.set(`v${version}`, true);
    },
    down: (ctx) => {
      ctx.execute(`-- v${version} ${name} down`);
      ctx.state.delete(`v${version}`);
    },
    ...extra,
  };
}

let store: InMemoryMigrationStore;
let ctx: MigrationContext;
let clock: TestClock;

beforeEach(() => {
  clock = new TestClock(1_000_000);
  store = new InMemoryMigrationStore(clock);
  ctx = createContext();
});

// ---------------------------------------------------------------------------
// Basics: register / pending / ordered apply
// ---------------------------------------------------------------------------

describe('MigrationRunner registration & pending', () => {
  it('rejects non-positive and duplicate versions', () => {
    const r = new MigrationRunner([], store, clock);
    expect(() => r.register(mig(0, 'zero'))).toThrow(MigrationError);
    r.register(mig(1, 'a'));
    expect(() => r.register(mig(1, 'b'))).toThrow(/duplicate version/);
    // same name+version re-register is idempotent
    expect(() => r.register(mig(1, 'a'))).not.toThrow();
  });

  it('pending returns unapplied in version order', () => {
    const r = new MigrationRunner([mig(3, 'c'), mig(1, 'a'), mig(2, 'b')], store, clock);
    expect(r.pending().map((m) => m.version)).toEqual([1, 2, 3]);
  });
});

// ---------------------------------------------------------------------------
// Ordered application + batches + progress
// ---------------------------------------------------------------------------

describe('migrate()', () => {
  it('applies pending in order, records batch + checksum', async () => {
    const r = new MigrationRunner([mig(1, 'a'), mig(2, 'b'), mig(3, 'c')], store, clock);
    const report = await r.migrate(ctx);
    expect(report.results.map((x) => x.version)).toEqual([1, 2, 3]);
    expect(report.batch).toBe(1);
    expect(store.applied()).toHaveLength(3);
    expect(store.get(1)?.checksum).toBe(migrationChecksum(mig(1, 'a')));
    expect(ctx.state.get('v2')).toBe(true);
  });

  it('second run is a no-op (nothing pending)', async () => {
    const r = new MigrationRunner([mig(1, 'a')], store, clock);
    await r.migrate(ctx);
    const again = await r.migrate(ctx);
    expect(again.results).toHaveLength(0);
  });

  it('subsequent migrations land in the next batch', async () => {
    const r = new MigrationRunner([mig(1, 'a')], store, clock);
    await r.migrate(ctx);
    r.register(mig(2, 'b'));
    const r2 = await r.migrate(ctx);
    expect(r2.batch).toBe(2);
    expect(store.batch(2).map((x) => x.version)).toEqual([2]);
  });

  it('firing progress callbacks with running totals', async () => {
    const r = new MigrationRunner([mig(1, 'a'), mig(2, 'b')], store, clock);
    const seen: Array<[number, number]> = [];
    await r.migrate(ctx, { onProgress: (p) => seen.push([p.completed, p.total]) });
    expect(seen).toEqual([[1, 2], [2, 2]]);
  });

  it('failing migration marks record failed and aborts batch', async () => {
    const r = new MigrationRunner(
      [
        mig(1, 'a'),
        mig(2, 'bad', {
          up: () => {
            throw new Error('boom');
          },
        }),
        mig(3, 'c'),
      ],
      store,
      clock
    );
    const report = await r.migrate(ctx);
    expect(report.results.map((x) => x.status)).toEqual(['applied', 'failed']);
    expect(store.get(2)?.status).toBe(MigrationStatus.Failed);
    expect(store.get(3)).toBeUndefined();
  });

  it('honors limit and target', async () => {
    const r = new MigrationRunner([mig(1, 'a'), mig(2, 'b'), mig(3, 'c')], store, clock);
    const r1 = await r.migrate(ctx, { limit: 2 });
    expect(r1.results).toHaveLength(2);
    const r2 = await r.migrate(ctx, { target: 3 });
    expect(r2.results.map((x) => x.version)).toEqual([3]);
  });
});

// ---------------------------------------------------------------------------
// Checksums — edited migration detection
// ---------------------------------------------------------------------------

describe('checksum verification', () => {
  it('detects edited migration body', async () => {
    const r = new MigrationRunner([mig(1, 'a')], store, clock);
    await r.migrate(ctx);
    // Re-register a *changed* body under the same name+version.
    const edited = mig(1, 'a');
    edited.up = (c) => {
      c.execute('-- different');
      c.state.set('v1', 'edited');
    };
    r.register(edited);
    expect(r.verifyChecksums()).toEqual([1]);
    await expect(r.migrate(ctx)).rejects.toThrow(/edited since apply/);
    // …but ignoreChecksums bypasses
    const rep = await r.migrate(ctx, { ignoreChecksums: true });
    expect(rep.results).toHaveLength(0); // still nothing pending
  });

  it('plan() warns about checksum mismatch when ignored', async () => {
    const r = new MigrationRunner([mig(1, 'a')], store, clock);
    await r.migrate(ctx);
    const edited = mig(1, 'a');
    edited.up = (c) => void c.state.set('x', 1);
    r.register(edited);
    r.register(mig(2, 'b'));
    const plan = r.plan({ ignoreChecksums: true });
    expect(plan.warnings.some((w) => w.includes('checksum mismatch'))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Rollback — reversibility + data-loss gating
// ---------------------------------------------------------------------------

describe('rollback()', () => {
  it('reverts the latest batch only', async () => {
    const r = new MigrationRunner([mig(1, 'a'), mig(2, 'b')], store, clock);
    await r.migrate(ctx);
    r.register(mig(3, 'c'));
    await r.migrate(ctx); // batch 2 = [3]
    const rep = await r.rollback(ctx);
    expect(rep.results.map((x) => x.version)).toEqual([3]);
    expect(store.get(3)?.status).toBe(MigrationStatus.Reverted);
    expect(store.get(1)?.status).toBe(MigrationStatus.Applied);
  });

  it('irreversible migrations are skipped with reason', async () => {
    const r = new MigrationRunner(
      [mig(1, 'a', { down: undefined, reversible: false })],
      store,
      clock
    );
    await r.migrate(ctx);
    const rep = await r.rollback(ctx);
    expect(rep.results[0]?.status).toBe('skipped');
    expect(rep.results[0]?.error).toContain('irreversible');
  });

  it('destructive migrations require allowDataLoss', async () => {
    const r = new MigrationRunner([mig(1, 'a', { destructive: true })], store, clock);
    await r.migrate(ctx);
    const blocked = await r.rollback(ctx);
    expect(blocked.results[0]?.status).toBe('skipped');
    expect(blocked.results[0]?.error).toContain('allowDataLoss');
    const allowed = await r.rollback(ctx, { allowDataLoss: true });
    expect(allowed.results[0]?.status).toBe('applied');
  });

  it('rollback to target version', async () => {
    const r = new MigrationRunner([mig(1, 'a'), mig(2, 'b'), mig(3, 'c')], store, clock);
    await r.migrate(ctx);
    const rep = await r.rollback(ctx, { target: 1 });
    expect(rep.results.map((x) => x.version)).toEqual([3, 2]);
    expect(store.applied().map((x) => x.version)).toEqual([1]);
  });

  it('throws when nothing to revert', async () => {
    const r = new MigrationRunner([mig(1, 'a')], store, clock);
    await expect(r.rollback(ctx)).rejects.toThrow(/nothing to revert/);
  });
});

// ---------------------------------------------------------------------------
// Dry run
// ---------------------------------------------------------------------------

describe('dryRun()', () => {
  it('collects SQL without mutating history or context', async () => {
    const r = new MigrationRunner(
      [mig(1, 'a'), mig(2, 'b', { destructive: true })],
      store,
      clock
    );
    const rep = await r.dryRun(ctx);
    expect(rep.dryRun).toBe(true);
    expect(rep.sql).toContain('-- v1 a up');
    expect(rep.warnings.some((w) => w.includes('destructive'))).toBe(true);
    expect(store.all()).toHaveLength(0);
    expect(ctx.state.has('v1')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Conflict detection
// ---------------------------------------------------------------------------

describe('ConflictDetector', () => {
  it('flags orphan applied migrations', async () => {
    const r = new MigrationRunner([mig(1, 'a')], store, clock);
    await r.migrate(ctx);
    // New runner doesn't know about v1 but does know v2
    const declared = [mig(2, 'b')];
    const report = ConflictDetector.analyze(declared, store);
    expect(report.conflicts.some((c) => c.kind === 'orphan' && c.version === 1)).toBe(true);
  });

  it('flags out-of-order pending below head', async () => {
    const r = new MigrationRunner([mig(3, 'c')], store, clock);
    await r.migrate(ctx); // head = 3
    const declared = [mig(1, 'late'), mig(3, 'c')];
    const report = ConflictDetector.analyze(declared, store);
    expect(report.conflicts.some((c) => c.kind === 'out_of_order' && c.version === 1)).toBe(true);
  });

  it('flags branch divergence at same version', async () => {
    const applied = mig(1, 'a', { branch: 'feature-x' });
    const r = new MigrationRunner([applied], store, clock);
    await r.migrate(ctx);
    const declared = [mig(1, 'a', { branch: 'feature-y' })];
    const div = ConflictDetector.branchDivergence(declared, store);
    expect(div).toHaveLength(1);
    expect(div[0]?.message).toContain('feature-x');
  });
});

// ---------------------------------------------------------------------------
// Squashing
// ---------------------------------------------------------------------------

describe('squash()', () => {
  it('collapses applied range into one migration', async () => {
    const r = new MigrationRunner([mig(1, 'a'), mig(2, 'b'), mig(3, 'c')], store, clock);
    await r.migrate(ctx);
    const squashed = r.squash(1, 3, 'baseline');
    expect(squashed.version).toBe(3);
    expect(store.applied().map((x) => x.version)).toEqual([3]);
    expect(store.get(3)?.name).toContain('squashed');
    // The squashed migration replays all three ups.
    const fresh = createContext();
    await squashed.up(fresh);
    expect(fresh.state.get('v1')).toBe(true);
    expect(fresh.state.get('v3')).toBe(true);
  });

  it('rejects ranges with unapplied members', async () => {
    const r = new MigrationRunner([mig(1, 'a'), mig(2, 'b'), mig(4, 'd')], store, clock);
    await r.migrate(ctx, { target: 2 });
    expect(() => r.squash(1, 4, 'x')).toThrow(MigrationError);
  });
});

// ---------------------------------------------------------------------------
// Direction enum sanity
// ---------------------------------------------------------------------------

describe('enums', () => {
  it('direction + status values', () => {
    expect(MigrationDirection.Up).toBe('up');
    expect(MigrationDirection.Down).toBe('down');
    expect(MigrationStatus.Applied).toBe('applied');
  });
});
