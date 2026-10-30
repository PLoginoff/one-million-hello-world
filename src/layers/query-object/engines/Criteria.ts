/**
 * Criteria — fluent builders over the criteria AST.
 *
 * This module is the ergonomic front door for constructing criteria
 * trees. Everything produced here is plain `CriterionNode` data that
 * any backend can consume:
 *
 *   const c = and(
 *     field('age').gte(18),
 *     or(field('status').eq('vip'), field('posts').exists())
 *   );
 *
 *   store.execute(Query.from('users').where(c));
 *
 * Keeping construction separate from interpretation is the essence of
 * the Query Object pattern: the tree *describes* intent; the compiler,
 * SQL generator and optimizer each supply their own interpretation.
 *
 * @module QueryObject/Engines
 */

import {
  CompareNode,
  CompareOp,
  CriterionNode,
  ExistsNode,
  InSubqueryNode,
  LogicNode,
  LogicOp,
  QueryAst,
} from './types';

// ---------------------------------------------------------------------------
// Field expression builder
// ---------------------------------------------------------------------------

/**
 * Fluent builder bound to one field path. Each method returns a leaf
 * `CompareNode`; `inSubquery` returns an `InSubqueryNode`.
 *
 * Instances are throwaway — `field('age').gt(1)` allocates one builder
 * plus one node — so there is no caching layer here.
 */
export class FieldExpr {
  readonly path: string;

  constructor(path: string) {
    if (path.length === 0) {
      throw new RangeError('field path must not be empty');
    }
    this.path = path;
  }

  private _cmp(op: CompareOp, value?: unknown, value2?: unknown): CompareNode {
    return { kind: 'compare', field: this.path, op, value, value2 };
  }

  /** `field = value`. */
  eq(value: unknown): CompareNode {
    return this._cmp(CompareOp.Eq, value);
  }

  /** `field <> value`. */
  ne(value: unknown): CompareNode {
    return this._cmp(CompareOp.Ne, value);
  }

  /** `field > value`. */
  gt(value: unknown): CompareNode {
    return this._cmp(CompareOp.Gt, value);
  }

  /** `field >= value`. */
  gte(value: unknown): CompareNode {
    return this._cmp(CompareOp.Gte, value);
  }

  /** `field < value`. */
  lt(value: unknown): CompareNode {
    return this._cmp(CompareOp.Lt, value);
  }

  /** `field <= value`. */
  lte(value: unknown): CompareNode {
    return this._cmp(CompareOp.Lte, value);
  }

  /** `field IN (values...)`. */
  in(values: readonly unknown[]): CompareNode {
    return this._cmp(CompareOp.In, [...values]);
  }

  /** `field NOT IN (values...)`. */
  notIn(values: readonly unknown[]): CompareNode {
    return this._cmp(CompareOp.NotIn, [...values]);
  }

  /**
   * `field IN (subquery)`. The argument is anything carrying a
   * `QueryAst` — pass a `Query`'s `.toAst()` result, or use the
   * `subquery()` helper which accepts a `Query` directly.
   */
  inSubquery(query: QueryAst, negated = false): InSubqueryNode {
    return { kind: 'inSubquery', field: this.path, query, negated };
  }

  /** `field NOT IN (subquery)`. */
  notInSubquery(query: QueryAst): InSubqueryNode {
    return this.inSubquery(query, true);
  }

  /**
   * String/array containment: `LIKE '%v%'` for strings, element
   * membership for array-valued fields.
   */
  contains(value: unknown): CompareNode {
    return this._cmp(CompareOp.Contains, value);
  }

  /** `field LIKE 'prefix%'`. */
  startsWith(prefix: string): CompareNode {
    return this._cmp(CompareOp.StartsWith, prefix);
  }

  /** `field LIKE '%suffix'`. */
  endsWith(suffix: string): CompareNode {
    return this._cmp(CompareOp.EndsWith, suffix);
  }

  /** Regular-expression match. Accepts `RegExp` or a pattern string. */
  matches(pattern: RegExp | string, flags?: string): CompareNode {
    const literal =
      typeof pattern === 'string'
        ? { source: pattern, flags: flags ?? '' }
        : { source: pattern.source, flags: pattern.flags };
    return this._cmp(CompareOp.Matches, literal);
  }

