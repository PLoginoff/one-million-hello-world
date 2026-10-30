/**
 * Query Object Engine — Core Types
 *
 * Shared type vocabulary for the query-object engines: the criteria
 * abstract syntax tree (AST), ordering / pagination / include
 * specifications, the serializable QueryAst, and the dialect contract
 * used by the SQL generator.
 *
 * Design notes
 * ------------
 * The criteria tree is deliberately kept as *plain data* (no methods,
 * no closures) so that:
 *   - it can be serialized to JSON and sent over the wire,
 *   - multiple backends can consume the same tree (in-memory predicate
 *     compiler, SQL generator, optimizer),
 *   - tests can assert on tree shape structurally.
 *
 * `Query` objects compile down to a `QueryAst`; subquery criteria embed
 * a `QueryAst` directly which keeps this module free of a circular
 * dependency on `Query.ts`.
 *
 * @module QueryObject/Engines
 */

// ---------------------------------------------------------------------------
// Comparison operators
// ---------------------------------------------------------------------------

/**
 * Scalar comparison operators applied to a field value.
 *
 * NULL semantics follow SQL three-valued logic in the predicate
 * compiler: any comparison against a `null`/`undefined` operand yields
 * "not satisfied" rather than throwing, except the explicit
 * `IsNull`/`IsNotNull` tests.
 */
export enum CompareOp {
  /** `=` — strict equality (Date-aware: compares time value). */
  Eq = 'eq',
  /** `<>` / `!=` — negation of Eq. */
  Ne = 'ne',
  /** `>` — numeric / lexicographic / chronological greater-than. */
  Gt = 'gt',
  /** `>=`. */
  Gte = 'gte',
  /** `<`. */
  Lt = 'lt',
  /** `<=`. */
  Lte = 'lte',
  /** `IN (v1, v2, ...)` — value membership in a literal list. */
  In = 'in',
  /** `NOT IN (...)`. */
  NotIn = 'notIn',
  /** `IN (SELECT ...)` — value membership in a subquery result column. */
  InSubquery = 'inSubquery',
  /** `LIKE '%x%'` for strings; element membership for arrays. */
  Contains = 'contains',
  /** `LIKE 'x%'`. */
  StartsWith = 'startsWith',
  /** `LIKE '%x'`. */
  EndsWith = 'endsWith',
  /** Regular-expression match (in-memory) / `~` (postgres dialect). */
  Matches = 'matches',
  /** Inclusive range `BETWEEN lo AND hi`. */
  Between = 'between',
  /** `IS NULL` — matches `null` and `undefined`. */
  IsNull = 'isNull',
  /** `IS NOT NULL`. */
  IsNotNull = 'isNotNull',
}

// ---------------------------------------------------------------------------
// Criteria AST
// ---------------------------------------------------------------------------

/** Logical connective for composite criteria. */
export enum LogicOp {
  And = 'and',
  Or = 'or',
}

/**
 * Leaf criterion: `field OP value`.
 *
 * `field` is a dotted path (`"address.city"`) resolved against row
 * objects by the predicate compiler, and rendered as a quoted column
 * name (`"address"."city"` → `"address_city"` style) by the SQL
 * generator depending on `naming` options.
 */
export interface CompareNode {
  kind: 'compare';
  field: string;
  op: CompareOp;
  /**
   * Primary operand. Unused for IsNull/IsNotNull. For `Between` this is
   * the lower bound and `value2` the upper bound. For `In`/`NotIn` an
   * array. For `Matches` a `RegExp` or `{ source, flags }` literal.
   */
  value?: unknown;
  /** Secondary operand (upper bound for `Between`). */
  value2?: unknown;
}

/** Composite criterion: `AND`/`OR` over child criteria. */
export interface LogicNode {
  kind: 'logic';
  op: LogicOp;
  children: CriterionNode[];
}

/** Negation wrapper: `NOT child`. */
export interface NotNode {
  kind: 'not';
  child: CriterionNode;
}

/**
 * `field IN (SELECT field FROM subquery)` — the embedded query is a
 * serialized `QueryAst` whose first `select` column supplies values.
 */
export interface InSubqueryNode {
  kind: 'inSubquery';
  field: string;
  query: QueryAst;
  negated: boolean;
}

/**
 * `EXISTS (SELECT 1 FROM t WHERE criteria)` — semi-join test. The
 * optional `correlate` map binds outer row fields to inner fields:
 * `{ "posts.userId": "id" }` means "posts.userId must equal the outer
 * row's id" and is ANDed into the subquery criteria at evaluation time.
 */
