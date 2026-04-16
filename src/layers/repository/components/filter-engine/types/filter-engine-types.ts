/**
 * Filter Engine Layer Types
 * 
 * Type definitions for applying filters to data collections.
 */

import { ParsedFilter } from '../../query-parser/types/query-parser-types';

/**
 * Filter execution context
 */
export interface FilterContext {
  caseSensitive: boolean;
  nullHandling: NullHandling;
  locale: string;
  timeZone: string;
}

/**
 * Null handling strategy
 */
export enum NullHandling {
  IGNORE = 'IGNORE',
  TREAT_AS_MATCH = 'TREAT_AS_MATCH',
  TREAT_AS_NO_MATCH = 'TREAT_AS_NO_MATCH',
  ERROR = 'ERROR',
}

/**
 * Filter result
 */
export interface FilterResult<T> {
  success: boolean;
  data: T[];
  filteredCount: number;
  executionTime: number;
  error?: FilterError;
}

/**
 * Filter error
 */
export interface FilterError {
  code: string;
  message: string;
  field?: string;
  details?: Record<string, unknown>;
}

/**
 * Filter statistics
 */
export interface FilterStats {
  totalFilters: number;
  appliedFilters: number;
  skippedFilters: number;
  averageExecutionTime: number;
}

/**
 * Filter optimization hint
 */
export interface FilterOptimizationHint {
  field: string;
  operator: string;
  recommendedIndex: boolean;
  estimatedSelectivity: number;
}

/**
 * Filter chain configuration
 */
export interface FilterChainConfig {
  shortCircuitEvaluation: boolean;
  parallelExecution: boolean;
  maxConcurrentFilters: number;
}

/**
 * Compiled filter
 */
export interface CompiledFilter {
  filter: ParsedFilter;
  predicate: (item: unknown) => boolean;
  estimatedCost: number;
}
