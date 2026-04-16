/**
 * Query Builder Implementation
 * 
 * Concrete implementation of IQueryBuilder.
 * Provides fluent API for building complex database queries.
 */

import { IQueryBuilder } from '../interfaces/IQueryBuilder';
import {
  QueryBuilderState,
  QueryBuilderConfig,
  QueryBuildResult,
  FilterClause,
  SortClause,
  PaginationClause,
  ProjectionClause,
  GroupClause,
  AggregationClause,
  HavingClause,
  JoinClause,
  JoinType,
} from '../types/query-builder-types';

export class QueryBuilder implements IQueryBuilder {
  private _state: QueryBuilderState;
  private _config: QueryBuilderConfig;

  constructor(config?: Partial<QueryBuilderConfig>) {
    this._state = {
      filters: [],
      sorts: [],
      pagination: {},
      projections: [],
      groups: [],
      aggregations: [],
      having: [],
      joins: [],
    };
    this._config = {
      maxLimit: 1000,
      defaultLimit: 100,
      enableValidation: true,
      enableOptimization: true,
      enableCaching: false,
      ...config,
    };
  }

  where(field: string, operator: string, value: unknown): IQueryBuilder {
    this._state.filters.push({
      field,
      operator,
      value,
      logicalOperator: 'AND',
      negated: false,
    });
    return this;
  }

  andWhere(field: string, operator: string, value: unknown): IQueryBuilder {
    return this.where(field, operator, value);
  }

  orWhere(field: string, operator: string, value: unknown): IQueryBuilder {
    this._state.filters.push({
      field,
      operator,
      value,
      logicalOperator: 'OR',
      negated: false,
    });
    return this;
  }

  notWhere(field: string, operator: string, value: unknown): IQueryBuilder {
    this._state.filters.push({
      field,
      operator,
      value,
      logicalOperator: 'AND',
      negated: true,
    });
    return this;
  }

  orderBy(field: string, direction: string, nullPosition?: string): IQueryBuilder {
    this._state.sorts.push({
      field,
      direction,
      nullPosition: nullPosition || 'LAST',
    });
    return this;
  }

  limit(limit: number): IQueryBuilder {
    if (this._config.enableValidation && this._config.maxLimit) {
      this._state.pagination.limit = Math.min(limit, this._config.maxLimit);
    } else {
      this._state.pagination.limit = limit;
    }
    return this;
  }

  offset(offset: number): IQueryBuilder {
    this._state.pagination.offset = Math.max(0, offset);
    return this;
  }

  cursor(cursor: string): IQueryBuilder {
    this._state.pagination.cursor = cursor;
    return this;
  }

  select(field: string, alias?: string, func?: string): IQueryBuilder {
    this._state.projections.push({
      field,
      alias,
      function: func,
    });
    return this;
  }

  groupBy(field: string): IQueryBuilder {
    this._state.groups.push({
      field,
      aggregations: [],
    });
    return this;
  }

  aggregate(func: string, field: string, alias?: string): IQueryBuilder {
    this._state.aggregations.push({
      function: func,
      field,
      alias,
    });
    return this;
  }

  having(field: string, operator: string, value: unknown): IQueryBuilder {
    this._state.having.push({
      field,
      operator,
      value,
    });
    return this;
  }

  join(type: string, table: string, alias?: string, on?: Array<{ left: string; right: string; operator: string }>): IQueryBuilder {
    const joinClause: JoinClause = {
      type: type as JoinType,
      table,
      alias,
      on: on ? on.map((o) => ({ leftField: o.left, rightField: o.right, operator: o.operator })) : [],
    };
    this._state.joins.push(joinClause);
    return this;
  }

  build(): QueryBuildResult {
    try {
      if (this._config.enableValidation) {
        const validation = this._validateState();
        if (!validation.valid) {
          return {
            success: false,
            warnings: [],
            error: {
              code: 'VALIDATION_ERROR',
              message: validation.errors.join(', '),
            },
          };
        }
      }

      const parsedQuery = this._convertToParsedQuery();

      return {
        success: true,
        query: parsedQuery,
        warnings: [],
      };
    } catch (error) {
      return {
        success: false,
        warnings: [],
        error: {
          code: 'BUILD_ERROR',
          message: error instanceof Error ? error.message : 'Unknown build error',
        },
      };
    }
  }

  reset(): IQueryBuilder {
    this._state = {
      filters: [],
      sorts: [],
      pagination: {},
      projections: [],
      groups: [],
      aggregations: [],
      having: [],
      joins: [],
    };
    return this;
  }

  clone(): IQueryBuilder {
    const cloned = new QueryBuilder(this._config);
    cloned._state = JSON.parse(JSON.stringify(this._state));
    return cloned;
  }

  getState(): QueryBuilderState {
    return JSON.parse(JSON.stringify(this._state));
  }

  setState(state: QueryBuilderState): void {
    this._state = JSON.parse(JSON.stringify(state));
  }

  setConfig(config: Partial<QueryBuilderConfig>): void {
    this._config = { ...this._config, ...config };
  }

  getConfig(): QueryBuilderConfig {
    return { ...this._config };
  }

  getFilters(): FilterClause[] {
    return [...this._state.filters];
  }

  getSorts(): SortClause[] {
    return [...this._state.sorts];
  }

  getLimit(): number | undefined {
    return this._state.pagination.limit;
  }

  getOffset(): number | undefined {
    return this._state.pagination.offset;
  }

  getCursor(): string | undefined {
    return this._state.pagination.cursor;
  }

  hasFilters(): boolean {
    return this._state.filters.length > 0;
  }

  hasSorts(): boolean {
    return this._state.sorts.length > 0;
  }

  hasProjections(): boolean {
    return this._state.projections.length > 0;
  }

  private _validateState(): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (this._state.pagination.limit !== undefined && this._state.pagination.limit < 0) {
      errors.push('Limit cannot be negative');
    }

    if (this._state.pagination.offset !== undefined && this._state.pagination.offset < 0) {
      errors.push('Offset cannot be negative');
    }

    if (this._state.filters.length > 100) {
      errors.push('Too many filters (max 100)');
    }

    if (this._state.sorts.length > 10) {
      errors.push('Too many sorts (max 10)');
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  private _convertToParsedQuery(): any {
    return {
      filters: this._state.filters.map((f) => ({
        field: f.field,
        operator: f.operator,
        value: f.value,
        negated: f.negated,
        logicalOperator: f.logicalOperator,
      })),
      sorts: this._state.sorts.map((s) => ({
        field: s.field,
        direction: s.direction,
        nullPosition: s.nullPosition,
      })),
      pagination: {
        limit: this._state.pagination.limit || this._config.defaultLimit,
        offset: this._state.pagination.offset || 0,
        cursor: this._state.pagination.cursor,
      },
      projections: this._state.projections,
      groups: this._state.groups,
      aggregations: this._state.aggregations,
      having: this._state.having,
      joins: this._state.joins,
    };
  }
}
