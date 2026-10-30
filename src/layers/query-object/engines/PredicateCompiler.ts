/**
 * PredicateCompiler — criteria tree → in-memory predicate function.
 *
 * Compiles a `CriterionNode` tree into a plain JavaScript predicate.
 * The compiler performs operand preparation *once at compile time* so
 * the hot per-row evaluation loop stays cheap:
 *
 *   - **Field path splitting** — `"address.city"` is split into
 *     `['address','city']` at compile time and resolved with a tight
 *     loop, avoiding per-row `String.split` allocations.
 *   - **Operand preparation** — `IN` lists become `Set`s (O(1)
 *     membership instead of O(n) `Array.includes`), `BETWEEN` bounds
 *     are extracted once, regex literals become compiled `RegExp`s, and
 *     `LIKE`-family operands are lowercased once when case-insensitive
 *     matching is requested.
 *   - **Subquery evaluation** — `IN (subquery)` materializes the
 *     subquery result column into a `Set` at compile time (the data is
 *     static at execution), and `EXISTS` precomputes the inner row
 *     list, so each outer-row evaluation is O(1) / O(inner rows)
 *     respectively with no re-compilation.
 *
 * NULL semantics follow SQL three-valued logic: any comparison against
 * a `null`/`undefined` field value yields `false` (the row is filtered
 * out), except the explicit `IsNull`/`IsNotNull` tests.
 *
 * Complexity: compilation is O(tree size + subquery data); each
 * compiled predicate is O(tree size) per row evaluated.
 *
 * @module QueryObject/Engines
 */

import {
  CompareNode,
  CompareOp,
  CompiledPredicate,
  CriterionNode,
  ExistsNode,
  InSubqueryNode,
  QueryAst,
} from './types';

/** Options controlling compiled predicate behavior. */
export interface PredicateCompileOptions {
  /**
   * Case-insensitive string comparison for Eq/Ne/In/Contains/
   * StartsWith/EndsWith. Range comparisons (Gt..Lte, Between) stay
   * case-sensitive — there is no canonical "case-insensitive ordering"
   * worth pretending exists.
   */
  caseInsensitive?: boolean;
  /**
   * Executes a subquery AST and returns its result rows. Required when
   * the criteria tree contains `inSubquery` or `exists` nodes; provided
   * by InMemoryQueryStore. Throws at evaluation time if absent.
   */
  subqueryResolver?: (ast: QueryAst) => Row[];
}

type Row = Record<string, unknown>;

/** Regex literal accepted by `CompareOp.Matches`. */
interface RegexLiteral {
  source: string;
  flags: string;
}

function isRegexLiteral(v: unknown): v is RegexLiteral {
  return (
    typeof v === 'object' &&
    v !== null &&
    typeof (v as RegexLiteral).source === 'string' &&
    typeof (v as RegexLiteral).flags === 'string'
  );
}

// ---------------------------------------------------------------------------
// Value helpers
// ---------------------------------------------------------------------------

/**
 * Resolve a dotted path against a row. Segments walk plain objects;
 * `null`/`undefined` encountered mid-path short-circuits to
 * `undefined`. Numeric segments index into arrays, so
 * `"tags.0.name"` works as expected.
 */
export function resolvePath(row: Row, segments: readonly string[]): unknown {
  let current: unknown = row;
  for (const seg of segments) {
    if (current === null || current === undefined) return undefined;
    if (Array.isArray(current)) {
      const idx = Number(seg);
      current = Number.isInteger(idx) ? current[idx] : undefined;
    } else if (typeof current === 'object') {
      current = (current as Row)[seg];
    } else {
      return undefined;
    }
  }
  return current;
}

/** Single-segment convenience wrapper used by include resolution. */
export function getField(row: Row, path: string): unknown {
  return resolvePath(row, path.split('.'));
}

/** Equality that handles Date and case-insensitive string operands. */
function valuesEqual(a: unknown, b: unknown, ci: boolean): boolean {
  if (a === b) return true;
  if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime();
  if (ci && typeof a === 'string' && typeof b === 'string') {
    return a.toLowerCase() === b.toLowerCase();
  }
  return false;
}

/**
 * Total ordering comparison shared by Gt/Lt/Between and ORDER BY.
 * Numbers compare numerically; strings lexicographically; Dates by
 * timestamp; booleans false < true. Mixed types are ordered by a type
 * rank so the comparator is total (required for stable sorting).
 */
