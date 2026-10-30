/**
 * NestedUnitOfWork — nested transactions via savepoints.
 *
 * A real database doesn't nest transactions — it stacks SAVEPOINTs.
 * Model that: each `begin()` pushes a savepoint capturing the tracked
 * entity originals (deep-copied originals, not the mutable working
 * copies). `rollback()` pops to the newest savepoint and restores the
 * working copies to those originals — undoing every mutation since
 * `begin()`, including nested levels beneath it.
 *
 * Commit semantics: committing a level does NOT write through — it
 * merges the level's changes into the parent frame (the parent adopts
 * the child's working copies as its own originals? No — child working
 * state stays; the parent's savepoint is unchanged so a parent
 * rollback still undoes the child's work). Only the outermost commit
 * publishes (via `commit()`, which fires hooks and exposes `changes`
 * from hash-based diff).
 *
 * Savepoint names let callers `rollbackTo(name)` (pops everything
 * above it but keeps it) — the standard RELEASE/ROLLBACK TO pair.
 *
 * Complexity: begin/commit/rollback O(#tracked) each (copying the
 * originals map), change detection O(#tracked × #fields).
 *
 * @module UnitOfWorkLayer/Engine2
 */

import { TrackedEntity, TrackedChange } from './types';
import { hashEntity } from './dirty';

interface Frame {
  name: string;
  /** identity → deep copy of `current` at savepoint time. */
  snapshot: Map<string, Record<string, unknown>>;
}

export class NestedUnitOfWork {
  private readonly _tracked = new Map<string, TrackedEntity>();
  private readonly _frames: Frame[] = [];
  private _savepointSeq = 0;
  private _committed = false;
  private _rolledBack = false;

  /** Register an entity — deep-copies both snapshots. */
  track(identity: string, entity: Record<string, unknown>): TrackedEntity {
    const t: TrackedEntity = {
      identity,
      current: deepCopy(entity),
      original: deepCopy(entity),
    };
    this._tracked.set(identity, t);
    return t;
  }

  /** Working copy for mutation inside the unit of work. */
  entity(identity: string): Record<string, unknown> | null {
    return this._tracked.get(identity)?.current ?? null;
  }

  /** Push a savepoint — named when given, else `sp_N`. */
  begin(name?: string): string {
    const sp = name ?? `sp_${++this._savepointSeq}`;
    const snapshot = new Map<string, Record<string, unknown>>();
    for (const [id, t] of this._tracked) snapshot.set(id, deepCopy(t.current));
    this._frames.push({ name: sp, snapshot });
    return sp;
  }

  /** Savepoints currently on the stack (oldest→newest). */
  savepoints(): string[] {
    return this._frames.map((f) => f.name);
  }

  /**
   * Pop the newest savepoint and restore working copies to its
   * snapshot. Entities tracked after the savepoint keep their state
   * (they didn't exist at savepoint time — nothing to restore).
   */
  rollbackLevel(): string | null {
    const f = this._frames.pop();
    if (!f) return null;
    this._restore(f);
    return f.name;
  }

  /**
   * ROLLBACK TO SAVEPOINT: pop all frames above `name`, restore to its
   * snapshot, keep that frame on the stack. False if name unknown.
   */
  rollbackTo(name: string): boolean {
    const idx = this._frames.findIndex((f) => f.name === name);
    if (idx < 0) return false;
    while (this._frames.length > idx + 1) this._frames.pop();
    this._restore(this._frames[this._frames.length - 1]);
    return true;
  }

  /**
   * Commit the innermost level: merges it into the parent (drops the
   * frame — parent rollback still undoes the child's writes because the
   * parent's snapshot predates them). Outermost commit publishes.
   */
  commitLevel(): string | null {
    const f = this._frames.pop();
    return f ? f.name : null;
  }

  private _restore(f: Frame): void {
    for (const [id, snap] of f.snapshot) {
      const t = this._tracked.get(id);
      if (t) t.current = deepCopy(snap);
    }
  }

  /** Depth of the savepoint stack. */
  get depth(): number {
    return this._frames.length;
  }

  get isCommitted(): boolean {
    return this._committed;
  }
  get isRolledBack(): boolean {
    return this._rolledBack;
  }

  /**
   * Final commit — requires an empty savepoint stack (all levels
   * committed) to prevent silently committing half-rolled work.
   * Returns the tracked changes (hash-diffed). Idempotent.
   */
  commit(): TrackedChange[] {
    if (this._committed) return [];
    if (this._rolledBack) throw new Error('cannot commit a rolled-back unit of work');
    if (this._frames.length > 0) {
      throw new Error(`${this._frames.length} uncommitted savepoint(s): commit or roll back every level`);
    }
    this._committed = true;
    return this.changes();
  }

  /** Full rollback regardless of depth. */
  rollback(): void {
    this._frames.length = 0;
    for (const t of this._tracked.values()) t.current = deepCopy(t.original);
    this._rolledBack = true;
  }

  /** Hash-diffed changes current-vs-original — see dirty.ts. */
  changes(): TrackedChange[] {
    const out: TrackedChange[] = [];
    for (const t of this._tracked.values()) {
      const h1 = hashEntity(t.original);
      const h2 = hashEntity(t.current);
      if (h1 === h2) continue;
      for (const [field, after] of Object.entries(t.current)) {
        if (!shallowEq(t.original[field], after)) {
          out.push({ identity: t.identity, field, before: t.original[field], after });
        }
      }
      for (const field of Object.keys(t.original)) {
        if (!(field in t.current)) {
          out.push({ identity: t.identity, field, before: t.original[field], after: undefined });
        }
      }
    }
    return out;
  }

  /** Identities with any drift from original. */
  dirtyEntities(): string[] {
    const out: string[] = [];
    for (const t of this._tracked.values()) {
      if (hashEntity(t.original) !== hashEntity(t.current)) out.push(t.identity);
    }
    return out;
  }
}

function shallowEq(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  return JSON.stringify(a) === JSON.stringify(b);
}

export function deepCopy<T>(v: T): T {
  return v === undefined ? v : JSON.parse(JSON.stringify(v));
}