export interface ExistsNode {
  kind: 'exists';
  query: QueryAst;
  correlate?: Record<string, string>;
  negated: boolean;
}

/** Union of all criteria node shapes. */
export type CriterionNode =
  | CompareNode
  | LogicNode
  | NotNode
  | InSubqueryNode
  | ExistsNode;

// ---------------------------------------------------------------------------
// Ordering / includes / pagination
// ---------------------------------------------------------------------------

export type SortDirection = 'asc' | 'desc';

/** One term of an ORDER BY clause. */
export interface OrderSpec {
  field: string;
  direction: SortDirection;
  /** NULL placement: SQL default varies by dialect, so we make it explicit. */
  nulls?: 'first' | 'last';
}

/**
 * Eager-load specification: attach related rows to each result row.
 * `foreignKey` names the field on the *related* row, `localKey` the
 * field on the parent row it must equal.
 */
export interface IncludeSpec {
  /** Related table name. */
  relation: string;
  /** Property name the related rows are attached under (defaults to `relation`). */
  as?: string;
  /** Field on the related row referencing the parent. */
  foreignKey: string;
  /** Field on the parent row holding the key (defaults to 'id'). */
  localKey?: string;
  /** Nested includes applied to the related rows. */
  nested?: IncludeSpec[];
  /** Optional extra criteria applied when fetching related rows. */
  where?: CriterionNode;
}

// ---------------------------------------------------------------------------
// QueryAst — the serializable form of a Query
// ---------------------------------------------------------------------------

/**
 * Plain-data representation of a query. Everything a backend needs to
 * execute or translate the query is here; the fluent `Query` class is
 * just a builder over this structure.
 */
export interface QueryAst {
  /** Table / collection the query selects from. */
  table: string;
  /** Projected columns, or `null` for `SELECT *`. */
  select: string[] | null;
  /** WHERE clause tree, or `null` when unconstrained. */
  where: CriterionNode | null;
  /** ORDER BY terms in priority order. */
  orderBy: OrderSpec[];
  /** Row cap, `null` for unbounded. */
  limit: number | null;
  /** Rows skipped before results are returned. */
  offset: number | null;
  /** Eager-load specs. */
  includes: IncludeSpec[];
  /** `SELECT DISTINCT`. */
  distinct: boolean;
  /** When true the query computes `COUNT(*)` instead of returning rows. */
  count: boolean;
  /** Optimizer / generator hints carried with the query. */
  hints: QueryHints;
}

/** Optional hints influencing translation and execution. */
export interface QueryHints {
  /** Force or forbid index usage by the optimizer. */
  forceIndex?: string;
  noIndex?: boolean;
  /** Maximum execution time advisory (ms) recorded in the plan. */
  timeoutMs?: number;
}

// ---------------------------------------------------------------------------
// Backends / dialects
// ---------------------------------------------------------------------------

/** SQL flavor targeted by the generator. */
export type SqlDialect = 'ansi' | 'postgres' | 'mysql' | 'sqlite' | 'mssql';

/** A compiled in-memory predicate — `true` means the row matches. */
export type CompiledPredicate<T = Record<string, unknown>> = (row: T) => boolean;

/** Parameterized SQL output: statement plus ordered bind parameters. */
export interface ParameterizedSql {
  sql: string;
  params: unknown[];
}

// ---------------------------------------------------------------------------
// Type guards
// ---------------------------------------------------------------------------

export function isCompareNode(n: CriterionNode): n is CompareNode {
  return n.kind === 'compare';
}

export function isLogicNode(n: CriterionNode): n is LogicNode {
  return n.kind === 'logic';
}

export function isNotNode(n: CriterionNode): n is NotNode {
  return n.kind === 'not';
}

export function isInSubqueryNode(n: CriterionNode): n is InSubqueryNode {
  return n.kind === 'inSubquery';
}

export function isExistsNode(n: CriterionNode): n is ExistsNode {
  return n.kind === 'exists';
}

/** Deep-freeze a criterion tree so shared subtrees can't be mutated. */
export function freezeCriterion(node: CriterionNode): CriterionNode {
  switch (node.kind) {
    case 'logic':
      for (const c of node.children) freezeCriterion(c);
      break;
    case 'not':
      freezeCriterion(node.child);
      break;
    default:
      break;
  }
  return Object.freeze(node);
}