export function compareValues(a: unknown, b: unknown): number {
  const ra = typeRank(a);
  const rb = typeRank(b);
  if (ra !== rb) return ra - rb;
  if (a instanceof Date && b instanceof Date) return a.getTime() - b.getTime();
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  if (typeof a === 'string' && typeof b === 'string') return a < b ? -1 : a > b ? 1 : 0;
  if (typeof a === 'boolean' && typeof b === 'boolean') return (a ? 1 : 0) - (b ? 1 : 0);
  return 0;
}

function typeRank(v: unknown): number {
  if (v === null || v === undefined) return 0;
  if (typeof v === 'number') return 1;
  if (typeof v === 'string') return 2;
  if (typeof v === 'boolean') return 3;
  if (v instanceof Date) return 4;
  return 5;
}

// ---------------------------------------------------------------------------
// Predicate compiler
// ---------------------------------------------------------------------------

/**
 * Compiles criteria trees to predicates. A single instance is cheap to
 * share; compile methods are pure apart from the subquery resolver they
 * close over (which may read store data).
 */
export class PredicateCompiler {
  private readonly _ci: boolean;
  private readonly _resolver: ((ast: QueryAst) => Row[]) | undefined;

  constructor(options: PredicateCompileOptions = {}) {
    this._ci = options.caseInsensitive ?? false;
    this._resolver = options.subqueryResolver;
  }

  /** New compiler identical to this one but with a subquery resolver. */
  withResolver(resolver: (ast: QueryAst) => Row[]): PredicateCompiler {
    return new PredicateCompiler({ caseInsensitive: this._ci, subqueryResolver: resolver });
  }

  /**
   * Compile a criteria tree into a row predicate. `null`/undefined
   * trees compile to the always-true predicate.
   */
  compile(node: CriterionNode | null | undefined): CompiledPredicate<Row> {
    if (node === null || node === undefined) {
      return () => true;
    }
    return this._node(node);
  }

  private _node(node: CriterionNode): CompiledPredicate<Row> {
    switch (node.kind) {
      case 'compare':
        return this._compare(node);
      case 'logic': {
        // Children are compiled once; evaluation is short-circuit.
        const children = node.children.map((c) => this._node(c));
        if (node.op === 'and') {
          return (row) => {
            for (const p of children) if (!p(row)) return false;
            return true;
          };
        }
        return (row) => {
          for (const p of children) if (p(row)) return true;
          return false;
        };
      }
      case 'not': {
        const inner = this._node(node.child);
        return (row) => !inner(row);
      }
      case 'inSubquery':
        return this._inSubquery(node);
      case 'exists':
        return this._exists(node);
    }
  }

  private _compare(node: CompareNode): CompiledPredicate<Row> {
    const segs = node.field.split('.');

    switch (node.op) {
      case CompareOp.Eq: {
        const v = node.value;
        const ci = this._ci && typeof v === 'string';
        const lv = ci ? (v as string).toLowerCase() : v;
        return (row) => {
          const fv = resolvePath(row, segs);
          if (ci && typeof fv === 'string') {
            return valuesEqual(fv.toLowerCase(), lv, false);
          }
          return valuesEqual(fv, lv, this._ci);
        };
      }
      case CompareOp.Ne: {
        const inner = this._compare({ ...node, op: CompareOp.Eq });
        return (row) => !inner(row);
      }
      case CompareOp.Gt:
      case CompareOp.Gte:
      case CompareOp.Lt:
      case CompareOp.Lte: {
        const v = node.value;
        return (row) => {
          const fv = resolvePath(row, segs);
          if (fv === null || fv === undefined || v === null || v === undefined) return false;
          const c = compareValues(fv, v);
          switch (node.op) {
            case CompareOp.Gt:
              return c > 0;
            case CompareOp.Gte:
              return c >= 0;
            case CompareOp.Lt:
              return c < 0;
            default:
              return c <= 0;
          }
        };
      }
      case CompareOp.In:
      case CompareOp.NotIn: {
        const list = Array.isArray(node.value) ? (node.value as unknown[]) : [node.value];
        // Prepared at compile time: O(1) Set membership per row.
        const set = new Set(list);
        const ciSet = this._ci
          ? new Set(list.map((v) => (typeof v === 'string' ? v.toLowerCase() : v)))
          : set;
        const inside = (row: Row) => {
          const fv = resolvePath(row, segs);
          if (this._ci && typeof fv === 'string') return ciSet.has(fv.toLowerCase());
          return set.has(fv);
        };
        return node.op === CompareOp.In ? inside : (row) => !inside(row);
      }
      case CompareOp.Between: {
        const lo = node.value;
        const hi = node.value2;
        return (row) => {
          const fv = resolvePath(row, segs);
          if (fv === null || fv === undefined) return false;
          return compareValues(fv, lo) >= 0 && compareValues(fv, hi) <= 0;
        };
      }
      case CompareOp.IsNull:
        return (row) => {
          const fv = resolvePath(row, segs);
          return fv === null || fv === undefined;
        };
      case CompareOp.IsNotNull:
        return (row) => {
          const fv = resolvePath(row, segs);
          return fv !== null && fv !== undefined;
        };
      case CompareOp.Contains: {
        const needle = node.value;
        const ciNeedle = this._ci && typeof needle === 'string' ? needle.toLowerCase() : needle;
        return (row) => {
          const fv = resolvePath(row, segs);
          if (typeof fv === 'string' && typeof ciNeedle === 'string') {
            return this._ci ? fv.toLowerCase().includes(ciNeedle) : fv.includes(ciNeedle);
          }
          if (Array.isArray(fv)) {
            return fv.some((el) => valuesEqual(el, ciNeedle, this._ci));
          }
          return false;
        };
      }
      case CompareOp.StartsWith:
      case CompareOp.EndsWith: {
        const s = typeof node.value === 'string' ? node.value : '';
        const p = this._ci ? s.toLowerCase() : s;
        const starts = node.op === CompareOp.StartsWith;
        return (row) => {
          const fv = resolvePath(row, segs);
          if (typeof fv !== 'string') return false;
          const hay = this._ci ? fv.toLowerCase() : fv;
          return starts ? hay.startsWith(p) : hay.endsWith(p);
        };
      }
      case CompareOp.Matches: {
        const re = this._toRegExp(node.value);
        return (row) => {
          const fv = resolvePath(row, segs);
          if (typeof fv !== 'string') return false;
          re.lastIndex = 0; // /g or /y flags make RegExp stateful
          return re.test(fv);
        };
      }
      case CompareOp.InSubquery:
        // CompareNode with InSubquery op appears only when callers
        // hand-build nodes; the canonical representation is
        // InSubqueryNode. Treat as always-false.
        return () => false;
    }
  }

