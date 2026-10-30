/**
 * Query Object Engines — public surface.
 *
 * The "real" implementation layer for the query-object layer:
 * criteria AST, fluent Query builder, in-memory predicate compiler,
 * parameterized SQL generator, rule-based optimizer, in-memory store.
 */

export {
  CompareOp,
  LogicOp,
  isCompareNode,
  isLogicNode,
  isNotNode,
  isInSubqueryNode,
  isExistsNode,
  freezeCriterion,
} from './types';
export type {
  CriterionNode,
  CompareNode,
  LogicNode,
  NotNode,
  InSubqueryNode,
  ExistsNode,
  OrderSpec,
  SortDirection,
  IncludeSpec,
  QueryAst,
  QueryHints,
  SqlDialect,
  CompiledPredicate,
  ParameterizedSql,
} from './types';

export { field, and, or, not, exists, notExists, walkCriteria, leafCount, criteriaEqual, FieldExpr } from './Criteria';

export {
  PredicateCompiler,
  resolvePath,
  getField,
  compareValues,
} from './PredicateCompiler';
export type { PredicateCompileOptions } from './PredicateCompiler';

export { dialect, quotePath, escapeLike, escapeLiteral } from './SqlDialects';
export type { ISqlDialect } from './SqlDialects';

export { SqlGenerator } from './SqlGenerator';
export type { SqlGeneratorOptions } from './SqlGenerator';

export {
  QueryOptimizer,
  leafSelectivity,
  treeSelectivity,
  buildComparator,
} from './QueryOptimizer';
export type { IndexSpec, QueryPlan } from './QueryOptimizer';

export { Query, structuredCloneNode } from './Query';
export type { WhereInput } from './Query';

export { InMemoryQueryStore } from './InMemoryQueryStore';
export type { QueryResult } from './InMemoryQueryStore';

export { serializeAst, deserializeAst, astToJson, astFromJson } from './serialization';
