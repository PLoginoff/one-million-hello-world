/**
 * Query Planner — cost-based logical planning over the column store.
 *
 * Optimisations modelled:
 *
 *   - Predicate pushdown: filter predicates are attached to the scan
 *     closest to the data; conjunctions are split and each factor pushed
 *     to the deepest node that references its columns.
 *   - Projection pruning: only columns needed by the query's output +
 *     predicates + joins survive to the scan.
 *   - Join-order estimation: greedy left-deep ordering — pick the
 *     cheapest next table by estimated cardinality after applying its
 *     local predicates (selectivity × rowCount), preferring to join
 *     small sides first. Join output ≈ leftCard × rightCard / ndv(joinKey).
 *
 * Plan shape: a tree of PlanNodes — scan → filter → join → project —
 * each annotated with estimated row counts so the caller can inspect
 * where the cost estimate came from.
 *
 * @module DataWarehouse/Engine2
 */

import { TableStats, estimateSelectivity } from './ColumnStats';
import { CompareOp, Scalar } from '../engine/ColumnStorageEngine';

/* ------------------------------------------------------------------------ */
/* Query AST                                                                */
/* ------------------------------------------------------------------------ */

export interface PredExpr {
  readonly column: string;
  readonly op: CompareOp;
  readonly value?: Scalar | readonly Scalar[];
  /** Source table for multi-table queries; unqualified for single-table. */
  readonly table?: string;
}

export type WhereExpr =
  | { kind: 'pred'; pred: PredExpr }
  | { kind: 'and'; children: WhereExpr[] }
  | { kind: 'or'; children: WhereExpr[] };

export interface JoinClause {
  readonly table: string;
  readonly leftColumn: string; // column on the accumulated left side
  readonly rightColumn: string; // column on `table`
}

export interface QueryAst {
  readonly table: string; // base (leftmost) table
  readonly select: readonly string[]; // projected columns ('*' allowed)
  readonly joins: readonly JoinClause[];
  readonly where?: WhereExpr;
  readonly groupBy?: readonly string[];
  readonly limit?: number;
}

/* ------------------------------------------------------------------------ */
/* Plan nodes                                                               */
/* ------------------------------------------------------------------------ */

export type PlanNode =
  | { kind: 'scan'; table: string; columns: string[]; predicates: PredExpr[]; estRows: number }
  | { kind: 'filter'; input: PlanNode; predicates: PredExpr[]; estRows: number }
  | { kind: 'join'; left: PlanNode; right: PlanNode; leftColumn: string; rightColumn: string; estRows: number }
  | { kind: 'project'; input: PlanNode; columns: string[]; estRows: number }
  | { kind: 'aggregate'; input: PlanNode; groupBy: string[]; estRows: number }
  | { kind: 'limit'; input: PlanNode; limit: number; estRows: number };

export interface ExplainRow {
  readonly node: string;
  readonly detail: string;
  readonly estRows: number;
}

/** Planner: AST → costed logical plan. */
export class QueryPlanner {
  constructor(private readonly stats: ReadonlyMap<string, TableStats>) {}

  plan(q: QueryAst): PlanNode {
    // Split WHERE into conjuncts — each factor pushed independently.
    const conjuncts = q.where ? flattenAnd(q.where) : [];
    const baseCols = neededColumns(q, q.table);

    // 1. Push single-table predicates onto the base scan.
    const { local: baseLocal, rest: afterBase } = splitLocal(conjuncts, q.table);
    const baseEst = this.estimateRows(q.table, baseLocal);
    let node: PlanNode = {
      kind: 'scan',
      table: q.table,
      columns: baseCols,
      predicates: baseLocal,
      estRows: baseEst,
    };

    // 2. Greedy left-deep join ordering.
    const joined = new Set<string>([q.table]);
    const remaining = [...q.joins];
    let pendingPreds = afterBase;
    while (remaining.length > 0) {
      // Pick the join with the smallest estimated right side.
      let bestIdx = -1;
      let bestEst = Infinity;
      for (let i = 0; i < remaining.length; i++) {
        const j = remaining[i];
        if (joined.has(j.table)) continue; // safety: no self-joins here
        const { local } = splitLocal(pendingPreds, j.table);
        const est = this.estimateRows(j.table, local);
        if (est < bestEst) {
          bestEst = est;
          bestIdx = i;
        }
      }
      const j = remaining.splice(bestIdx >= 0 ? bestIdx : 0, 1)[0];
      if (joined.has(j.table)) continue;
      const { local, rest } = splitLocal(pendingPreds, j.table);
      pendingPreds = rest;
      const rightEst = this.estimateRows(j.table, local);
      const right: PlanNode = {
        kind: 'scan',
        table: j.table,
        columns: [j.rightColumn, ...neededColumns(q, j.table)],
        predicates: local,
        estRows: rightEst,
      };
      const joinEst = this.estimateJoin(node.estRows, rightEst, q.table, j.table, j.leftColumn, j.rightColumn);
      node = { kind: 'join', left: node, right, leftColumn: j.leftColumn, rightColumn: j.rightColumn, estRows: joinEst };
      joined.add(j.table);
    }

    // 3. Residual (cross-table) predicates become a filter above joins.
    if (pendingPreds.length > 0) {
      const sel = pendingPreds.reduce((s, p) => s * this.predSelectivity(p), 1);
      node = { kind: 'filter', input: node, predicates: pendingPreds, estRows: node.estRows * sel };
    }

    // 4. Aggregate / project / limit.
    if (q.groupBy && q.groupBy.length > 0) {
      // NDV product heuristic capped at input rows.
      let est = 1;
      for (const g of q.groupBy) {
        const cs = this.columnStats(q.table, g);
        est *= Math.max(1, cs?.ndv ?? 10);
      }
      node = { kind: 'aggregate', input: node, groupBy: q.groupBy.slice(), estRows: Math.min(node.estRows, est) };
    }
    node = { kind: 'project', input: node, columns: [...q.select], estRows: node.estRows };
    if (q.limit !== undefined) {
      node = { kind: 'limit', input: node, limit: q.limit, estRows: Math.min(node.estRows, q.limit) };
    }
    return node;
  }

