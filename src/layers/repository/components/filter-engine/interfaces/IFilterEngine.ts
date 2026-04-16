/**
 * Filter Engine Interface
 * 
 * Defines the contract for applying filters to data collections.
 */

import { ParsedFilter } from '../../query-parser/types/query-parser-types';
import {
  FilterResult,
  FilterContext,
  FilterStats,
  FilterChainConfig,
  CompiledFilter,
  FilterOptimizationHint,
} from '../types/filter-engine-types';

/**
 * Interface for filter engine operations
 */
export interface IFilterEngine<T = unknown> {
  /**
   * Applies filters to data
   * 
   * @param data - Data to filter
   * @param filters - Array of parsed filters
   * @param context - Filter execution context
   * @returns Filter result with filtered data
   */
  apply(data: T[], filters: ParsedFilter[], context?: FilterContext): FilterResult<T>;

  /**
   * Compiles a filter for optimized execution
   * 
   * @param filter - Parsed filter to compile
   * @returns Compiled filter
   */
  compile(filter: ParsedFilter): CompiledFilter;

  /**
   * Applies compiled filters to data
   * 
   * @param data - Data to filter
   * @param filters - Array of compiled filters
   * @param context - Filter execution context
   * @returns Filter result with filtered data
   */
  applyCompiled(data: T[], filters: CompiledFilter[], context?: FilterContext): FilterResult<T>;

  /**
   * Estimates filter selectivity
   * 
   * @param filter - Parsed filter
   * @param totalCount - Total number of items
   * @returns Estimated selectivity (0-1)
   */
  estimateSelectivity(filter: ParsedFilter, totalCount: number): number;

  /**
   * Gets optimization hints for filters
   * 
   * @param filters - Array of parsed filters
   * @returns Array of optimization hints
   */
  getOptimizationHints(filters: ParsedFilter[]): FilterOptimizationHint[];

  /**
   * Sets filter context
   * 
   * @param context - Filter execution context
   */
  setContext(context: Partial<FilterContext>): void;

  /**
   * Gets current filter context
   * 
   * @returns Current filter context
   */
  getContext(): FilterContext;

  /**
   * Sets filter chain configuration
   * 
   * @param config - Filter chain configuration
   */
  setChainConfig(config: Partial<FilterChainConfig>): void;

  /**
   * Gets current filter chain configuration
   * 
   * @returns Current filter chain configuration
   */
  getChainConfig(): FilterChainConfig;

  /**
   * Gets filter statistics
   * 
   * @returns Filter statistics
   */
  getStats(): FilterStats;

  /**
   * Resets filter statistics
   */
  resetStats(): void;

  /**
   * Clears compiled filter cache
   */
  clearCache(): void;

  /**
   * Validates a filter
   * 
   * @param filter - Parsed filter to validate
   * @returns Boolean indicating if filter is valid
   */
  validate(filter: ParsedFilter): boolean;

  /**
   * Combines multiple filters with logical operators
   * 
   * @param filters - Array of filters to combine
   * @param operator - Logical operator (AND/OR)
   * @returns Combined filter
   */
  combine(filters: ParsedFilter[], operator: 'AND' | 'OR'): ParsedFilter;

  /**
   * Negates a filter
   * 
   * @param filter - Parsed filter to negate
   * @returns Negated filter
   */
  negate(filter: ParsedFilter): ParsedFilter;
}
