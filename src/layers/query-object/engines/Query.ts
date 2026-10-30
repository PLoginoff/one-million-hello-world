/**
 * Query — the fluent Query Object.
 *
 * A `Query` is an immutable-by-convention builder over `QueryAst`.
 * Methods mutate the builder (fluent style) but the produced AST is a
 * plain-data snapshot via `toAst()` — backends receive a value, not a
 * reference they could corrupt.
 *
 *   const q = Query.from('users')
 *     .select('id', 'name')
 *     .where(and(field('age').gte(18), field('name').startsWith('a')))
 *     .orderBy('name', 'asc')
 *     .limit(20)
 *     .offset(40);
 *
 *   store.execute(q);                    // in-memory backend
 *   new SqlGenerator({dialect:'postgres'}).toSql(q.toAst());
 *
 * Derived queries:
 *   q.toCount()   — same filter, COUNT semantics (drops order/page)
 *   q.clone()     — independent copy for branching modifications
 *
 * @module QueryObject/Engines
 */

import { and, field, FieldExpr } from './Criteria';
import {
  CompareNode,
  CriterionNode,
  IncludeSpec,
  OrderSpec,
  QueryAst,
  QueryHints,
  SortDirection,
} from './types';

/** Shortcut union: where() accepts trees or field-builder leaf nodes. */
export type WhereInput = CriterionNode;

export class Query {
  private _table: string;
  private _select: string[] | null = null;
  private _where: CriterionNode | null = null;
  private _orderBy: OrderSpec[] = [];
  private _limit: number | null = null;
  private _offset: number | null = null;
  private _includes: IncludeSpec[] = [];
  private _distinct = false;
  private _count = false;
  private _hints: QueryHints = {};

  private constructor(table: string) {
    this._table = table;
  }

  /** Start a query against a table/collection name. */
  static from(table: string): Query {
    if (table.length === 0) throw new RangeError('table name must not be empty');
    return new Query(table);
  }

  // -----------------------------------------------------------------------
  // Column selection
  // -----------------------------------------------------------------------

  /** Project specific columns; omit for `SELECT *`. */
  select(...cols: string[]): this {
    this._select = [...cols];
    return this;
  }

  /** SELECT DISTINCT. */
  distinct(): this {
    this._distinct = true;
    return this;
  }

  // -----------------------------------------------------------------------
  // WHERE — accepts trees from the Criteria DSL or field('x').op(v)
  // -----------------------------------------------------------------------

  /**
   * Set the WHERE clause. Repeated calls AND the new criterion with the
   * existing tree (the common case when layering filters in code).
   */
  where(c: WhereInput): this {
    this._where = this._where === null ? c : and(this._where, c);
    return this;
  }

  /** Sugar: `whereField('age').gte(18)` ≡ `where(field('age').gte(18))`. */
  whereField(path: string): FieldExpr {
    const f = field(path);
    const self = this;
    // Proxy the FieldExpr so each leaf method also attaches to the query.
    return new Proxy(f, {
      get(target, prop: string | symbol) {
        const v = Reflect.get(target, prop) as unknown;
        if (typeof v !== 'function') return v;
        return (...args: unknown[]) => {
          const node = (v as (...a: unknown[]) => CriterionNode).apply(target, args);
          self.where(node);
          return self;
        };
      },
    });
  }

  // -----------------------------------------------------------------------
  // ORDER BY / pagination
  // -----------------------------------------------------------------------

  /** Add an ORDER BY term; repeated calls extend the sort key list. */
  orderBy(path: string, direction: SortDirection = 'asc', nulls?: 'first' | 'last'): this {
    this._orderBy.push({ field: path, direction, ...(nulls ? { nulls } : {}) });
    return this;
  }

  /** Cap result rows (must be a non-negative integer). */
  limit(n: number): this {
    if (!Number.isInteger(n) || n < 0) throw new RangeError('limit must be a non-negative integer');
    this._limit = n;
    return this;
  }

  /** Skip the first n rows (must be a non-negative integer). */
  offset(n: number): this {
    if (!Number.isInteger(n) || n < 0) throw new RangeError('offset must be a non-negative integer');
    this._offset = n;
    return this;
  }

