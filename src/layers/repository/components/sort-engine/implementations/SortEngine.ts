/**
 * Sort Engine Implementation
 * 
 * Concrete implementation of ISortEngine.
 * Handles applying sorting to data collections.
 */

import { ISortEngine } from '../interfaces/ISortEngine';
import { ParsedSort, SortDirection } from '../../query-parser/types/query-parser-types';
import {
  SortResult,
  SortContext,
  SortStats,
  SortConfig,
  CompiledSort,
  MultiLevelSort,
  SortAlgorithm,
  NullPosition,
} from '../types/sort-engine-types';

export class SortEngine<T = unknown> implements ISortEngine<T> {
  private _context: SortContext;
  private _config: SortConfig;
  private _stats: SortStats;
  private _compiledCache: Map<string, CompiledSort>;

  constructor(context?: Partial<SortContext>, config?: Partial<SortConfig>) {
    this._context = {
      caseSensitive: false,
      locale: 'en-US',
      numericCollation: true,
      nullPosition: NullPosition.LAST,
      ...context,
    };
    this._config = {
      algorithm: SortAlgorithm.QUICK_SORT,
      stable: true,
      parallel: false,
      threshold: 1000,
      ...config,
    };
    this._stats = {
      totalSorts: 0,
      averageExecutionTime: 0,
      averageComparisons: 0,
      cacheHitRate: 0,
    };
    this._compiledCache = new Map();
  }

  apply(data: T[], sorts: ParsedSort[], context?: SortContext): SortResult<T> {
    const startTime = Date.now();
    const effectiveContext = context ? { ...this._context, ...context } : this._context;

    try {
      const compiled = sorts.map((sort) => this.compile(sort));
      const result = this.applyCompiled(data, compiled, effectiveContext);

      this._stats.totalSorts++;
      this._updateAverageExecutionTime(result.executionTime);

      return result;
    } catch (error) {
      return {
        success: false,
        data: [],
        executionTime: Date.now() - startTime,
        comparisons: 0,
        error: {
          code: 'SORT_ERROR',
          message: error instanceof Error ? error.message : 'Unknown sort error',
        },
      };
    }
  }

  compile(sort: ParsedSort): CompiledSort {
    const cacheKey = `${sort.field}_${sort.direction}_${sort.nullPosition}`;
    const cached = this._compiledCache.get(cacheKey);

    if (cached) {
      this._stats.cacheHitRate = (this._stats.cacheHitRate * 0.9) + 0.1;
      return cached;
    }

    const comparator = this._createComparator(sort);
    const compiled: CompiledSort = {
      sort,
      comparator,
      estimatedCost: this._estimateSortCost(sort),
    };

    this._compiledCache.set(cacheKey, compiled);
    this._stats.cacheHitRate = this._stats.cacheHitRate * 0.9;

    return compiled;
  }

  applyCompiled(data: T[], sorts: CompiledSort[], context?: SortContext): SortResult<T> {
    const startTime = Date.now();
    const effectiveContext = context ? { ...this._context, ...context } : this._context;

    try {
      let comparisons = 0;
      const sortedData = [...data];

      if (sorts.length === 0) {
        return {
          success: true,
          data: sortedData,
          executionTime: Date.now() - startTime,
          comparisons: 0,
        };
      }

      sortedData.sort((a, b) => {
        for (const compiled of sorts) {
          comparisons++;
          const result = compiled.comparator(a, b);
          if (result !== 0) {
            return result;
          }
        }
        return 0;
      });

      const executionTime = Date.now() - startTime;
      this._updateAverageComparisons(comparisons);

      return {
        success: true,
        data: sortedData,
        executionTime,
        comparisons,
      };
    } catch (error) {
      return {
        success: false,
        data: [],
        executionTime: Date.now() - startTime,
        comparisons: 0,
        error: {
          code: 'SORT_ERROR',
          message: error instanceof Error ? error.message : 'Unknown sort error',
        },
      };
    }
  }

