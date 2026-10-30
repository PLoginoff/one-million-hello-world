/**
 * SnapshotDiffer — field-level diffing between two restored snapshots.
 *
 * Where `SnapshotManager` answers "which storage blocks changed",
 * the differ answers the question operators actually ask:
 * "what, precisely, is different between snapshot A and snapshot B?"
 *
 * The differ materializes both snapshots through `restore()` and walks
 * the two key spaces:
 *
 *   - keys only in `from`   -> REMOVED
 *   - keys only in `to`     -> ADDED
 *   - keys in both          -> MODIFIED if values differ deeply
 *
 * Value comparison uses structural deep-equality on JSON-compatible
 * values. For MODIFIED object values the differ recurses field-by-field
 * so the report can point at `config.db.host` rather than just
 * "config changed".
 *
 * A similarity score summarizes churn:
 *
 *   score = unchanged / max(|from|, |to|)      (Jaccard-like, per key)
 *
 * @module SnapshotLayer/Engine2
 */

import { SnapshotManager } from '../implementations/SnapshotManager';
import type { StoredSnapshot } from '../implementations/SnapshotManager';

/** Classification of a single key-level change. */
export enum SnapshotChangeKind {
  ADDED = 'added',
  REMOVED = 'removed',
  MODIFIED = 'modified',
}

/** One differing key. */
export interface SnapshotKeyChange {
  readonly kind: SnapshotChangeKind;
  readonly key: string;
  /** Value in `from` (undefined for ADDED). */
  readonly before?: unknown;
  /** Value in `to` (undefined for REMOVED). */
  readonly after?: unknown;
  /** Nested field-level diffs for object-valued keys. */
  readonly fields?: FieldDiff[];
}

/** One differing field inside an object value. */
export interface FieldDiff {
  /** Dotted path, e.g. `db.pool.size`. */
  readonly path: string;
  readonly kind: SnapshotChangeKind;
  readonly before?: unknown;
  readonly after?: unknown;
}

/** Aggregate diff report between two snapshots. */
export interface SnapshotDiffReport {
  readonly fromId: string;
  readonly toId: string;
  /** `from` version < `to` version normally, but the differ accepts either order. */
  readonly fromVersion: number;
  readonly toVersion: number;
  readonly added: number;
  readonly removed: number;
  readonly modified: number;
  readonly unchanged: number;
  /** 0..1 — fraction of the union keyspace that did not change. */
  readonly similarity: number;
  /** True when no key-level differences exist. */
  readonly identical: boolean;
  readonly changes: SnapshotKeyChange[];
}

/** Options controlling diff output volume. */
export interface DiffOptions {
  /** Recurse into object values to produce `fields` (default true). */
  readonly deep?: boolean;
  /** Max recursion depth for field diffs (default 8). */
  readonly maxDepth?: number;
  /** Cap on returned changes (default Infinity — all). */
  readonly limit?: number;
}

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * Structural equality on JSON-compatible values.
 * Arrays compare element-wise; objects compare key sets + values.
 */
export function deepEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== typeof b) return false;
  if (a === null || b === null) return false;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b)) return false;
    if (a.length !== b.length) return false;
    return a.every((v, i) => deepEqual(v, b[i]));
  }
  if (isPlainObject(a) && isPlainObject(b)) {
    const ka = Object.keys(a);
    const kb = Object.keys(b);
    if (ka.length !== kb.length) return false;
    return ka.every((k) => k in b && deepEqual(a[k], b[k]));
  }
  return false;
}

/** Field-level diff of two object values, up to `maxDepth`. */
export function diffObjects(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  maxDepth = 8,
  prefix = '',
): FieldDiff[] {
  const out: FieldDiff[] = [];
  const walk = (a: Record<string, unknown>, b: Record<string, unknown>, path: string, depth: number): void => {
    for (const key of Object.keys(a)) {
      const p = path ? `${path}.${key}` : key;
      if (!(key in b)) {
        out.push({ path: p, kind: SnapshotChangeKind.REMOVED, before: a[key] });
        continue;
      }
      const va = a[key];
      const vb = b[key];
      if (deepEqual(va, vb)) continue;
      if (depth < maxDepth && isPlainObject(va) && isPlainObject(vb)) {
        walk(va, vb, p, depth + 1);
      } else {
        out.push({ path: p, kind: SnapshotChangeKind.MODIFIED, before: va, after: vb });
      }
    }
    for (const key of Object.keys(b)) {
      if (!(key in a)) {
        const p = path ? `${path}.${key}` : key;
        out.push({ path: p, kind: SnapshotChangeKind.ADDED, after: b[key] });
      }
    }
  };
  walk(before, after, prefix, 0);
  return out;
}

/**
 * Diffs two snapshots stored in a `SnapshotManager`.
 * Stateless — a single differ instance serves any manager.
 *
 * `liveState` (optional) supplies the current live keyspace so
 * `diffSince()` can compare a snapshot against uncommitted writes.
 */
export class SnapshotDiffer {
  private readonly _manager: SnapshotManager;
  private readonly _liveState?: () => Map<string, unknown>;
  private readonly _liveVersion?: () => number;

