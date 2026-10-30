/**
 * Materialized View Matching — rewrite a query to use an existing MV.
 *
 * Complements `engine/MaterializedView` (which manages MV *storage &
 * refresh*) — this module decides *when an MV can answer a query*:
 *
 *   - An MV definition is a logical signature: { groupBy[], aggregates[],
 *     sourceTables[], predicates[] }.
 *   - A query matches an MV when:
 *       1. MV's source tables ⊆ query tables.
 *       2. MV's groupBy ⊆ query groupBy (MV may group *finer* — the
 *          engine can roll up by re-aggregating; we flag `needsRollup`).
 *       3. MV computes every aggregate the query needs (by function+column).
 *       4. MV's predicates are implied by the query's (MV data is a
 *          superset — weaker or equal filter).
 *   - Cost win: estimated scanned rows shrink from base-table rows to
 *     MV rows (≈ group count). We pick the MV with the smallest estRows.
 *
 * @module DataWarehouse/Engine2
 */

import { QueryAst } from './QueryPlanner';
import { TableStats } from './ColumnStats';

export interface MvSignature {
  readonly name: string;
  readonly sourceTables: readonly string[];
  readonly groupBy: readonly string[];
  /** e.g. [{ fn: 'sum', column: 'revenue' }] */
  readonly aggregates: readonly { fn: string; column: string }[];
  /** Human-readable predicate keys the MV filtered on, e.g. 'region=US'. */
  readonly predicates: readonly string[];
  /** Rows actually stored in the MV — drives the cost estimate. */
  readonly rowCount: number;
}

export interface MvMatch {
  readonly mv: MvSignature;
  /** Extra aggregation needed on top of the MV. */
  readonly needsRollup: boolean;
  /** Estimated rows read vs. the base-table scan. */
  readonly estRows: number;
  readonly baseRows: number;
  /** estRows / baseRows — lower is better. */
  readonly saving: number;
  /** Why it matched (or nearly matched) — for EXPLAIN. */
  readonly reason: string;
}

/** Normalise a predicate to a canonical 'col op value' key. */
function predKey(column: string, op: string, value: unknown): string {
  return `${column} ${op} ${JSON.stringify(value)}`;
}

function flattenPredKeys(q: QueryAst): Set<string> {
  const keys = new Set<string>();
  const walk = (e: NonNullable<QueryAst['where']>) => {
    if (e.kind === 'pred') keys.add(predKey(e.pred.column, e.pred.op, e.pred.value));
    else e.children.forEach(walk);
  };
  if (q.where) walk(q.where);
  return keys;
}

export class MvMatcher {
  private readonly mvs: MvSignature[] = [];

  constructor(private readonly stats?: ReadonlyMap<string, TableStats>) {}

  registerMv(mv: MvSignature): void {
    this.mvs.push(mv);
  }

  removeMv(name: string): boolean {
    const i = this.mvs.findIndex((m) => m.name === name);
    if (i < 0) return false;
    this.mvs.splice(i, 1);
    return true;
  }

  /** All MVs that can satisfy the query, best saving first. */
  match(q: QueryAst): readonly MvMatch[] {
    const baseRows = this.baseRows(q);
    const out: MvMatch[] = [];
    for (const mv of this.mvs) {
      const m = this.tryMatch(q, mv, baseRows);
      if (m) out.push(m);
    }
    return out.sort((a, b) => a.saving - b.saving);
  }

  /** Best match or null. */
  best(q: QueryAst): MvMatch | null {
    return this.match(q)[0] ?? null;
  }

  /** Rewrite: returns the query to run against the MV, or null. */
  rewrite(q: QueryAst): { mvName: string; rollupGroupBy: string[] } | null {
    const best = this.best(q);
    if (!best) return null;
    return {
      mvName: best.mv.name,
      rollupGroupBy: [...(q.groupBy ?? [])],
    };
  }

  /* ------------------------------------------------------------------ */

  private baseRows(q: QueryAst): number {
    let n = this.stats?.get(q.table)?.rowCount ?? 1000;
    for (const j of q.joins) n += this.stats?.get(j.table)?.rowCount ?? 1000;
    return n;
  }

  private tryMatch(q: QueryAst, mv: MvSignature, baseRows: number): MvMatch | null {
    // 1. MV source tables ⊆ query tables.
    const qTables = new Set([q.table, ...q.joins.map((j) => j.table)]);
    if (!mv.sourceTables.every((t) => qTables.has(t))) return null;

    // 2. Query groupBy must ⊆ MV groupBy — the MV can be *finer*
    //    grained; the engine rolls up by re-aggregating.
    const qGroup = new Set(q.groupBy ?? []);
    const mvGroup = new Set(mv.groupBy);
    if (![...qGroup].every((g) => mvGroup.has(g))) return null;
    const needsRollup = qGroup.size < mvGroup.size;

    // 3. Every query aggregate must exist in the MV.
    const mvAggs = new Set(mv.aggregates.map((a) => `${a.fn}(${a.column})`));
    const qAggs = (q.select ?? [])
      .map((s) => s.match(/^(\w+)\((\w+)\)$/))
      .filter((m): m is RegExpMatchArray => m !== null)
      .map((m) => `${m[1]}(${m[2]})`);
    if (!qAggs.every((a) => mvAggs.has(a))) return null;

    // 4. MV predicates must be implied by the query's (MV ⊆ query scope).
    const qPredKeys = flattenPredKeys(q);
    if (!mv.predicates.every((p) => qPredKeys.has(p))) return null;

    return {
      mv,
      needsRollup,
      estRows: mv.rowCount,
      baseRows,
      saving: baseRows > 0 ? mv.rowCount / baseRows : 1,
      reason: `MV '${mv.name}' covers groupBy+aggregates; reads ${mv.rowCount} rows vs ${baseRows}`,
    };
  }
}
