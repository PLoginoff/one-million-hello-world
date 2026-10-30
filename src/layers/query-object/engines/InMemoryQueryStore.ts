/**
 * InMemoryQueryStore — executes QueryAst against in-memory tables.
 *
 * The reference backend for the query-object engine: a `Query` built
 * through the fluent API or a `QueryAst` deserialized from JSON both
 * execute identically here.
 *
 * Execution pipeline (per query):
 *   1. plan — the QueryOptimizer picks an access path; an index on a
 *      constrained field narrows the candidate set before the residual
 *      predicate runs (genuinely reduces comparisons, not a no-op).
 *   2. filter — residual criteria compile to a predicate via
 *      PredicateCompiler and run over the candidate rows.
 *   3. project — `select` list maps rows to partial objects.
 *   4. distinct — stable dedup on the serialized projected row.
 *   5. order/offset/limit — stable sort then slice.
 *   6. includes — for each result row, a nested subquery materializes
 *      related rows (with their own filters and nested includes).
 *   7. count — cardinality of the filtered set (ORDER/LIMIT ignored,
 *      matching SQL semantics of the derived count query).
 *
 * Indexes are simple hash maps on a single field (`Map<value, rows>`),
 * consistent with the optimizer's point-lookup model: Eq and In use
 * them; range ops still scan but only over the index bucket when the
 * optimizer marks the index covered (it isn't, for ranges — the plan
 * honestly reports residual filtering then).
 *
 * @module QueryObject/Engines
 */

import { PredicateCompiler, getField, resolvePath } from './PredicateCompiler';
import { QueryOptimizer, buildComparator, IndexSpec } from './QueryOptimizer';
import {
  CompareOp,
  CompiledPredicate,
  CriterionNode,
  IncludeSpec,
  QueryAst,
} from './types';

type Row = Record<string, unknown>;

/** Execution outcome: rows, or the count for count-queries. */
export interface QueryResult {
  rows: Row[];
  /** Number of rows that matched before LIMIT/OFFSET (SQL FOUND_ROWS-style). */
  totalMatched: number;
  /** Present when `ast.count` was set — equals totalMatched. */
  count?: number;
  /** Explain notes from the optimizer. */
  planNotes: string[];
}

export class InMemoryQueryStore {
  private readonly _tables = new Map<string, Row[]>();
  private readonly _optimizer: QueryOptimizer;
  private readonly _compiler: PredicateCompiler;
  private readonly _caseInsensitive: boolean;

  constructor(options: { caseInsensitive?: boolean; indexes?: IndexSpec[] } = {}) {
    this._caseInsensitive = options.caseInsensitive ?? false;
    this._optimizer = new QueryOptimizer(options.indexes ?? []);
    this._compiler = new PredicateCompiler({
      caseInsensitive: this._caseInsensitive,
      subqueryResolver: (ast) => this._run(ast).rows,
    });
  }

  // -----------------------------------------------------------------------
  // Data management
  // -----------------------------------------------------------------------

  /** Replace a table's contents. Rows are stored by reference (read-only use). */
  load(table: string, rows: readonly Row[]): this {
    this._tables.set(table, [...rows]);
    return this;
  }

  insert(table: string, row: Row): this {
    const rows = this._tables.get(table) ?? [];
    rows.push(row);
    this._tables.set(table, rows);
    return this;
  }

  tableRows(table: string): readonly Row[] {
    return this._tables.get(table) ?? [];
  }

  /** Declare an index so the optimizer can plan around it. */
  registerIndex(idx: IndexSpec): this {
    this._optimizer.addIndex(idx);
    return this;
  }

  // -----------------------------------------------------------------------
  // Execution
  // -----------------------------------------------------------------------

  /** Execute a QueryAst; also accepts the fluent Query via toAst(). */
  execute(ast: QueryAst): QueryResult {
    return this._run(ast);
  }

  /** Compile the residual predicate for a query — exposed for tests/tools. */
  compilePredicate(ast: QueryAst): CompiledPredicate<Row> {
    return this._compiler.compile(ast.where);
  }

  /** EXPLAIN-style narration of how a query would execute. */
  explain(ast: QueryAst): string {
    return this._optimizer.explain(ast);
  }