  /** Convenience: `page(2, 20)` ≡ `.limit(20).offset(40)` (1-based). */
  page(pageNumber: number, pageSize: number): this {
    if (pageNumber < 1) throw new RangeError('pageNumber is 1-based');
    return this.limit(pageSize).offset((pageNumber - 1) * pageSize);
  }

  // -----------------------------------------------------------------------
  // Includes (eager loading)
  // -----------------------------------------------------------------------

  /**
   * Eager-load a related table: for each result row, attach matching
   * rows from `relation` where `relation[foreignKey] = row[localKey]`.
   */
  include(relation: string, foreignKey: string, localKey = 'id', as?: string): this {
    this._includes.push({ relation, foreignKey, localKey, ...(as ? { as } : {}) });
    return this;
  }

  /** Attach a fully-specified include (nested includes, extra filters). */
  includeSpec(spec: IncludeSpec): this {
    this._includes.push(spec);
    return this;
  }

  // -----------------------------------------------------------------------
  // Hints
  // -----------------------------------------------------------------------

  /** Optimizer hint: force a named index, or disable index use. */
  hint(h: QueryHints): this {
    this._hints = { ...this._hints, ...h };
    return this;
  }

  // -----------------------------------------------------------------------
  // Derived queries / output
  // -----------------------------------------------------------------------

  /**
   * A COUNT(*) query over the same filter. Drops ORDER BY, LIMIT,
   * OFFSET, includes and projection — none affect cardinality — but
   * preserves the entire WHERE tree including subqueries.
   */
  toCount(): Query {
    const q = this.clone();
    q._count = true;
    q._select = null;
    q._orderBy = [];
    q._limit = null;
    q._offset = null;
    q._includes = [];
    q._distinct = false;
    return q;
  }

  /** Deep-enough copy for safe independent modification. */
  clone(): Query {
    const q = new Query(this._table);
    q._select = this._select === null ? null : [...this._select];
    q._where = this._where === null ? null : structuredCloneNode(this._where);
    q._orderBy = this._orderBy.map((o) => ({ ...o }));
    q._limit = this._limit;
    q._offset = this._offset;
    q._includes = this._includes.map((i) => ({ ...i, nested: i.nested ? [...i.nested] : undefined }));
    q._distinct = this._distinct;
    q._count = this._count;
    q._hints = { ...this._hints };
    return q;
  }

  /** Serialize to the plain-data AST consumed by all backends. */
  toAst(): QueryAst {
    return {
      table: this._table,
      select: this._select === null ? null : [...this._select],
      where: this._where,
      orderBy: this._orderBy.map((o) => ({ ...o })),
      limit: this._limit,
      offset: this._offset,
      includes: this._includes.map((i) => ({ ...i })),
      distinct: this._distinct,
      count: this._count,
      hints: { ...this._hints },
    };
  }

  /** Rebuild a Query from a (possibly deserialized) AST. */
  static fromAst(ast: QueryAst): Query {
    const q = new Query(ast.table);
    q._select = ast.select === null ? null : [...ast.select];
    q._where = ast.where;
    q._orderBy = ast.orderBy.map((o) => ({ ...o }));
    q._limit = ast.limit;
    q._offset = ast.offset;
    q._includes = ast.includes.map((i) => ({ ...i }));
    q._distinct = ast.distinct;
    q._count = ast.count;
    q._hints = { ...ast.hints };
    return q;
  }
}

/**
 * Structural clone of a criterion tree. `structuredClone` is available
 * in Node 17+/Bun but RegExp values inside `Matches` nodes don't
 * survive it, so we clone explicitly and normalize regexes to literals.
 */
export function structuredCloneNode(node: CriterionNode): CriterionNode {
  switch (node.kind) {
    case 'compare': {
      const c: CompareNode = { ...node };
      if (c.value instanceof RegExp) c.value = { source: c.value.source, flags: c.value.flags };
      return c;
    }
    case 'logic':
      return { kind: 'logic', op: node.op, children: node.children.map(structuredCloneNode) };
    case 'not':
      return { kind: 'not', child: structuredCloneNode(node.child) };
    case 'inSubquery':
      return { ...node, query: Query.fromAst(node.query).toAst() };
    case 'exists':
      return { ...node, query: Query.fromAst(node.query).toAst() };
  }
}
