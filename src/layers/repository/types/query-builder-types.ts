/**
 * Query Builder Types
 * 
 * Type definitions for the Query Builder layer
 * including logical operators and query conditions.
 */

import {
  QueryFilter,
  QuerySort,
} from './repository-types';

/**
 * Logical operator for combining conditions
 */
export enum LogicalOperator {
  AND = 'AND',
  OR = 'OR',
}

/**
 * Query condition group
 */
export interface QueryConditionGroup {
  operator: LogicalOperator;
  conditions: QueryFilter[];
}

/**
 * Query builder state
 */
export interface QueryBuilderState {
  filters: QueryFilter[];
  sorts: QuerySort[];
  limit?: number;
  offset?: number;
}

/**
 * Query builder configuration
 */
export interface QueryBuilderConfig {
  maxLimit?: number;
  defaultLimit?: number;
  enableValidation?: boolean;
}