  applyMultiLevel(data: T[], multiLevelSort: MultiLevelSort, context?: SortContext): SortResult<T> {
    const startTime = Date.now();
    const effectiveContext = context ? { ...this._context, ...context } : this._context;

    try {
      let comparisons = 0;
      const sortedData = [...data];

      sortedData.sort((a, b) => {
        for (const compiled of multiLevelSort.sorts) {
          comparisons++;
          const result = compiled.comparator(a, b);
          if (result !== 0) {
            return result;
          }
        }

        if (multiLevelSort.tieBreaker) {
          comparisons++;
          return multiLevelSort.tieBreaker(a, b);
        }

        return 0;
      });

      const executionTime = Date.now() - startTime;
      this._stats.totalSorts++;
      this._updateAverageExecutionTime(executionTime);
      this._updateAverageComparisons(comparisons);

      return {
        success: true,
        data: sortedData,
        executionTime,
        comparisons,
      };
    } catch (error) {
      return {
        success: false,
        data: [],
        executionTime: Date.now() - startTime,
        comparisons: 0,
        error: {
          code: 'SORT_ERROR',
          message: error instanceof Error ? error.message : 'Unknown sort error',
        },
      };
    }
  }

  setContext(context: Partial<SortContext>): void {
    this._context = { ...this._context, ...context };
  }

  getContext(): SortContext {
    return { ...this._context };
  }

  setConfig(config: Partial<SortConfig>): void {
    this._config = { ...this._config, ...config };
  }

  getConfig(): SortConfig {
    return { ...this._config };
  }

  setAlgorithm(algorithm: SortAlgorithm): void {
    this._config.algorithm = algorithm;
  }

  getAlgorithm(): SortAlgorithm {
    return this._config.algorithm;
  }

  getStats(): SortStats {
    return { ...this._stats };
  }

  resetStats(): void {
    this._stats = {
      totalSorts: 0,
      averageExecutionTime: 0,
      averageComparisons: 0,
      cacheHitRate: 0,
    };
  }

  clearCache(): void {
    this._compiledCache.clear();
  }

  validate(sort: ParsedSort): boolean {
    return !!sort.field && !!sort.direction;
  }

  estimateCost(sorts: ParsedSort[], dataLength: number): number {
    const complexity = dataLength * Math.log2(dataLength);
    return sorts.length * complexity;
  }

  reverse(sort: ParsedSort): ParsedSort {
    return {
      ...sort,
      direction: sort.direction === SortDirection.ASC ? SortDirection.DESC : SortDirection.ASC,
    };
  }

  private _createComparator(sort: ParsedSort): (a: unknown, b: unknown) => number {
    return (a: unknown, b: unknown) => {
      const entityA = a as Record<string, unknown>;
      const entityB = b as Record<string, unknown>;

      const valueA = entityA[sort.field];
      const valueB = entityB[sort.field];

      const nullA = valueA === undefined || valueA === null;
      const nullB = valueB === undefined || valueB === null;

      if (nullA && nullB) return 0;
      if (nullA) return this._context.nullPosition === NullPosition.FIRST ? -1 : 1;
      if (nullB) return this._context.nullPosition === NullPosition.FIRST ? 1 : -1;

      const strA = this._normalizeValue(valueA);
      const strB = this._normalizeValue(valueB);

      const comparison = strA.localeCompare(strB, this._context.locale, {
        numeric: this._context.numericCollation,
        sensitivity: this._context.caseSensitive ? 'base' : 'accent',
      });

      return sort.direction === 'ASC' ? comparison : -comparison;
    };
  }

  private _normalizeValue(value: unknown): string {
    if (typeof value === 'string') {
      return this._context.caseSensitive ? value : value.toLowerCase();
    }
    return String(value);
  }

  private _estimateSortCost(sort: ParsedSort): number {
    return 10;
  }

  private _updateAverageExecutionTime(duration: number): void {
    const total = this._stats.totalSorts;
    if (total > 0) {
      this._stats.averageExecutionTime =
        (this._stats.averageExecutionTime * (total - 1) + duration) / total;
    }
  }

  private _updateAverageComparisons(comparisons: number): void {
    const total = this._stats.totalSorts;
    if (total > 0) {
      this._stats.averageComparisons =
        (this._stats.averageComparisons * (total - 1) + comparisons) / total;
    }
  }
}