  constructor(
    manager: SnapshotManager,
    liveState?: () => Map<string, unknown>,
    liveVersion?: () => number,
  ) {
    this._manager = manager;
    this._liveState = liveState;
    this._liveVersion = liveVersion;
  }

  /**
   * Compute the full key-level diff between two snapshot ids.
   * O(|keys_from| + |keys_to|) restores plus O(union keys) compares.
   */
  diff(fromId: string, toId: string, options: DiffOptions = {}): SnapshotDiffReport {
    const fromSnap = this._manager.get(fromId);
    const toSnap = this._manager.get(toId);
    const from = this._manager.restore(fromId);
    const to = this._manager.restore(toId);
    return this.diffMaps(fromSnap, toSnap, from, to, options);
  }

  /**
   * Diff two already-materialized maps — useful when one side is live
   * state rather than a snapshot (e.g. "what would a snapshot capture now").
   */
  diffMaps(
    fromSnap: Pick<StoredSnapshot, 'id' | 'version'>,
    toSnap: Pick<StoredSnapshot, 'id' | 'version'>,
    from: Map<string, unknown>,
    to: Map<string, unknown>,
    options: DiffOptions = {},
  ): SnapshotDiffReport {
    const deep = options.deep ?? true;
    const maxDepth = options.maxDepth ?? 8;
    const limit = options.limit ?? Number.POSITIVE_INFINITY;

    const changes: SnapshotKeyChange[] = [];
    let added = 0;
    let removed = 0;
    let modified = 0;
    let unchanged = 0;

    for (const [key, before] of from) {
      if (!to.has(key)) {
        removed++;
        if (changes.length < limit) {
          changes.push({ kind: SnapshotChangeKind.REMOVED, key, before });
        }
        continue;
      }
      const after = to.get(key);
      if (deepEqual(before, after)) {
        unchanged++;
        continue;
      }
      modified++;
      if (changes.length < limit) {
        const fields =
          deep && isPlainObject(before) && isPlainObject(after)
            ? diffObjects(before, after, maxDepth, key)
            : undefined;
        changes.push({ kind: SnapshotChangeKind.MODIFIED, key, before, after, fields });
      }
    }
    for (const [key, after] of to) {
      if (!from.has(key)) {
        added++;
        if (changes.length < limit) {
          changes.push({ kind: SnapshotChangeKind.ADDED, key, after });
        }
      }
    }

    const union = added + removed + modified + unchanged;
    const similarity = union === 0 ? 1 : unchanged / union;

    return {
      fromId: fromSnap.id,
      toId: toSnap.id,
      fromVersion: fromSnap.version,
      toVersion: toSnap.version,
      added,
      removed,
      modified,
      unchanged,
      similarity,
      identical: added === 0 && removed === 0 && modified === 0,
      changes,
    };
  }

  /**
   * Diff a snapshot against the CURRENT live state — answers
   * "what changed since this snapshot was taken". Requires the
   * `liveState` accessor passed at construction; falls back to the
   * most recent snapshot when no accessor is provided.
   */
  diffSince(snapshotId: string, options: DiffOptions = {}): SnapshotDiffReport {
    const snap = this._manager.get(snapshotId);
    const then = this._manager.restore(snapshotId);
    if (this._liveState) {
      const live = this._liveState();
      const pseudo = { id: '<live>', version: this._liveVersion?.() ?? snap.version };
      return this.diffMaps(snap, pseudo, then, live, options);
    }
    const tip = this._manager.list().at(-1);
    const liveMap = tip ? this._manager.restore(tip.id) : new Map<string, unknown>();
    const pseudo = { id: tip?.id ?? '<empty>', version: tip?.version ?? snap.version };
    return this.diffMaps(snap, pseudo, then, liveMap, options);
  }

  /**
   * Render the report as a compact unified-style listing — handy for
   * CLI output and log lines.
   */
  static format(report: SnapshotDiffReport): string {
    const lines: string[] = [
      `diff ${report.fromId} (v${report.fromVersion}) -> ${report.toId} (v${report.toVersion})`,
      `  +${report.added} -${report.removed} ~${report.modified} =${report.unchanged}  similarity=${(report.similarity * 100).toFixed(1)}%`,
    ];
    for (const c of report.changes) {
      switch (c.kind) {
        case SnapshotChangeKind.ADDED:
          lines.push(`  + ${c.key} = ${JSON.stringify(c.after)}`);
          break;
        case SnapshotChangeKind.REMOVED:
          lines.push(`  - ${c.key} = ${JSON.stringify(c.before)}`);
          break;
        case SnapshotChangeKind.MODIFIED:
          if (c.fields && c.fields.length > 0) {
            lines.push(`  ~ ${c.key} (${c.fields.length} field${c.fields.length === 1 ? '' : 's'})`);
            for (const f of c.fields) {
              lines.push(`      ${f.kind === SnapshotChangeKind.REMOVED ? '-' : f.kind === SnapshotChangeKind.ADDED ? '+' : '~'} ${f.path}: ${JSON.stringify(f.before)} -> ${JSON.stringify(f.after)}`);
            }
          } else {
            lines.push(`  ~ ${c.key}: ${JSON.stringify(c.before)} -> ${JSON.stringify(c.after)}`);
          }
          break;
      }
    }
    return lines.join('\n');
  }
}