  private _toRegExp(value: unknown): RegExp {
    if (value instanceof RegExp) return value;
    if (isRegexLiteral(value)) return new RegExp(value.source, value.flags);
    if (typeof value === 'string') return new RegExp(value);
    throw new TypeError('Matches operator requires RegExp or { source, flags } literal');
  }

  /**
   * `field IN (SELECT ...)`. The subquery runs once at compile time;
   * its first select column (or 'id' when no select list is given) is
   * materialized into a Set. Per-outer-row evaluation is then O(1).
   */
  private _inSubquery(node: InSubqueryNode): CompiledPredicate<Row> {
    const segs = node.field.split('.');
    const rows = this._resolve(node.query);
    const column =
      node.query.select !== null && node.query.select.length > 0 ? node.query.select[0] : 'id';
    const members = new Set<unknown>();
    for (const r of rows) {
      members.add(getField(r, column ?? 'id'));
    }
    return (row) => {
      const fv = resolvePath(row, segs);
      return node.negated ? !members.has(fv) : members.has(fv);
    };
  }

  /**
   * `EXISTS (correlated subquery)`. The inner candidate set is computed
   * once at compile time — the resolver already applies the subquery's
   * own WHERE/ORDER/LIMIT, so per outer row we only need correlation
   * equality. If the subquery carries no correlation the EXISTS answer
   * is row-independent and folds to a constant.
   */
  private _exists(node: ExistsNode): CompiledPredicate<Row> {
    const rows = this._resolve(node.query);
    const correlate = node.correlate;

    if (!correlate || Object.keys(correlate).length === 0) {
      const result = node.negated ? rows.length === 0 : rows.length > 0;
      return () => result;
    }

    const pairs = Object.entries(correlate).map(([innerPath, outerPath]) => ({
      innerSegs: innerPath.split('.'),
      outerSegs: outerPath.split('.'),
    }));

    return (outerRow) => {
      for (const inner of rows) {
        let ok = true;
        for (const { innerSegs, outerSegs } of pairs) {
          const iv = resolvePath(inner, innerSegs);
          const ov = resolvePath(outerRow, outerSegs);
          if (!valuesEqual(iv, ov, false)) {
            ok = false;
            break;
          }
        }
        if (ok) return !node.negated;
      }
      return node.negated;
    };
  }

  private _resolve(ast: QueryAst): Row[] {
    if (!this._resolver) {
      throw new Error(
        'Criteria tree contains a subquery but no subqueryResolver was provided. ' +
          'Compile via InMemoryQueryStore so subqueries can be materialized.'
      );
    }
    return this._resolver(ast);
  }
}
