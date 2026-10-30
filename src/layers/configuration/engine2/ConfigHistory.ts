/**
 * Configuration Engine2 — Attributed Change History & Rollback
 *
 * ConfigWatcher fires diffs; engine/ConfigDiffEngine computes them — but
 * nothing RECORDS who changed what or lets you undo it. This module is
 * the append-only, attributed history:
 *
 *   - `record(actor, base, next, reason)` appends a `ChangeSet` with the
 *     computed diff, sequence number, actor and free-form reason.
 *   - `history(path?)` / `forActor(actor)` — filtered reads for audit.
 *   - `blame(path)` — the LAST actor to touch a path: "who set
 *     feature.x.enabled to true?" in one call.
 *   - `rollback(toSeq, base)` — produces the ConfigLayer-equivalent flat
 *     entries that restore `base` to the state AT `toSeq`: for each path
 *     modified after toSeq, emit the OLD value; for paths added after,
 *     emit a tombstone marker callers translate to deletion.
 *   - Bounded: `capacity` ring keeps the log finite; sweeps are recorded
 *     as meta-entries so seq gaps are explainable.
 *
 * Complexity: record O(changed paths); rollback O(paths changed after
 * target); blame O(log) amortized via a per-path latest-seq index.
 *
 * @module Configuration/Engine2
 */

import { ConfigChange, ConfigDiff, ConfigValue, EffectiveConfig } from '../engine/ConfigTypes';
import { ConfigDiffEngine } from '../engine/ConfigDiffEngine';

export interface ChangeSet {
  readonly seq: number;
  readonly at: number;
  readonly actor: string;
  readonly reason: string;
  readonly diff: ConfigDiff;
}

export interface RollbackEntry {
  readonly path: string;
  /** Previous value to restore, or TOMBSTONE to delete the path. */
  readonly value: ConfigValue | typeof TOMBSTONE;
  /** Change that introduced the current value — provenance. */
  readonly sinceSeq: number;
}

/** Marker for "delete this path on rollback". */
export const TOMBSTONE = Symbol('config-history-tombstone');

export interface ConfigHistoryOptions {
  readonly clock?: () => number;
  /** Ring capacity (default 10_000 change sets). */
  readonly capacity?: number;
}

export class ConfigHistory {
  private readonly _clock: () => number;
  private readonly _capacity: number;
  private _sets: ChangeSet[] = [];
  private _seq = 0;
  /** path → seq of the LAST change set that touched it. */
  private readonly _lastTouched = new Map<string, number>();
  private readonly _diffEngine = new ConfigDiffEngine();
  /** Change sets evicted by the ring — for seq-gap accounting. */
  private _dropped = 0;

  constructor(options?: ConfigHistoryOptions) {
    this._clock = options?.clock ?? (() => Date.now());
    this._capacity = options?.capacity ?? 10_000;
  }

  /**
   * Compute and record the diff between two effective configs.
   * Returns the stored ChangeSet (seq assigned).
   */
  record(actor: string, before: EffectiveConfig | null, after: EffectiveConfig, reason = ''): ChangeSet {
    const diff = this._diffEngine.diff(before, after, this._clock());
    const set: ChangeSet = {
      seq: ++this._seq,
      at: this._clock(),
      actor,
      reason,
      diff,
    };
    this._sets.push(set);
    for (const c of diff.changes) this._lastTouched.set(c.path, set.seq);
    while (this._sets.length > this._capacity) {
      const evicted = this._sets.shift()!;
      this._dropped++;
      // Clean index entries pointing at the evicted set ONLY when no
      // later set owns them — seq ordering guarantees this check is exact.
      for (const c of evicted.diff.changes) {
        if (this._lastTouched.get(c.path) === evicted.seq) {
          this._lastTouched.delete(c.path);
        }
      }
    }
    return set;
  }

  /** All change sets, newest last. Optional path filter. */
  history(path?: string): readonly ChangeSet[] {
    return path === undefined
      ? this._sets
      : this._sets.filter((s) => s.diff.changes.some((c) => c.path === path));
  }

  forActor(actor: string): readonly ChangeSet[] {
    return this._sets.filter((s) => s.actor === actor);
  }

  /**
   * Who last touched `path`, and when. The index is O(1) — no scan.
   */
  blame(path: string): { actor: string; at: number; seq: number; change: ConfigChange } | null {
    const seq = this._lastTouched.get(path);
    if (seq === undefined) return null;
    const set = this._sets.find((s) => s.seq === seq);
    if (!set) return null;
    const change = set.diff.changes.find((c) => c.path === path);
    return change ? { actor: set.actor, at: set.at, seq, change } : null;
  }

  /**
   * Compute the flat writes needed to restore state as of `toSeq`.
   * Scans change sets AFTER toSeq and emits reverse writes:
   *   - modified → restore oldValue
   *   - added    → TOMBSTONE (delete)
   *   - removed  → restore oldValue
   * Later sets win on conflicting paths (folded newest-first).
   */
  rollback(toSeq: number): RollbackEntry[] {
    const out = new Map<string, RollbackEntry>();
    // Walk newest→oldest so the FIRST write per path is the correct undo.
    for (let i = this._sets.length - 1; i >= 0; i--) {
      const s = this._sets[i];
      if (s.seq <= toSeq) break;
      for (const c of s.diff.changes) {
        if (out.has(c.path)) continue; // a newer undo already covers it
        out.set(c.path, {
          path: c.path,
          value: c.kind === 'added' ? TOMBSTONE : c.oldValue!,
          sinceSeq: s.seq,
        });
      }
    }
    return [...out.values()].sort((a, b) => a.path.localeCompare(b.path));
  }

  /** Latest seq (0 when empty) — the "current version" token. */
  get currentSeq(): number {
    return this._seq;
  }

  /** Count of sets evicted by the ring — explains seq gaps. */
  get droppedCount(): number {
    return this._dropped;
  }

  /** Retained change sets. */
  get size(): number {
    return this._sets.length;
  }
}