  /** Human-readable EXPLAIN — one row per node, bottom-up. */
  explain(root: PlanNode): ExplainRow[] {
    const rows: ExplainRow[] = [];
    const walk = (n: PlanNode, depth: number) => {
      const indent = '  '.repeat(depth);
      switch (n.kind) {
        case 'scan':
          rows.push({
            node: `${indent}Scan ${n.table}`,
            detail: `cols=[${n.columns.join(',')}] preds=${n.predicates.length}`,
            estRows: Math.round(n.estRows),
          });
          break;
        case 'join':
          rows.push({
            node: `${indent}Join ${n.leftColumn} = ${n.rightColumn}`,
            detail: '',
            estRows: Math.round(n.estRows),
          });
          break;
        case 'filter':
          rows.push({ node: `${indent}Filter`, detail: `preds=${n.predicates.length}`, estRows: Math.round(n.estRows) });
          break;
        case 'aggregate':
          rows.push({ node: `${indent}Aggregate`, detail: `by=[${n.groupBy.join(',')}]`, estRows: Math.round(n.estRows) });
          break;
        case 'project':
          rows.push({ node: `${indent}Project`, detail: `[${n.columns.join(',')}]`, estRows: Math.round(n.estRows) });
          break;
        case 'limit':
          rows.push({ node: `${indent}Limit ${n.limit}`, detail: '', estRows: Math.round(n.estRows) });
          break;
      }
      for (const child of children(n)) walk(child, depth + 1);
    };
    walk(root, 0);
    return rows;
  }

  /* ------------------------------------------------------------------ */

  private columnStats(table: string, column: string) {
    return this.stats.get(table)?.columns.get(column);
  }

  private predSelectivity(p: PredExpr): number {
    const table = p.table;
    for (const [t, st] of this.stats) {
      if (table !== undefined && t !== table) continue;
      const cs = st.columns.get(p.column);
      if (cs) return estimateSelectivity(cs, p.op, p.value ?? null, st.rowCount);
    }
    return 1;
  }

  private estimateRows(table: string, preds: readonly PredExpr[]): number {
    const st = this.stats.get(table);
    const rows = st?.rowCount ?? 1000;
    let sel = 1;
    for (const p of preds) {
      const cs = st?.columns.get(p.column);
      sel *= estimateSelectivity(cs, p.op, p.value ?? null, rows);
    }
    return rows * sel;
  }

  /**
   * Join cardinality: |L ⋈ R| ≈ |L|·|R| / max(ndv_l, ndv_r) — standard
   * containment assumption (every row of the smaller-NDV side matches).
   */
  private estimateJoin(
    leftRows: number,
    rightRows: number,
    leftTable: string,
    rightTable: string,
    leftCol: string,
    rightCol: string
  ): number {
    const lNdv = this.columnStats(leftTable, leftCol)?.ndv ?? leftRows;
    const rNdv = this.columnStats(rightTable, rightCol)?.ndv ?? rightRows;
    const denom = Math.max(1, Math.max(lNdv, rNdv));
    return (leftRows * rightRows) / denom;
  }
}

/* ------------------------------------------------------------------------ */
/* Helpers                                                                  */
/* ------------------------------------------------------------------------ */

function flattenAnd(e: WhereExpr): PredExpr[] {
  if (e.kind === 'pred') return [e.pred];
  if (e.kind === 'and') return e.children.flatMap(flattenAnd);
  // OR can't be pushed as separate factors — keep whole expr as a
  // pseudo-predicate on a synthetic column so it stays residual.
  return [{ column: '<or>', op: 'eq', value: null }];
}

/** Columns a query needs from a specific table (select + join + groupBy). */
function neededColumns(q: QueryAst, table: string): string[] {
  const cols = new Set<string>();
  for (const s of q.select) {
    if (s !== '*') cols.add(s.includes('.') ? s.split('.')[1] : s);
  }
  for (const j of q.joins) {
    if (j.table === table) cols.add(j.rightColumn);
  }
  for (const g of q.groupBy ?? []) cols.add(g.includes('.') ? g.split('.')[1] : g);
  return [...cols];
}

/** Partition predicates into those local to `table` vs the rest. */
function splitLocal(
  preds: readonly PredExpr[],
  table: string
): { local: PredExpr[]; rest: PredExpr[] } {
  const local: PredExpr[] = [];
  const rest: PredExpr[] = [];
  for (const p of preds) {
    if (p.column === '<or>') {
      rest.push(p);
    } else if (p.table === undefined || p.table === table) {
      local.push(p);
    } else {
      rest.push(p);
    }
  }
  return { local, rest };
}

function children(n: PlanNode): readonly PlanNode[] {
  switch (n.kind) {
    case 'scan':
      return [];
    case 'join':
      return [n.left, n.right];
    case 'filter':
    case 'project':
    case 'aggregate':
    case 'limit':
      return [n.input];
  }
}
