/**
 * SqlGenerator — criteria tree / QueryAst → parameterized SQL.
 *
 * Translates the serializable `QueryAst` into a parameterized statement
 * plus an ordered parameter array — never string-interpolated values,
 * so the output is injection-safe by construction:
 *
 *   const { sql, params } = gen.toSql(ast);
 *   // SELECT * FROM "users" WHERE ("age" >= $1 AND "name" LIKE $2 ESCAPE '\') ORDER BY ...
 *   // params: [18, 'ali%']
 *
 * Two render modes:
 *   - `toSql`    → `{ sql, params }` (bind-parameter style; the real one)
 *   - `toInlineSql` → values escaped inline (debug/EXPLAIN output only)
 *
 * Structural decisions:
 *   - `AND`/`OR` children are wrapped in parens so precedence never
 *     depends on dialect defaults.
 *   - `BETWEEN`/`IN`/`IS NULL` get dedicated syntax; `Matches` uses the
 *     dialect regex op (postgres `~`, mysql `REGEXP`) or throws for
 *     dialects without one — better than silently generating wrong SQL.
 *   - `LIMIT`/`OFFSET` defer to the dialect (mssql renders
 *     `OFFSET n ROWS FETCH NEXT m ROWS ONLY`).
 *   - `count` queries render `SELECT COUNT(*) AS "count"`.
 *
 * @module QueryObject/Engines
 */

import { dialect, escapeLike, escapeLiteral, quotePath, ISqlDialect } from './SqlDialects';
import {
  CompareNode,
  CompareOp,
  CriterionNode,
  IncludeSpec,
  OrderSpec,
  ParameterizedSql,
  QueryAst,
  SqlDialect,
} from './types';

/** Options controlling SQL generation. */
export interface SqlGeneratorOptions {
  dialect?: SqlDialect;
  /**
   * Emit `ILIKE` for Contains/StartsWith/EndsWith where supported
   * (postgres). Other dialects emit plain `LIKE` — matching the
   * predicate compiler's default of case-sensitive containment.
   */
  caseInsensitiveLike?: boolean;
}

/**
 * Parameterized SQL generator. Instances are stateless apart from the
 * per-generation parameter buffer, so one generator can be shared.
 */
export class SqlGenerator {
  private readonly _dialect: ISqlDialect;
  private readonly _ciLike: boolean;
  private _params: unknown[] = [];

  constructor(options: SqlGeneratorOptions = {}) {
    this._dialect = dialect(options.dialect ?? 'ansi');
    this._ciLike = options.caseInsensitiveLike ?? false;
  }

  // -----------------------------------------------------------------------
  // Whole-query rendering
  // -----------------------------------------------------------------------

  /** Render a QueryAst to parameterized SQL. */
  toSql(ast: QueryAst): ParameterizedSql {
    this._params = [];
    const sql = this._select(ast) + this._where(ast) + this._orderBy(ast);
    const tail = this._dialect.limitOffset(ast.limit, ast.offset);
    const out = sql + tail;
    const params = this._params;
    this._params = [];
    return { sql: out, params };
  }

  /**
   * Debug renderer: substitutes parameter values (safely escaped)
   * inline so the statement can be pasted into a console or EXPLAIN.
   * Do NOT use for execution — escaping every type is the driver's job.
   */
  toInlineSql(ast: QueryAst): string {
    const { sql, params } = this.toSql(ast);
    let i = 0;
    // Positional markers ('?') or numbered ('$1', '@p1') — replace
    // left-to-right regardless of style by scanning for each param's
    // marker. Postgres markers are unambiguous so a token replace works.
    if (this._dialect.param(1) === '?') {
      return sql.replace(/\?/g, () => this._inline(params[i++]));
    }
    return sql.replace(/\$(\d+)|@p(\d+)/g, (_m, a: string, b: string) => {
      const n = Number(a ?? b);
      return this._inline(params[n - 1]);
    });
  }

  /**
   * Derive `SELECT COUNT(*)` from any query AST — drops ORDER BY,
   * LIMIT, OFFSET (which don't affect cardinality) but preserves the
   * full WHERE tree including subqueries.
   */
  toCountSql(ast: QueryAst): ParameterizedSql {
    return this.toSql({
      ...ast,
      select: null,
      orderBy: [],
      limit: null,
      offset: null,
      count: true,
    });
  }

  /** Render just the WHERE clause (or empty string) — used for EXISTS. */
  whereToSql(node: CriterionNode | null): ParameterizedSql {
    this._params = [];
    const frag = node === null ? '' : ` WHERE ${this._node(node)}`;
    const params = this._params;
    this._params = [];
    return { sql: frag, params };
  }

  // -----------------------------------------------------------------------
  // Clause builders
  // -----------------------------------------------------------------------

  private _select(ast: QueryAst): string {
    const d = this._dialect;
    if (ast.count) {
      return `SELECT COUNT(*) AS ${d.quoteIdent('count')} FROM ${quotePath(d, ast.table)}`;
    }
    const cols =
      ast.select === null || ast.select.length === 0
        ? '*'
        : ast.select.map((c) => quotePath(d, c)).join(', ');
    const distinct = ast.distinct ? 'DISTINCT ' : '';
    return `SELECT ${distinct}${cols} FROM ${quotePath(d, ast.table)}`;
  }

  private _where(ast: QueryAst): string {
    if (ast.where === null) return '';
    return ` WHERE ${this._node(ast.where)}`;
  }

  private _orderBy(ast: QueryAst): string {
    if (ast.orderBy.length === 0) return '';
    const d = this._dialect;
    const terms = ast.orderBy.map((o: OrderSpec) => {
      let t = `${quotePath(d, o.field)} ${o.direction.toUpperCase()}`;
      if (o.nulls) t += ` NULLS ${o.nulls.toUpperCase()}`;
      return t;
    });
    return ` ORDER BY ${terms.join(', ')}`;
  }

