/**
 * Query Builder Interface
 * 
 * Defines the contract for building complex database queries
 * with fluent API for filtering, sorting, and pagination.
 */

import {
  QueryFilter,
  QuerySort,
  QueryOptions,
} from '../types/repository-types';

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
   * Adds a sort order to the query
   * 
   * @param field - Field name
   * @param direction - Sort direction
   * @returns Query builder for chaining
   */
  orderBy(field: string, direction: string): IQueryBuilder;

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
   * Builds the query options
   * 
   * @returns Query options
   */
  build(): QueryOptions;

  /**
   * Resets the query builder to initial state
   * 
   * @returns Query builder for chaining
   */
  reset(): IQueryBuilder;

  /**
   * Gets the current filters
   * 
   * @returns Array of query filters
   */
  getFilters(): QueryFilter[];

  /**
   * Gets the current sorts
   * 
   * @returns Array of query sorts
   */
  getSorts(): QuerySort[];

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
}
