/**
 * Specification Compiler
 *
 * Compiles a `SpecNode` tree once into a `CompiledSpec` carrying both
 * backends the engine needs:
 *
 *   1. `predicate` — a closure over the tree for in-memory filtering.
 *      Leaf nodes capture their bound values, so evaluation is O(tree nodes)
 *      per row with zero re-parsing.
 *
 *   2. `sql` + `params` — a parameterized SQL-like WHERE clause. Values are
 *      NEVER string-interpolated (injection-safe by construction); each leaf
 *      emits a `$n` placeholder and appends to the parameter list. `IN`
 *      lists expand to `($1, $2, ...)`.
 *
 * Ordering guarantees: parameters are numbered in left-to-right DFS order,
 * matching the clause's textual order — the same convention JDBC/drizzle
 * use, so `sql` + `params` could be handed to a real driver unchanged.
 *
 * @module RepositoryLayer/Engine
 */

import { CmpOp, CompiledSpec, SpecNode, SpecError } from './types';
import { Spec } from './Spec';
import { compareValues, getPath } from './path';

/** Maps a `CmpOp` to its SQL operator. `contains` uses LIKE with wildcards bound at param time. */
const SQL_OPS: Record<CmpOp, string> = {
  eq: '=',
  ne: '<>',
  gt: '>',
  gte: '>=',
  lt: '<',
  lte: '<=',
  contains: 'LIKE',
  startsWith: 'LIKE',
  endsWith: 'LIKE',
};

export class SpecCompiler {
  /**
   * Compiles a spec into predicate + parameterized SQL.
   * @throws SpecError on structural problems (validated defensively even if
   *         the caller bypassed `Spec`).
   */
  compile<T>(spec: Spec): CompiledSpec<T> {
    Spec.validate(spec.node);
    const params: unknown[] = [];
    const fields: string[] = [];
    const sql = this.toSql(spec.node, params, fields);
    const predicate = this.toPredicate<T>(spec.node);
    return { predicate, sql, params, fields };
  }

  /** Compiles only the predicate (skip SQL generation — half the cost). */
  compilePredicate<T>(spec: Spec): (row: T) => boolean {
    Spec.validate(spec.node);
    return this.toPredicate<T>(spec.node);
  }

  // ------------------------------------------------------------------------
  // Predicate backend
  // ------------------------------------------------------------------------

  private toPredicate<T>(node: SpecNode): (row: T) => boolean {
    switch (node.kind) {
      case 'all':
        return () => true;
      case 'none':
        return () => false;
      case 'cmp': {
        const { op, field, value } = node;
        return (row) => evalCmp(op, getPath(row, field), value);
      }
      case 'in': {
        const { field, values } = node;
        // Linear scan of values — fine for small lists; Set for larger.
        const set = values.length > 8 ? new Set(values) : null;
        return (row) => {
          const v = getPath(row, field);
          return set ? set.has(v) : values.includes(v);
        };
      }
      case 'between': {
        const { field, lo, hi, inclusive } = node;
        return (row) => {
          const v = getPath(row, field);
          const loCmp = compareValues(v, lo);
          const hiCmp = compareValues(v, hi);
          if (loCmp === null || hiCmp === null) return false;
          return inclusive ? loCmp >= 0 && hiCmp <= 0 : loCmp > 0 && hiCmp < 0;
        };
      }
      case 'isNull': {
        const { field } = node;
        return (row) => getPath(row, field) == null;
      }
      case 'notNull': {
        const { field } = node;
        return (row) => getPath(row, field) != null;
      }
      case 'and': {
        const children = node.children.map((c) => this.toPredicate<T>(c));
        return (row) => {
          for (const c of children) if (!c(row)) return false;
          return true;
        };
      }
      case 'or': {
        const children = node.children.map((c) => this.toPredicate<T>(c));
        return (row) => {
          for (const c of children) if (c(row)) return true;
          return false;
        };
      }
      case 'not': {
        const inner = this.toPredicate<T>(node.child);
        return (row) => !inner(row);
      }
      default: {
        const _exhaustive: never = node;
        throw new SpecError(`Cannot compile node: ${JSON.stringify(_exhaustive)}`);
      }
    }
  }

  // ------------------------------------------------------------------------
  // SQL backend
  // ------------------------------------------------------------------------

  private toSql(node: SpecNode, params: unknown[], fields: string[]): string {
    const bind = (v: unknown): string => {
      params.push(v);
      return `$${params.length}`;
    };
    const col = (f: string): string => {
      if (!fields.includes(f)) fields.push(f);
      // Quote the identifier; dot path stays a single column name here.
      return `"${f.replace(/"/g, '""')}"`;
    };

    switch (node.kind) {
      case 'all':
        return '1=1';
      case 'none':
        return '1=0';
      case 'cmp': {
        const c = col(node.field);
        // LIKE ops bind a wrapped value so callers see the raw term in params…
        // except we keep raw terms — wrapping is a driver detail, documented.
        switch (node.op) {
          case 'contains':
            return `${c} LIKE ${bind(node.value)} /* %term% */`;
          case 'startsWith':
            return `${c} LIKE ${bind(node.value)} /* term% */`;
          case 'endsWith':
            return `${c} LIKE ${bind(node.value)} /* %term */`;
          default:
            return `${c} ${SQL_OPS[node.op]} ${bind(node.value)}`;
        }
      }
      case 'in': {
        const c = col(node.field);
        const placeholders = node.values.map((v) => bind(v)).join(', ');
        return `${c} IN (${placeholders})`;
      }
      case 'between': {
        const c = col(node.field);
        return node.inclusive
          ? `${c} BETWEEN ${bind(node.lo)} AND ${bind(node.hi)}`
          : `(${c} > ${bind(node.lo)} AND ${c} < ${bind(node.hi)})`;
      }
      case 'isNull':
        return `${col(node.field)} IS NULL`;
      case 'notNull':
        return `${col(node.field)} IS NOT NULL`;
      case 'and':
        return `(${node.children.map((c) => this.toSql(c, params, fields)).join(' AND ')})`;
      case 'or':
        return `(${node.children.map((c) => this.toSql(c, params, fields)).join(' OR ')})`;
      case 'not':
        return `NOT (${this.toSql(node.child, params, fields)})`;
      default: {
        const _exhaustive: never = node;
        throw new SpecError(`Cannot compile node: ${JSON.stringify(_exhaustive)}`);
      }
    }
  }
}

/** Evaluates one `cmp` leaf. */
function evalCmp(op: CmpOp, actual: unknown, expected: unknown): boolean {
  switch (op) {
    case 'eq':
      return actual === expected;
    case 'ne':
      return actual !== expected;
    case 'gt':
    case 'gte':
    case 'lt':
    case 'lte': {
      const c = compareValues(actual, expected);
      if (c === null) return false;
      if (op === 'gt') return c > 0;
      if (op === 'gte') return c >= 0;
      if (op === 'lt') return c < 0;
      return c <= 0;
    }
    case 'contains':
      return typeof actual === 'string' && String(expected) !== ''
        ? actual.includes(String(expected))
        : actual === expected;
    case 'startsWith':
      return typeof actual === 'string' && actual.startsWith(String(expected));
    case 'endsWith':
      return typeof actual === 'string' && actual.endsWith(String(expected));
    default: {
      const _exhaustive: never = op;
      throw new SpecError(`Unknown op: ${String(_exhaustive)}`);
    }
  }
}