  // -----------------------------------------------------------------------
  // Criteria tree rendering
  // -----------------------------------------------------------------------

  private _node(node: CriterionNode): string {
    switch (node.kind) {
      case 'compare':
        return this._compare(node);
      case 'logic': {
        const joiner = node.op === 'and' ? ' AND ' : ' OR ';
        const parts = node.children.map((c) => `(${this._node(c)})`);
        return parts.join(joiner);
      }
      case 'not':
        return `NOT (${this._node(node.child)})`;
      case 'inSubquery': {
        const sub = this._subquery(node.query);
        const neg = node.negated ? 'NOT ' : '';
        return `${quotePath(this._dialect, node.field)} ${neg}IN (${sub})`;
      }
      case 'exists': {
        const sub = this._subquery(node.query, node.correlate);
        return `${node.negated ? 'NOT ' : ''}EXISTS (${sub})`;
      }
    }
  }

  private _compare(node: CompareNode): string {
    const d = this._dialect;
    const col = quotePath(d, node.field);

    switch (node.op) {
      case CompareOp.Eq: {
        // `= NULL` is never true in SQL — translate to IS NULL.
        if (node.value === null || node.value === undefined) return `${col} IS NULL`;
        return `${col} = ${this._bind(node.value)}`;
      }
      case CompareOp.Ne: {
        if (node.value === null || node.value === undefined) return `${col} IS NOT NULL`;
        return `${col} <> ${this._bind(node.value)}`;
      }
      case CompareOp.Gt:
        return `${col} > ${this._bind(node.value)}`;
      case CompareOp.Gte:
        return `${col} >= ${this._bind(node.value)}`;
      case CompareOp.Lt:
        return `${col} < ${this._bind(node.value)}`;
      case CompareOp.Lte:
        return `${col} <= ${this._bind(node.value)}`;
      case CompareOp.In:
      case CompareOp.NotIn: {
        const list = Array.isArray(node.value) ? (node.value as unknown[]) : [node.value];
        if (list.length === 0) {
          // `IN ()` is a syntax error in every dialect; encode the
          // semantics instead: empty IN is always false, empty NOT IN
          // always true.
          return node.op === CompareOp.In ? '1 = 0' : '1 = 1';
        }
        const neg = node.op === CompareOp.NotIn ? 'NOT ' : '';
        const placeholders = list.map((v) => this._bind(v)).join(', ');
        return `${col} ${neg}IN (${placeholders})`;
      }
      case CompareOp.Between:
        return `${col} BETWEEN ${this._bind(node.value)} AND ${this._bind(node.value2)}`;
      case CompareOp.IsNull:
        return `${col} IS NULL`;
      case CompareOp.IsNotNull:
        return `${col} IS NOT NULL`;
      case CompareOp.Contains:
      case CompareOp.StartsWith:
      case CompareOp.EndsWith: {
        const raw = typeof node.value === 'string' ? node.value : String(node.value);
        const core = escapeLike(raw);
        const pattern =
          node.op === CompareOp.Contains
            ? `%${core}%`
            : node.op === CompareOp.StartsWith
              ? `${core}%`
              : `%${core}`;
        const kw = this._dialect.likeKeyword(this._ciLike);
        return `${col} ${kw} ${this._bind(pattern)} ESCAPE '\\\\'`;
      }
      case CompareOp.Matches: {
        if (this._dialect.regexOp === null) {
          throw new Error(
            `Dialect '${this._dialect.name}' has no regex operator; ` +
              'rewrite Matches as LIKE or execute in memory.'
          );
        }
        const v = node.value;
        const source =
          v instanceof RegExp
            ? v.source
            : typeof v === 'object' && v !== null && 'source' in v
              ? String((v as { source: unknown }).source)
              : String(v);
        return `${col} ${this._dialect.regexOp} ${this._bind(source)}`;
      }
      case CompareOp.InSubquery:
        throw new Error('CompareOp.InSubquery must be expressed as an inSubquery node');
    }
  }

  /**
   * Render a subquery. Correlation map entries become `inner = outer`
   * conjuncts — the outer side is emitted as a *column reference* (not
   * a bound param), which is what makes the query correlated.
   */
  private _subquery(ast: QueryAst, correlate?: Record<string, string>): string {
    const d = this._dialect;
    const cols =
      ast.select !== null && ast.select.length > 0
        ? ast.select.map((c) => quotePath(d, c)).join(', ')
        : '1';
    let sql = `SELECT ${cols} FROM ${quotePath(d, ast.table)}`;

    const conditions: string[] = [];
    if (ast.where !== null) conditions.push(this._node(ast.where));
    if (correlate) {
      for (const [inner, outer] of Object.entries(correlate)) {
        conditions.push(`${quotePath(d, inner)} = ${quotePath(d, outer)}`);
      }
    }
    if (conditions.length > 0) sql += ` WHERE ${conditions.join(' AND ')}`;
    return sql;
  }

  // -----------------------------------------------------------------------
  // Parameters / inline rendering
  // -----------------------------------------------------------------------

  private _bind(value: unknown): string {
    this._params.push(value);
    return this._dialect.param(this._params.length);
  }

  /** Literal escaping for the debug renderer only. */
  private _inline(value: unknown): string {
    if (value === null || value === undefined) return 'NULL';
    if (typeof value === 'number') {
      if (!Number.isFinite(value)) return 'NULL';
      return String(value);
    }
    if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
    if (value instanceof Date) return `'${value.toISOString()}'`;
    if (typeof value === 'string') return `'${escapeLiteral(value)}'`;
    return `'${escapeLiteral(String(value))}'`;
  }
}
