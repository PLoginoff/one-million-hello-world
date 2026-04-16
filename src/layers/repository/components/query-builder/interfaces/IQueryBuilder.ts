/**
 * Query Builder Interface
 * 
 * Defines the contract for fluent query building API.
 */

import {
  QueryBuilderState,
  QueryBuilderConfig,
  QueryBuildResult,
} from '../types/query-builder-types';

/**
 * Interface for query builder operations
 */
export interface IQueryBuilder {
  /**
   * Adds a WHERE clause to the query
   * 
   * @param field - Field name
   * @param operator - Filter operator
   * @param value - Filter value
   * @returns Query builder for chaining
   */
  where(field: string, operator: string, value: unknown): IQueryBuilder;

  /**
   * Adds an AND condition to the query
   * 
   * @param field - Field name
   * @param operator - Filter operator
   * @param value - Filter value
   * @returns Query builder for chaining
   */
  andWhere(field: string, operator: string, value: unknown): IQueryBuilder;

  /**
   * Adds an OR condition to the query
   * 
   * @param field - Field name
   * @param operator - Filter operator
   * @param value - Filter value
   * @returns Query builder for chaining
   */
  orWhere(field: string, operator: string, value: unknown): IQueryBuilder;

  /**
   * Adds a NOT condition to the query
   * 
   * @param field - Field name
   * @param operator - Filter operator
   * @param value - Filter value
   * @returns Query builder for chaining
   */
  notWhere(field: string, operator: string, value: unknown): IQueryBuilder;

  /**
   * Adds a sort order to the query
   * 
   * @param field - Field name
   * @param direction - Sort direction
   * @param nullPosition - Null position
   * @returns Query builder for chaining
   */
  orderBy(field: string, direction: string, nullPosition?: string): IQueryBuilder;

  /**
   * Sets the limit for the query
   * 
   * @param limit - Maximum number of results
   * @returns Query builder for chaining
   */
  limit(limit: number): IQueryBuilder;

  /**
   * Sets the offset for the query
   * 
   * @param offset - Number of results to skip
   * @returns Query builder for chaining
   */
  offset(offset: number): IQueryBuilder;

  /**
   * Sets the cursor for the query
   * 
   * @param cursor - Cursor for pagination
   * @returns Query builder for chaining
   */
  cursor(cursor: string): IQueryBuilder;

  /**
   * Adds a projection to the query
   * 
   * @param field - Field name
   * @param alias - Optional alias
   * @param func - Optional function
   * @returns Query builder for chaining
   */
  select(field: string, alias?: string, func?: string): IQueryBuilder;

  /**
   * Adds a group by clause to the query
   * 
   * @param field - Field name
   * @returns Query builder for chaining
   */
  groupBy(field: string): IQueryBuilder;

  /**
   * Adds an aggregation to the query
   * 
   * @param func - Aggregation function
   * @param field - Field name
   * @param alias - Optional alias
   * @returns Query builder for chaining
   */
  aggregate(func: string, field: string, alias?: string): IQueryBuilder;

  /**
   * Adds a HAVING clause to the query
   * 
   * @param field - Field name
   * @param operator - Filter operator
   * @param value - Filter value
   * @returns Query builder for chaining
   */
  having(field: string, operator: string, value: unknown): IQueryBuilder;

  /**
   * Adds a JOIN clause to the query
   * 
   * @param type - Join type
   * @param table - Table name
   * @param alias - Optional alias
   * @param on - Join conditions
   * @returns Query builder for chaining
   */
  join(type: string, table: string, alias?: string, on?: Array<{ left: string; right: string; operator: string }>): IQueryBuilder;

  /**
   * Builds the query
   * 
   * @returns Query build result
   */
  build(): QueryBuildResult;

  /**
   * Resets the query builder to initial state
   * 
   * @returns Query builder for chaining
   */
  reset(): IQueryBuilder;

  /**
   * Clones the query builder
   * 
   * @returns New query builder instance with same state
   */
  clone(): IQueryBuilder;

  /**
   * Gets the current query builder state
   * 
   * @returns Query builder state
   */
  getState(): QueryBuilderState;

  /**
   * Sets the query builder state
   * 
   * @param state - Query builder state
   */
  setState(state: QueryBuilderState): void;

  /**
   * Sets query builder configuration
   * 
   * @param config - Query builder configuration
   */
  setConfig(config: Partial<QueryBuilderConfig>): void;

  /**
   * Gets current query builder configuration
   * 
   * @returns Current query builder configuration
   */
  getConfig(): QueryBuilderConfig;

  /**
   * Gets the current filters
   * 
   * @returns Array of filter clauses
   */
  getFilters(): any[];

  /**
   * Gets the current sorts
   * 
   * @returns Array of sort clauses
   */
  getSorts(): any[];

  /**
   * Gets the current limit
   * 
   * @returns Limit value or undefined
   */
  getLimit(): number | undefined;

  /**
   * Gets the current offset
   * 
   * @returns Offset value or undefined
   */
  getOffset(): number | undefined;

  /**
   * Gets the current cursor
   * 
   * @returns Cursor value or undefined
   */
  getCursor(): string | undefined;

  /**
   * Checks if the query builder has any filters
   * 
   * @returns Boolean indicating if filters exist
   */
  hasFilters(): boolean;

  /**
   * Checks if the query builder has any sorts
   * 
   * @returns Boolean indicating if sorts exist
   */
  hasSorts(): boolean;

  /**
   * Checks if the query builder has any projections
   * 
   * @returns Boolean indicating if projections exist
   */
  hasProjections(): boolean;
}
