/**
 * Sort Engine Interface
 * 
 * Defines the contract for applying sorting to data collections.
 */

import { ParsedSort } from '../../query-parser/types/query-parser-types';
import {
  SortResult,
  SortContext,
  SortStats,
  SortConfig,
  CompiledSort,
  MultiLevelSort,
  SortAlgorithm,
} from '../types/sort-engine-types';

/**
 * Interface for sort engine operations
 */
export interface ISortEngine<T = unknown> {
  /**
   * Applies sorts to data
   * 
   * @param data - Data to sort
   * @param sorts - Array of parsed sorts
   * @param context - Sort execution context
   * @returns Sort result with sorted data
   */
  apply(data: T[], sorts: ParsedSort[], context?: SortContext): SortResult<T>;

  /**
   * Compiles a sort for optimized execution
   * 
   * @param sort - Parsed sort to compile
   * @returns Compiled sort
   */
  compile(sort: ParsedSort): CompiledSort;

  /**
   * Applies compiled sorts to data
   * 
   * @param data - Data to sort
   * @param sorts - Array of compiled sorts
   * @param context - Sort execution context
   * @returns Sort result with sorted data
   */
  applyCompiled(data: T[], sorts: CompiledSort[], context?: SortContext): SortResult<T>;

  /**
   * Applies multi-level sort to data
   * 
   * @param data - Data to sort
   * @param multiLevelSort - Multi-level sort configuration
   * @param context - Sort execution context
   * @returns Sort result with sorted data
   */
  applyMultiLevel(data: T[], multiLevelSort: MultiLevelSort, context?: SortContext): SortResult<T>;

  /**
   * Sets sort context
   * 
   * @param context - Sort execution context
   */
  setContext(context: Partial<SortContext>): void;

  /**
   * Gets current sort context
   * 
   * @returns Current sort context
   */
  getContext(): SortContext;

  /**
   * Sets sort configuration
   * 
   * @param config - Sort configuration
   */
  setConfig(config: Partial<SortConfig>): void;

  /**
   * Gets current sort configuration
   * 
   * @returns Current sort configuration
   */
  getConfig(): SortConfig;

  /**
   * Sets sort algorithm
   * 
   * @param algorithm - Sort algorithm
   */
  setAlgorithm(algorithm: SortAlgorithm): void;

  /**
   * Gets current sort algorithm
   * 
   * @returns Current sort algorithm
   */
  getAlgorithm(): SortAlgorithm;

  /**
   * Gets sort statistics
   * 
   * @returns Sort statistics
   */
  getStats(): SortStats;

  /**
   * Resets sort statistics
   */
  resetStats(): void;

  /**
   * Clears compiled sort cache
   */
  clearCache(): void;

  /**
   * Validates a sort
   * 
   * @param sort - Parsed sort to validate
   * @returns Boolean indicating if sort is valid
   */
  validate(sort: ParsedSort): boolean;

  /**
   * Estimates sort cost
   * 
   * @param sorts - Array of parsed sorts
   * @param dataLength - Length of data to sort
   * @returns Estimated cost
   */
  estimateCost(sorts: ParsedSort[], dataLength: number): number;

  /**
   * Reverses a sort
   * 
   * @param sort - Parsed sort to reverse
   * @returns Reversed sort
   */
  reverse(sort: ParsedSort): ParsedSort;
}
