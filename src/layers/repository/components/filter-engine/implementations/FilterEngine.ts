/**
 * Filter Engine Implementation
 * 
 * Concrete implementation of IFilterEngine.
 * Handles applying filters to data collections.
 */

import { IFilterEngine } from '../interfaces/IFilterEngine';
import { ParsedFilter, LogicalOperator } from '../../query-parser/types/query-parser-types';
import {
  FilterResult,
  FilterContext,
  FilterStats,
  FilterChainConfig,
  CompiledFilter,
  FilterOptimizationHint,
  FilterError,
  NullHandling,
} from '../types/filter-engine-types';

export class FilterEngine<T = unknown> implements IFilterEngine<T> {
  private _context: FilterContext;
  private _chainConfig: FilterChainConfig;
  private _stats: FilterStats;
  private _compiledCache: Map<string, CompiledFilter>;

  constructor(context?: Partial<FilterContext>, chainConfig?: Partial<FilterChainConfig>) {
    this._context = {
      caseSensitive: false,
      nullHandling: NullHandling.IGNORE,
      locale: 'en-US',
      timeZone: 'UTC',
      ...context,
    };
    this._chainConfig = {
      shortCircuitEvaluation: true,
      parallelExecution: false,
      maxConcurrentFilters: 10,
      ...chainConfig,
    };
    this._stats = {
      totalFilters: 0,
      appliedFilters: 0,
      skippedFilters: 0,
      averageExecutionTime: 0,
    };
    this._compiledCache = new Map();
  }

  apply(data: T[], filters: ParsedFilter[], context?: FilterContext): FilterResult<T> {
    const startTime = Date.now();
    const effectiveContext = context ? { ...this._context, ...context } : this._context;

    try {
      let filteredData = [...data];
      this._stats.totalFilters += filters.length;

      for (const filter of filters) {
        const compiled = this.compile(filter);
        filteredData = filteredData.filter((item) => {
          return this._evaluateFilter(item, compiled, effectiveContext);
        });
        this._stats.appliedFilters++;

        if (this._chainConfig.shortCircuitEvaluation && filteredData.length === 0) {
          this._stats.skippedFilters += filters.length - this._stats.appliedFilters;
          break;
        }
      }

      const executionTime = Date.now() - startTime;
      this._updateAverageExecutionTime(executionTime);

      return {
        success: true,
        data: filteredData,
        filteredCount: data.length - filteredData.length,
        executionTime,
      };
    } catch (error) {
      return {
        success: false,
        data: [],
        filteredCount: 0,
        executionTime: Date.now() - startTime,
        error: {
          code: 'FILTER_ERROR',
          message: error instanceof Error ? error.message : 'Unknown filter error',
        },
      };
    }
  }

  compile(filter: ParsedFilter): CompiledFilter {
    const cacheKey = `${filter.field}_${filter.operator}_${filter.value}`;
    const cached = this._compiledCache.get(cacheKey);

    if (cached) {
      return cached;
    }

    const predicate = this._createPredicate(filter);
    const compiled: CompiledFilter = {
      filter,
      predicate,
      estimatedCost: this._estimateFilterCost(filter),
    };

    this._compiledCache.set(cacheKey, compiled);
    return compiled;
  }

  applyCompiled(data: T[], filters: CompiledFilter[], context?: FilterContext): FilterResult<T> {
    const startTime = Date.now();
    const effectiveContext = context ? { ...this._context, ...context } : this._context;

    try {
      let filteredData = [...data];
      this._stats.totalFilters += filters.length;

      for (const compiled of filters) {
        filteredData = filteredData.filter((item) => {
          return compiled.predicate(item);
        });
        this._stats.appliedFilters++;

        if (this._chainConfig.shortCircuitEvaluation && filteredData.length === 0) {
          this._stats.skippedFilters += filters.length - this._stats.appliedFilters;
          break;
        }
      }

      const executionTime = Date.now() - startTime;
      this._updateAverageExecutionTime(executionTime);

      return {
        success: true,
        data: filteredData,
        filteredCount: data.length - filteredData.length,
        executionTime,
      };
    } catch (error) {
      return {
        success: false,
        data: [],
        filteredCount: 0,
        executionTime: Date.now() - startTime,
        error: {
          code: 'FILTER_ERROR',
          message: error instanceof Error ? error.message : 'Unknown filter error',
        },
      };
    }
  }

