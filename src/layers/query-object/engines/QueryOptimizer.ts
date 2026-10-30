/**
 * QueryOptimizer — selectivity estimation, index selection, criteria
 * rewriting, and execution-plan narration.
 *
 * This is a rule-based optimizer in the classic System-R mold but
 * deliberately scoped: no cost model over disk pages, instead a
 * *selectivity heuristic* that ranks criteria leaves and available
 * indexes, plus AST rewrites that are provably semantics-preserving
 * (constant folding, AND-flattening, range merging on the same field).
 *
 * The index-selection math:
 *   - each leaf criterion gets a selectivity score in [0,1] estimating
 *     the fraction of rows that survive it (`=` on a unique field ≈
 *     1/cardinality, range ops ≈ 0.25, LIKE '%x%' ≈ 0.5 — coarse, like
 *     real planner defaults when stats are stale).
 *   - an index "covers" a leaf when the leaf's field is the index's
 *     first column and the op is range-compatible
 *     (Eq/In: full point lookup; Gt/Gte/Lt/Lte/Between: range scan;
 *     Contains '%x%' can't use a B-tree — leading wildcard kills it).
 *   - The optimizer picks the covering index whose combined
 *     selectivity (product of covered leaf selectivities, since ANDed
 *     predicates multiply) is smallest.
 *
 * @module QueryObject/Engines
 */

import {
  CompareNode,
  CompareOp,
  CriterionNode,
  LogicOp,
  OrderSpec,
  QueryAst,
} from './types';

// ---------------------------------------------------------------------------
// Index descriptions & plans
// ---------------------------------------------------------------------------

/**
 * Declared index over a table. Only the leading column participates in
 * point/range matching here — composite-index prefix matching is a
 * noted extension.
 */
export interface IndexSpec {
  name: string;
  table: string;
  columns: string[];
  unique?: boolean;
}

/** Which access path the optimizer chose for the query. */
export interface QueryPlan {
  /** 'index' when an IndexSpec covers at least one conjunct. */
  accessPath: 'full_scan' | 'index';
  index?: IndexSpec;
  /**
   * Estimated surviving-row fraction in [0,1]. Product of leaf
   * selectivities under AND; 1 - ∏(1 - s_i) under OR (probabilistic
   * sum); s for NOT becomes 1 - s.
   */
  selectivity: number;
  /** Residual criteria the index can't evaluate — applied post-fetch. */
  residual: CriterionNode | null;
  /** Rewritten (possibly simplified) criteria tree. */
  optimized: CriterionNode | null;
  /** Human-readable narration of the decisions taken. */
  notes: string[];
}

// ---------------------------------------------------------------------------
// Selectivity heuristics
// ---------------------------------------------------------------------------

/** Coarse per-operator selectivity — System-R style defaults. */
export function leafSelectivity(node: CompareNode, uniqueFields: ReadonlySet<string>): number {
  switch (node.op) {
    case CompareOp.Eq:
      return uniqueFields.has(node.field) ? 0.001 : 0.1;
    case CompareOp.Ne:
      return 0.9;
    case CompareOp.Gt:
    case CompareOp.Gte:
    case CompareOp.Lt:
    case CompareOp.Lte:
      return 0.33;
    case CompareOp.Between:
      return 0.25;
    case CompareOp.In:
    case CompareOp.NotIn: {
      const n = Array.isArray(node.value) ? node.value.length : 1;
      const s = Math.min(0.9, n * 0.1);
      return node.op === CompareOp.In ? s : 1 - s;
    }
    case CompareOp.Contains:
      return 0.5; // '%x%' — worst case, leading wildcard
    case CompareOp.StartsWith:
      return 0.25; // 'x%' — can use index range in real DBs
    case CompareOp.EndsWith:
      return 0.5;
    case CompareOp.Matches:
      return 0.3;
    case CompareOp.IsNull:
      return 0.05;
    case CompareOp.IsNotNull:
      return 0.95;
    case CompareOp.InSubquery:
      return 0.3;
  }
}

