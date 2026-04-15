/**
 * Repository Layer Types
 * 
 * This module defines all type definitions for the Repository Layer,
 * including data access abstraction and query builders.
 */

/**
 * Query filter
 */
export interface QueryFilter {
  field: string;
  operator: FilterOperator;
  value: unknown;
}

/**
 * Filter operators
 */
export enum FilterOperator {
  EQUALS = 'EQUALS',
  NOT_EQUALS = 'NOT_EQUALS',
  CONTAINS = 'CONTAINS',
  STARTS_WITH = 'STARTS_WITH',
  ENDS_WITH = 'ENDS_WITH',
  GREATER_THAN = 'GREATER_THAN',
  LESS_THAN = 'LESS_THAN',
  GREATER_THAN_OR_EQUALS = 'GREATER_THAN_OR_EQUALS',
  LESS_THAN_OR_EQUALS = 'LESS_THAN_OR_EQUALS',
  IN = 'IN',
  NOT_IN = 'NOT_IN',
}

/**
 * Query sort
 */
export interface QuerySort {
  field: string;
  direction: SortDirection;
}

/**
 * Sort direction
 */
export enum SortDirection {
  ASC = 'ASC',
  DESC = 'DESC',
}

/**
 * Query options
 */
export interface QueryOptions {
  filters?: QueryFilter[];
  sorts?: QuerySort[];
  limit?: number;
  offset?: number;
}

/**
 * Repository result
 */
export interface RepositoryResult<T> {
  success: boolean;
  data?: T;
  error?: RepositoryError;
}

/**
 * Repository error
 */
export interface RepositoryError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

/**
 * Repository configuration
 */
export interface RepositoryConfig {
  enableCaching: boolean;
  cacheTimeout: number;
  enableTransaction: boolean;
}