  estimateSelectivity(filter: ParsedFilter, totalCount: number): number {
    if (totalCount === 0) return 0;

    const operator = filter.operator;
    const value = filter.value;

    switch (operator) {
      case 'EQUALS':
        return 1 / totalCount;
      case 'NOT_EQUALS':
        return (totalCount - 1) / totalCount;
      case 'IN':
        if (Array.isArray(value)) {
          return Math.min(value.length / totalCount, 1);
        }
        return 0.5;
      case 'NOT_IN':
        if (Array.isArray(value)) {
          return Math.max((totalCount - value.length) / totalCount, 0);
        }
        return 0.5;
      default:
        return 0.5;
    }
  }

  getOptimizationHints(filters: ParsedFilter[]): FilterOptimizationHint[] {
    return filters.map((filter) => ({
      field: filter.field,
      operator: filter.operator,
      recommendedIndex: ['EQUALS', 'IN'].includes(filter.operator),
      estimatedSelectivity: 0.5,
    }));
  }

  setContext(context: Partial<FilterContext>): void {
    this._context = { ...this._context, ...context };
  }

  getContext(): FilterContext {
    return { ...this._context };
  }

  setChainConfig(config: Partial<FilterChainConfig>): void {
    this._chainConfig = { ...this._chainConfig, ...config };
  }

  getChainConfig(): FilterChainConfig {
    return { ...this._chainConfig };
  }

  getStats(): FilterStats {
    return { ...this._stats };
  }

  resetStats(): void {
    this._stats = {
      totalFilters: 0,
      appliedFilters: 0,
      skippedFilters: 0,
      averageExecutionTime: 0,
    };
  }

  clearCache(): void {
    this._compiledCache.clear();
  }

  validate(filter: ParsedFilter): boolean {
    return !!filter.field && !!filter.operator;
  }

  combine(filters: ParsedFilter[], operator: 'AND' | 'OR'): ParsedFilter {
    if (filters.length === 0) {
      throw new Error('Cannot combine empty filter array');
    }

    if (filters.length === 1) {
      return filters[0];
    }

    return {
      field: filters[0].field,
      operator: filters[0].operator,
      value: filters,
      negated: false,
      logicalOperator: operator === 'AND' ? LogicalOperator.AND : LogicalOperator.OR,
    };
  }

  negate(filter: ParsedFilter): ParsedFilter {
    return {
      ...filter,
      negated: !filter.negated,
    };
  }

  private _evaluateFilter(item: T, compiled: CompiledFilter, context: FilterContext): boolean {
    try {
      return compiled.predicate(item);
    } catch (error) {
      return context.nullHandling === NullHandling.TREAT_AS_MATCH;
    }
  }

  private _createPredicate(filter: ParsedFilter): (item: unknown) => boolean {
    return (item: unknown) => {
      const entity = item as Record<string, unknown>;
      const fieldValue = entity[filter.field];

      const result = this._compareValues(fieldValue, filter.operator, filter.value);

      return filter.negated ? !result : result;
    };
  }

  private _compareValues(fieldValue: unknown, operator: string, filterValue: unknown): boolean {
    if (fieldValue === undefined || fieldValue === null) {
      return false;
    }

    switch (operator) {
      case 'EQUALS':
        return fieldValue === filterValue;
      case 'NOT_EQUALS':
        return fieldValue !== filterValue;
      case 'CONTAINS':
        return typeof fieldValue === 'string' && String(fieldValue).includes(String(filterValue));
      case 'STARTS_WITH':
        return typeof fieldValue === 'string' && String(fieldValue).startsWith(String(filterValue));
      case 'ENDS_WITH':
        return typeof fieldValue === 'string' && String(fieldValue).endsWith(String(filterValue));
      case 'GREATER_THAN':
        return typeof fieldValue === 'number' && fieldValue > (filterValue as number);
      case 'LESS_THAN':
        return typeof fieldValue === 'number' && fieldValue < (filterValue as number);
      case 'GREATER_THAN_OR_EQUALS':
        return typeof fieldValue === 'number' && fieldValue >= (filterValue as number);
      case 'LESS_THAN_OR_EQUALS':
        return typeof fieldValue === 'number' && fieldValue <= (filterValue as number);
      case 'IN':
        return Array.isArray(filterValue) && filterValue.includes(fieldValue);
      case 'NOT_IN':
        return Array.isArray(filterValue) && !filterValue.includes(fieldValue);
      default:
        return true;
    }
  }

  private _estimateFilterCost(filter: ParsedFilter): number {
    const operator = filter.operator;

    switch (operator) {
      case 'EQUALS':
        return 1;
      case 'IN':
        return Array.isArray(filter.value) ? filter.value.length : 10;
      default:
        return 5;
    }
  }

  private _updateAverageExecutionTime(duration: number): void {
    const total = this._stats.appliedFilters;
    if (total > 0) {
      this._stats.averageExecutionTime =
        (this._stats.averageExecutionTime * (total - 1) + duration) / total;
    }
  }
}