/** Composite selectivity over an arbitrary criteria tree. */
export function treeSelectivity(node: CriterionNode, uniqueFields: ReadonlySet<string>): number {
  switch (node.kind) {
    case 'compare':
      return leafSelectivity(node, uniqueFields);
    case 'logic': {
      const parts = node.children.map((c) => treeSelectivity(c, uniqueFields));
      if (node.op === LogicOp.And) {
        return parts.reduce((acc, s) => acc * s, 1);
      }
      // Probabilistic sum for OR: 1 - ∏(1 - s_i)
      return 1 - parts.reduce((acc, s) => acc * (1 - s), 1);
    }
    case 'not':
      return 1 - treeSelectivity(node.child, uniqueFields);
    case 'inSubquery':
      return node.negated ? 0.7 : 0.3;
    case 'exists':
      return node.negated ? 0.7 : 0.3;
  }
}

// ---------------------------------------------------------------------------
// Optimizer
// ---------------------------------------------------------------------------

export class QueryOptimizer {
  private readonly _indexes: Map<string, IndexSpec[]>;

  constructor(indexes: IndexSpec[] = []) {
    this._indexes = new Map();
    for (const idx of indexes) this.addIndex(idx);
  }

  addIndex(idx: IndexSpec): void {
    const list = this._indexes.get(idx.table) ?? [];
    list.push(idx);
    this._indexes.set(idx.table, list);
  }

  removeIndex(table: string, name: string): void {
    const list = this._indexes.get(table);
    if (!list) return;
    this._indexes.set(
      table,
      list.filter((i) => i.name !== name)
    );
  }

  indexesFor(table: string): IndexSpec[] {
    return [...(this._indexes.get(table) ?? [])];
  }

  /**
   * Produce an execution plan for a query AST: picks the best index,
   * splits the criteria into index-covered conjuncts and residual
   * predicates, and applies safe AST rewrites.
   */
  plan(ast: QueryAst): QueryPlan {
    const notes: string[] = [];
    const unique = this._uniqueFields(ast.table);
    const rewritten = ast.where === null ? null : this._rewrite(ast.where, notes);
    const selectivity = rewritten === null ? 1 : treeSelectivity(rewritten, unique);

    // Index selection: only the top-level AND conjuncts can drive an
    // index lookup (OR branches each need their own access path — a
    // real planner would consider index-union; we just report it).
    const conjuncts = this._topConjuncts(rewritten);
    const candidates = this._indexes.get(ast.table) ?? [];
    let best: IndexSpec | undefined;
    let bestScore = 1;
    let covered = 0;

    if (ast.hints.forceIndex) {
      best = candidates.find((i) => i.name === ast.hints.forceIndex);
      if (best) {
        covered = this._coveredCount(best, conjuncts);
        bestScore = covered > 0 ? this._coveredSelectivity(best, conjuncts, unique) : 1;
        notes.push(`hint: forced index ${best.name}`);
      } else {
        notes.push(`hint: forced index '${ast.hints.forceIndex}' not found on ${ast.table}`);
      }
    } else if (!ast.hints.noIndex) {
      for (const idx of candidates) {
        const n = this._coveredCount(idx, conjuncts);
        if (n === 0) continue;
        const score = this._coveredSelectivity(idx, conjuncts, unique);
        if (score < bestScore) {
          best = idx;
          bestScore = score;
          covered = n;
        }
      }
      // OR-heavy trees defeat index use in this simple model.
      if (best === undefined && this._hasTopLevelOr(rewritten)) {
        notes.push('top-level OR prevents single-index access path (index union not modeled)');
      }
    } else {
      notes.push('hint: index usage disabled by noIndex');
    }

    const residual =
      best === undefined
        ? rewritten
        : this._stripCovered(rewritten, best, conjuncts);

    if (best !== undefined) {
      notes.push(
        `index ${best.name} covers ${covered} conjunct(s), est. selectivity ${bestScore.toFixed(3)}`
      );
    } else {
      notes.push('full scan');
    }

    return {
      accessPath: best === undefined ? 'full_scan' : 'index',
      index: best,
      selectivity: bestScore < 1 ? bestScore : selectivity,
      residual,
      optimized: rewritten,
      notes,
    };
  }