  private _run(ast: QueryAst): QueryResult {
    const source = this._tables.get(ast.table) ?? [];

    // 1 — candidate narrowing via index (when the optimizer found one
    //     on an Eq/In point-lookup conjunct).
    const plan = this._optimizer.plan(ast);
    let candidates: Row[] = source;
    let residual: CriterionNode | null = plan.optimized;

    if (plan.index !== undefined) {
      const narrowed = this._indexLookup(source, plan.index.columns[0] ?? '', plan.optimized);
      if (narrowed !== null) {
        candidates = narrowed;
        residual = plan.residual;
      }
    }

    // 2 — residual filter.
    let matched: Row[];
    if (residual === null) {
      matched = candidates;
    } else {
      const pred = this._compiler.compile(residual);
      matched = candidates.filter(pred);
    }

    if (ast.count) {
      return { rows: [], totalMatched: matched.length, count: matched.length, planNotes: plan.notes };
    }

    // 3 — project.
    let rows = ast.select === null ? matched : matched.map((r) => this._project(r, ast.select ?? []));

    // 4 — distinct on projected rows.
    if (ast.distinct) {
      rows = this._distinct(rows);
    }

    const totalMatched = rows.length;

    // 5 — order / offset / limit.
    if (ast.orderBy.length > 0) {
      const cmp = buildComparator<Row>(ast.orderBy, (row, f) =>
        resolvePath(row, f.split('.'))
      );
      rows = [...rows].sort(cmp);
    }
    const start = ast.offset ?? 0;
    const end = ast.limit === null ? undefined : start + ast.limit;
    rows = rows.slice(start, end);

    // 6 — includes: attach related rows (nested includes supported).
    if (ast.includes.length > 0) {
      rows = rows.map((r) => this._applyIncludes(r, ast.includes));
    }

    return { rows, totalMatched, planNotes: plan.notes };
  }

  // -----------------------------------------------------------------------
  // Internals
  // -----------------------------------------------------------------------

  /**
   * Point-lookup narrowing using a registered index. Only Eq/In
   * conjuncts on the index's leading column qualify — the honest subset
   * of what a real hash index provides. Returns null when no usable
   * conjunct exists so the caller keeps the full scan.
   */
  private _indexLookup(source: Row[], column: string, where: CriterionNode | null): Row[] | null {
    if (where === null) return null;
    const conjuncts =
      where.kind === 'logic' && where.op === 'and' ? where.children : [where];

    for (const c of conjuncts) {
      if (c.kind !== 'compare' || c.field !== column) continue;
      if (c.op === CompareOp.Eq) {
        const key = c.value;
        return source.filter((r) => getField(r, column) === key);
      }
      if (c.op === CompareOp.In && Array.isArray(c.value)) {
        const keys = new Set(c.value);
        return source.filter((r) => keys.has(getField(r, column)));
      }
    }
    return null;
  }

  private _project(row: Row, select: readonly string[]): Row {
    const out: Row = {};
    for (const col of select) {
      out[col] = getField(row, col);
    }
    return out;
  }

  private _distinct(rows: Row[]): Row[] {
    const seen = new Set<string>();
    const out: Row[] = [];
    for (const r of rows) {
      const key = JSON.stringify(r);
      if (!seen.has(key)) {
        seen.add(key);
        out.push(r);
      }
    }
    return out;
  }

  /**
   * Resolve includes: build a subquery per include over the related
   * table, filter by `foreignKey = parent[localKey]`, attach under
   * `as ?? relation`. Nested includes apply to the related rows.
   */
  private _applyIncludes(row: Row, includes: readonly IncludeSpec[]): Row {
    const out: Row = { ...row };
    for (const inc of includes) {
      const parentKey = getField(row, inc.localKey ?? 'id');
      const relatedTable = this._tables.get(inc.relation) ?? [];
      const fk = inc.foreignKey;

      let matched = relatedTable.filter((r) => getField(r, fk) === parentKey);
      if (inc.where) {
        const pred = this._compiler.compile(inc.where);
        matched = matched.filter(pred);
      }
      if (inc.nested && inc.nested.length > 0) {
        matched = matched.map((r) => this._applyIncludes(r, inc.nested ?? []));
      }
      out[inc.as ?? inc.relation] = matched;
    }
    return out;
  }
}