  /** Inclusive range: `lo <= field <= hi`. */
  between(lo: unknown, hi: unknown): CompareNode {
    return this._cmp(CompareOp.Between, lo, hi);
  }

  /** `field IS NULL` (also matches `undefined`). */
  isNull(): CompareNode {
    return this._cmp(CompareOp.IsNull);
  }

  /** `field IS NOT NULL`. */
  isNotNull(): CompareNode {
    return this._cmp(CompareOp.IsNotNull);
  }
}

/** Start a field expression: `field('age').gte(18)`. */
export function field(path: string): FieldExpr {
  return new FieldExpr(path);
}

// ---------------------------------------------------------------------------
// Logical combinators
// ---------------------------------------------------------------------------

/**
 * `AND` over children. Children that are themselves `and` nodes are
 * flattened (`and(a, and(b, c))` → `and(a, b, c)`) to keep trees
 * shallow — this makes the optimizer's per-term selectivity pass O(n)
 * over a flat list instead of a recursive walk, and produces cleaner
 * SQL (`a AND b AND c` rather than nested parens).
 */
export function and(...children: CriterionNode[]): CriterionNode {
  const flat: CriterionNode[] = [];
  for (const c of children) {
    if (c.kind === 'logic' && c.op === LogicOp.And) {
      flat.push(...c.children);
    } else {
      flat.push(c);
    }
  }
  if (flat.length === 1) {
    const only = flat[0];
    if (only === undefined) throw new RangeError('and() requires a child');
    return only;
  }
  const node: LogicNode = { kind: 'logic', op: LogicOp.And, children: flat };
  return node;
}

/** `OR` over children, flattened like {@link and}. */
export function or(...children: CriterionNode[]): CriterionNode {
  const flat: CriterionNode[] = [];
  for (const c of children) {
    if (c.kind === 'logic' && c.op === LogicOp.Or) {
      flat.push(...c.children);
    } else {
      flat.push(c);
    }
  }
  if (flat.length === 1) {
    const only = flat[0];
    if (only === undefined) throw new RangeError('or() requires a child');
    return only;
  }
  const node: LogicNode = { kind: 'logic', op: LogicOp.Or, children: flat };
  return node;
}

/**
 * `NOT child`. Double negations collapse: `not(not(x))` → `x`.
 * Negated subquery membership flips the `negated` flag rather than
 * wrapping, so `not(f.inSubquery(q))` renders `NOT IN (...)` directly.
 */
export function not(child: CriterionNode): CriterionNode {
  if (child.kind === 'not') {
    return child.child;
  }
  if (child.kind === 'inSubquery') {
    return { ...child, negated: !child.negated };
  }
  if (child.kind === 'exists') {
    return { ...child, negated: !child.negated };
  }
  return { kind: 'not', child };
}

/**
 * `EXISTS (SELECT 1 FROM t WHERE ...)`.
 *
 * `correlate` maps subquery field paths to outer-row field paths:
 * `exists(q, { userId: 'id' })` correlates `t.userId = outer.id`.
 */
export function exists(query: QueryAst, correlate?: Record<string, string>): ExistsNode {
  return { kind: 'exists', query, correlate, negated: false };
}

/** `NOT EXISTS (subquery)`. */
export function notExists(query: QueryAst, correlate?: Record<string, string>): ExistsNode {
  return { kind: 'exists', query, correlate, negated: true };
}

// ---------------------------------------------------------------------------
// Tree utilities
// ---------------------------------------------------------------------------

/** Depth-first walk over a criteria tree (pre-order). */
export function walkCriteria(node: CriterionNode, visit: (n: CriterionNode) => void): void {
  visit(node);
  switch (node.kind) {
    case 'logic':
      for (const c of node.children) walkCriteria(c, visit);
      break;
    case 'not':
      walkCriteria(node.child, visit);
      break;
    default:
      break;
  }
}

/** Count leaf (compare/subquery/exists) nodes — a rough complexity metric. */
export function leafCount(node: CriterionNode): number {
  let n = 0;
  walkCriteria(node, (c) => {
    if (c.kind !== 'logic' && c.kind !== 'not') n += 1;
  });
  return n;
}

/** Structural equality of two criteria trees (field order-insensitive for arrays is *not* attempted). */
export function criteriaEqual(a: CriterionNode, b: CriterionNode): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