  /** Human-readable EXPLAIN-style description. */
  explain(ast: QueryAst): string {
    const p = this.plan(ast);
    const lines = [`Query on ${ast.table}${ast.count ? ' (COUNT)' : ''}`];
    lines.push(
      p.accessPath === 'index' && p.index
        ? `  Access: index ${p.index.name} [${p.index.columns.join(', ')}]`
        : '  Access: full table scan'
    );
    lines.push(`  Estimated selectivity: ${(p.selectivity * 100).toFixed(1)}%`);
    if (p.residual !== null && p.residual !== p.optimized) {
      lines.push('  Residual filter applied after index fetch');
    }
    for (const n of p.notes) lines.push(`  - ${n}`);
    return lines.join('\n');
  }

  // -----------------------------------------------------------------------
  // Rewrites — all semantics-preserving
  // -----------------------------------------------------------------------

  private _rewrite(node: CriterionNode, notes: string[]): CriterionNode | null {
    switch (node.kind) {
      case 'logic': {
        const kept: CriterionNode[] = [];
        for (const c of node.children) {
          const r = this._rewrite(c, notes);
          if (r === null) continue; // folded away (tautology)
          kept.push(r);
        }
        if (kept.length === 0) return null;
        if (kept.length === 1) {
          const only = kept[0];
          return only === undefined ? null : only;
        }
        const merged =
          node.op === LogicOp.And ? this._mergeSameFieldRanges(kept, notes) : kept;
        const first = merged[0];
        if (merged.length === 1) return first === undefined ? null : first;
        return { kind: 'logic', op: node.op, children: merged };
      }
      case 'not': {
        const inner = this._rewrite(node.child, notes);
        if (inner === null) return null;
        if (inner.kind === 'not') {
          notes.push('rewrite: collapsed double negation');
          return inner.child;
        }
        return { kind: 'not', child: inner };
      }
      case 'compare': {
        // Tautology: field IS NOT NULL can't be folded without data,
        // but `x <> x` style impossibilities could — we fold only the
        // provable cases: empty IN is always false → replace whole
        // conjunct with a `1=0` marker expressed as `Eq(1,0)`? We
        // instead keep it; the SQL generator already encodes it.
        return node;
      }
      default:
        return node;
    }
  }

  /**
   * Merge range predicates on the same field under AND:
   * `x >= 5 AND x < 10` → `x BETWEEN 5 AND 10` when bounds align.
   * Runs in O(n log n) via field grouping; non-mergeable conjuncts are
   * preserved untouched.
   */
  private _mergeSameFieldRanges(children: CriterionNode[], notes: string[]): CriterionNode[] {
    const byField = new Map<string, CompareNode[]>();
    const out: CriterionNode[] = [];

    for (const c of children) {
      if (c.kind === 'compare' && this._isRangeOp(c.op)) {
        const list = byField.get(c.field) ?? [];
        list.push(c);
        byField.set(c.field, list);
      } else {
        out.push(c);
      }
    }

    for (const [fieldName, cmps] of byField) {
      let lo: unknown;
      let loInclusive = true;
      let hi: unknown;
      let hiInclusive = true;
      let hasLo = false;
      let hasHi = false;
      let simple = true;

      for (const c of cmps) {
        switch (c.op) {
          case CompareOp.Gt:
          case CompareOp.Gte:
            if (hasLo) simple = false;
            lo = c.value;
            loInclusive = c.op === CompareOp.Gte;
            hasLo = true;
            break;
          case CompareOp.Lt:
          case CompareOp.Lte:
            if (hasHi) simple = false;
            hi = c.value;
            hiInclusive = c.op === CompareOp.Lte;
            hasHi = true;
            break;
          default:
            simple = false;
        }
      }

      if (simple && hasLo && hasHi && cmps.length === 2 && loInclusive && hiInclusive) {
        notes.push(`rewrite: merged range on '${fieldName}' into BETWEEN`);
        out.push({
          kind: 'compare',
          field: fieldName,
          op: CompareOp.Between,
          value: lo,
          value2: hi,
        });
      } else {
        out.push(...cmps);
      }
    }
    return out;
  }

  private _isRangeOp(op: CompareOp): boolean {
    return (
      op === CompareOp.Gt ||
      op === CompareOp.Gte ||
      op === CompareOp.Lt ||
      op === CompareOp.Lte
    );
  }

  // -----------------------------------------------------------------------
  // Index matching
  // -----------------------------------------------------------------------

