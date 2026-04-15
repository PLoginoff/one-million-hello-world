/**
 * Repository Implementation
 * 
 * Concrete implementation of IRepository.
 * Handles data access abstraction and query building.
 */

import { IRepository } from '../interfaces/IRepository';
import { DomainEntity } from '../../domain/types/domain-types';
import {
  QueryOptions,
  RepositoryResult,
  RepositoryConfig,
  QueryFilter,
  QuerySort,
  FilterOperator,
  SortDirection,
} from '../types/repository-types';

export class Repository<T extends DomainEntity> implements IRepository<T> {
  private _data: Map<string, T>;
  private _config: RepositoryConfig;
  private _cache: Map<string, { data: unknown; timestamp: number }>;

  constructor() {
    this._data = new Map();
    this._config = {
      enableCaching: false,
      cacheTimeout: 60000,
      enableTransaction: false,
    };
    this._cache = new Map();
  }

  async findById(id: string): Promise<RepositoryResult<T>> {
    const entity = this._data.get(id);

    if (!entity) {
      return {
        success: false,
        error: {
          code: 'ENTITY_NOT_FOUND',
          message: `Entity with ID ${id} not found`,
        },
      };
    }

    return { success: true, data: entity };
  }

  async find(options?: QueryOptions): Promise<RepositoryResult<T[]>> {
    let results = Array.from(this._data.values());

    if (options?.filters) {
      results = this._applyFilters(results, options.filters);
    }

    if (options?.sorts) {
      results = this._applySorts(results, options.sorts);
    }

    if (options?.offset !== undefined) {
      results = results.slice(options.offset);
    }

    if (options?.limit !== undefined) {
      results = results.slice(0, options.limit);
    }

    return { success: true, data: results };
  }

  async save(entity: T): Promise<RepositoryResult<T>> {
    entity.updatedAt = new Date();
    this._data.set(entity.id, entity);
    return { success: true, data: entity };
  }

  async delete(id: string): Promise<RepositoryResult<void>> {
    if (!this._data.has(id)) {
      return {
        success: false,
        error: {
          code: 'ENTITY_NOT_FOUND',
          message: `Entity with ID ${id} not found`,
        },
      };
    }

    this._data.delete(id);
    return { success: true };
  }

  async count(options?: QueryOptions): Promise<RepositoryResult<number>> {
    const result = await this.find(options);
    if (!result.success) {
      return { success: false, error: result.error };
    }

    return { success: true, data: result.data?.length || 0 };
  }

  async exists(id: string): Promise<RepositoryResult<boolean>> {
    const exists = this._data.has(id);
    return { success: true, data: exists };
  }

  setConfig(config: RepositoryConfig): void {
    this._config = { ...this._config, ...config };
  }

  getConfig(): RepositoryConfig {
    return { ...this._config };
  }

  clearCache(): void {
    this._cache.clear();
  }

  private _applyFilters(entities: T[], filters: QueryFilter[]): T[] {
    return entities.filter((entity) => {
      return filters.every((filter) => this._applyFilter(entity, filter));
    });
  }

  private _applyFilter(entity: T, filter: QueryFilter): boolean {
    const fieldValue = (entity as Record<string, unknown>)[filter.field];
    const filterValue = filter.value;

    switch (filter.operator) {
      case FilterOperator.EQUALS:
        return fieldValue === filterValue;
      case FilterOperator.NOT_EQUALS:
        return fieldValue !== filterValue;
      case FilterOperator.CONTAINS:
        return typeof fieldValue === 'string' && fieldValue.includes(filterValue as string);
      case FilterOperator.STARTS_WITH:
        return typeof fieldValue === 'string' && fieldValue.startsWith(filterValue as string);
      case FilterOperator.ENDS_WITH:
        return typeof fieldValue === 'string' && fieldValue.endsWith(filterValue as string);
      case FilterOperator.GREATER_THAN:
        return typeof fieldValue === 'number' && fieldValue > (filterValue as number);
      case FilterOperator.LESS_THAN:
        return typeof fieldValue === 'number' && fieldValue < (filterValue as number);
      case FilterOperator.GREATER_THAN_OR_EQUALS:
        return typeof fieldValue === 'number' && fieldValue >= (filterValue as number);
      case FilterOperator.LESS_THAN_OR_EQUALS:
        return typeof fieldValue === 'number' && fieldValue <= (filterValue as number);
      case FilterOperator.IN:
        return Array.isArray(filterValue) && filterValue.includes(fieldValue);
      case FilterOperator.NOT_IN:
        return Array.isArray(filterValue) && !filterValue.includes(fieldValue);
      default:
        return true;
    }
  }

  private _applySorts(entities: T[], sorts: QuerySort[]): T[] {
    return [...entities].sort((a, b) => {
      for (const sort of sorts) {
        const aValue = String((a as Record<string, unknown>)[sort.field] || '');
        const bValue = String((b as Record<string, unknown>)[sort.field] || '');

        if (aValue < bValue) {
          return sort.direction === SortDirection.ASC ? -1 : 1;
        }
        if (aValue > bValue) {
          return sort.direction === SortDirection.ASC ? 1 : -1;
        }
      }
      return 0;
    });
  }
}
