/**
 * Query Builder Layer Types
 * 
 * Type definitions for fluent query building API.
 */

import { ParsedQuery } from '../../query-parser/types/query-parser-types';

/**
 * Query builder state
 */
export interface QueryBuilderState {
  filters: FilterClause[];
  sorts: SortClause[];
  pagination: PaginationClause;
  projections: ProjectionClause[];
  groups: GroupClause[];
  aggregations: AggregationClause[];
  having: HavingClause[];
  joins: JoinClause[];
}

/**
 * Filter clause
 */
export interface FilterClause {
  field: string;
  operator: string;
  value: unknown;
  logicalOperator: string;
  negated: boolean;
}

/**
 * Sort clause
 */
export interface SortClause {
  field: string;
  direction: string;
  nullPosition: string;
}

/**
 * Pagination clause
 */
export interface PaginationClause {
  limit?: number;
  offset?: number;
  cursor?: string;
}

/**
 * Projection clause
 */
export interface ProjectionClause {
  field: string;
  alias?: string;
  function?: string;
}

/**
 * Group clause
 */
export interface GroupClause {
  field: string;
  aggregations: AggregationClause[];
}

/**
 * Aggregation clause
 */
export interface AggregationClause {
  function: string;
  field: string;
  alias?: string;
}

/**
 * Having clause
 */
export interface HavingClause {
  field: string;
  operator: string;
  value: unknown;
}

/**
 * Join clause
 */
export interface JoinClause {
  type: JoinType;
  table: string;
  alias?: string;
  on: JoinCondition[];
}

/**
 * Join type
 */
export enum JoinType {
  INNER = 'INNER',
  LEFT = 'LEFT',
  RIGHT = 'RIGHT',
  FULL = 'FULL',
}

/**
 * Join condition
 */
export interface JoinCondition {
  leftField: string;
  rightField: string;
  operator: string;
}

/**
 * Query builder configuration
 */
export interface QueryBuilderConfig {
  maxLimit: number;
  defaultLimit: number;
  enableValidation: boolean;
  enableOptimization: boolean;
  enableCaching: boolean;
}

/**
 * Query build result
 */
export interface QueryBuildResult {
  success: boolean;
  query?: ParsedQuery;
  warnings: string[];
  error?: BuildError;
}

/**
 * Build error
 */
export interface BuildError {
  code: string;
  message: string;
  clause?: string;
  details?: Record<string, unknown>;
}