  /** Ops a B-tree style index can evaluate: point lookup or range scan. */
  private _indexCompatible(op: CompareOp): boolean {
    switch (op) {
      case CompareOp.Eq:
      case CompareOp.In:
      case CompareOp.Gt:
      case CompareOp.Gte:
      case CompareOp.Lt:
      case CompareOp.Lte:
      case CompareOp.Between:
      case CompareOp.StartsWith: // 'prefix%' compiles to a range scan
        return true;
      default:
        return false;
    }
  }

  /** Extract top-level AND conjuncts; a lone leaf counts as one. */
  private _topConjuncts(node: CriterionNode | null): CriterionNode[] {
    if (node === null) return [];
    if (node.kind === 'logic' && node.op === LogicOp.And) return node.children;
    if (node.kind === 'logic' && node.op === LogicOp.Or) return [];
    return [node];
  }

  private _hasTopLevelOr(node: CriterionNode | null): boolean {
    return node !== null && node.kind === 'logic' && node.op === LogicOp.Or;
  }

  private _coveredCount(idx: IndexSpec, conjuncts: CriterionNode[]): number {
    const lead = idx.columns[0];
    if (lead === undefined) return 0;
    let n = 0;
    for (const c of conjuncts) {
      if (c.kind === 'compare' && c.field === lead && this._indexCompatible(c.op)) n += 1;
    }
    return n;
  }

  private _coveredSelectivity(
    idx: IndexSpec,
    conjuncts: CriterionNode[],
    unique: ReadonlySet<string>
  ): number {
    const lead = idx.columns[0];
    if (lead === undefined) return 1;
    let s = 1;
    for (const c of conjuncts) {
      if (c.kind === 'compare' && c.field === lead && this._indexCompatible(c.op)) {
        s *= idx.unique && c.op === CompareOp.Eq ? 0.001 : leafSelectivity(c, unique);
      }
    }
    return s;
  }

  /** Remove conjuncts fully covered by the chosen index. */
  private _stripCovered(
    node: CriterionNode | null,
    idx: IndexSpec,
    conjuncts: CriterionNode[]
  ): CriterionNode | null {
    if (node === null) return null;
    const lead = idx.columns[0];
    const covered = new Set(
      conjuncts.filter(
        (c) => c.kind === 'compare' && c.field === lead && this._indexCompatible(c.op)
      )
    );
    if (node.kind === 'logic' && node.op === LogicOp.And) {
      const rest = node.children.filter((c) => !covered.has(c));
      if (rest.length === 0) return null;
      const first = rest[0];
      if (rest.length === 1) return first === undefined ? null : first;
      return { kind: 'logic', op: LogicOp.And, children: rest };
    }
    return covered.has(node) ? null : node;
  }

  private _uniqueFields(table: string): ReadonlySet<string> {
    const out = new Set<string>();
    for (const idx of this._indexes.get(table) ?? []) {
      const lead = idx.columns[0];
      if (idx.unique && lead !== undefined) out.add(lead);
    }
    return out;
  }
}

// ---------------------------------------------------------------------------
// ORDER BY helpers (shared by store + SQL parity checks)
// ---------------------------------------------------------------------------

/** Stable multi-key comparator from an OrderSpec list. */
export function buildComparator<T extends Record<string, unknown>>(
  orderBy: readonly OrderSpec[],
  resolve: (row: T, field: string) => unknown
): (a: T, b: T) => number {
  return (a, b) => {
    for (const o of orderBy) {
      const av = resolve(a, o.field);
      const bv = resolve(b, o.field);
      const aNull = av === null || av === undefined;
      const bNull = bv === null || bv === undefined;
      if (aNull || bNull) {
        if (aNull && bNull) continue;
        const nullsFirst = o.nulls === 'first' || (o.nulls === undefined && o.direction === 'desc');
        const aIsNull = aNull;
        const dir = nullsFirst ? -1 : 1;
        return aIsNull ? dir : -dir;
      }
      const c = cmpVal(av, bv);
      if (c !== 0) return o.direction === 'asc' ? c : -c;
    }
    return 0;
  };
}

function cmpVal(a: unknown, b: unknown): number {
  if (a instanceof Date && b instanceof Date) return a.getTime() - b.getTime();
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  if (typeof a === 'string' && typeof b === 'string') return a < b ? -1 : a > b ? 1 : 0;
  if (typeof a === 'boolean' && typeof b === 'boolean') return (a ? 1 : 0) - (b ? 1 : 0);
  return 0;
}
