/**
 * Sort Engine Layer Types
 * 
 * Type definitions for applying sorting to data collections.
 */

import { ParsedSort } from '../../query-parser/types/query-parser-types';

/**
 * Sort execution context
 */
export interface SortContext {
  caseSensitive: boolean;
  locale: string;
  numericCollation: boolean;
  nullPosition: NullPosition;
}

/**
 * Null position
 */
export enum NullPosition {
  FIRST = 'FIRST',
  LAST = 'LAST',
}

/**
 * Sort result
 */
export interface SortResult<T> {
  success: boolean;
  data: T[];
  executionTime: number;
  comparisons: number;
  error?: SortError;
}

/**
 * Sort error
 */
export interface SortError {
  code: string;
  message: string;
  field?: string;
  details?: Record<string, unknown>;
}

/**
 * Sort statistics
 */
export interface SortStats {
  totalSorts: number;
  averageExecutionTime: number;
  averageComparisons: number;
  cacheHitRate: number;
}

/**
 * Sort algorithm
 */
export enum SortAlgorithm {
  QUICK_SORT = 'QUICK_SORT',
  MERGE_SORT = 'MERGE_SORT',
  HEAP_SORT = 'HEAP_SORT',
  TIM_SORT = 'TIM_SORT',
}

/**
 * Sort configuration
 */
export interface SortConfig {
  algorithm: SortAlgorithm;
  stable: boolean;
  parallel: boolean;
  threshold: number;
}

/**
 * Compiled sort
 */
export interface CompiledSort {
  sort: ParsedSort;
  comparator: (a: unknown, b: unknown) => number;
  estimatedCost: number;
}

/**
 * Multi-level sort
 */
export interface MultiLevelSort {
  sorts: CompiledSort[];
  tieBreaker?: (a: unknown, b: unknown) => number;
}
