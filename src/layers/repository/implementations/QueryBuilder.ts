/**
 * Query Builder Implementation
 * 
 * Concrete implementation of IQueryBuilder.
 * Provides fluent API for building complex database queries.
 */

import { IQueryBuilder } from '../interfaces/IQueryBuilder';
import {
  QueryFilter,
  QuerySort,
  QueryOptions,
  FilterOperator,
  SortDirection,
} from '../types/repository-types';
import {
  QueryBuilderState,
  QueryBuilderConfig,
} from '../types/query-builder-types';

export class QueryBuilder implements IQueryBuilder {
  private _state: QueryBuilderState;
  private _config: QueryBuilderConfig;

  constructor(config?: QueryBuilderConfig) {
    this._state = {
      filters: [],
      sorts: [],
    };
    this._config = {
      maxLimit: 1000,
      defaultLimit: 100,
      enableValidation: true,
      ...config,
    };
  }

  where(field: string, operator: string, value: unknown): IQueryBuilder {
    const filterOperator = this._parseOperator(operator);
    this._state.filters.push({
      field,
      operator: filterOperator,
      value,
    });
    return this;
  }

  andWhere(field: string, operator: string, value: unknown): IQueryBuilder {
    return this.where(field, operator, value);
  }

  orWhere(field: string, operator: string, value: unknown): IQueryBuilder {
    const filterOperator = this._parseOperator(operator);
    this._state.filters.push({
      field,
      operator: filterOperator,
      value,
    });
    return this;
  }

  orderBy(field: string, direction: string): IQueryBuilder {
    const sortDirection = this._parseDirection(direction);
    this._state.sorts.push({
      field,
      direction: sortDirection,
    });
    return this;
  }

  limit(limit: number): IQueryBuilder {
    if (this._config.enableValidation && this._config.maxLimit) {
      this._state.limit = Math.min(limit, this._config.maxLimit);
    } else {
      this._state.limit = limit;
    }
    return this;
  }

  offset(offset: number): IQueryBuilder {
    this._state.offset = Math.max(0, offset);
    return this;
  }

  build(): QueryOptions {
    const options: QueryOptions = {};

    if (this._state.filters.length > 0) {
      options.filters = [...this._state.filters];
    }

    if (this._state.sorts.length > 0) {
      options.sorts = [...this._state.sorts];
    }

    if (this._state.limit !== undefined) {
      options.limit = this._state.limit;
    } else if (this._config.defaultLimit) {
      options.limit = this._config.defaultLimit;
    }

    if (this._state.offset !== undefined) {
      options.offset = this._state.offset;
    }

    return options;
  }

  reset(): IQueryBuilder {
    this._state = {
      filters: [],
      sorts: [],
    };
    return this;
  }

  getFilters(): QueryFilter[] {
    return [...this._state.filters];
  }

  getSorts(): QuerySort[] {
    return [...this._state.sorts];
  }

  getLimit(): number | undefined {
    return this._state.limit;
  }

  getOffset(): number | undefined {
    return this._state.offset;
  }

  private _parseOperator(operator: string): FilterOperator {
    const upperOperator = operator.toUpperCase();
    
    if (Object.values(FilterOperator).includes(upperOperator as FilterOperator)) {
      return upperOperator as FilterOperator;
    }

    switch (upperOperator) {
      case '=':
      case '==':
        return FilterOperator.EQUALS;
      case '!=':
      case '<>':
        return FilterOperator.NOT_EQUALS;
      case '>':
        return FilterOperator.GREATER_THAN;
      case '<':
        return FilterOperator.LESS_THAN;
      case '>=':
        return FilterOperator.GREATER_THAN_OR_EQUALS;
      case '<=':
        return FilterOperator.LESS_THAN_OR_EQUALS;
      default:
        return FilterOperator.EQUALS;
    }
  }

  private _parseDirection(direction: string): SortDirection {
    const upperDirection = direction.toUpperCase();
    
    if (upperDirection === 'DESC' || upperDirection === 'DESCENDING') {
      return SortDirection.DESC;
    }
    
    return SortDirection.ASC;
  }
}
