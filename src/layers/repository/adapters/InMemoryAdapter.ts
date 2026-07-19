/**
 * In-Memory Repository Adapter
 *
 * Stores entities in a Map. Used for testing and development.
 */

import { IRepositoryAdapter } from './IRepositoryAdapter';
import { DomainEntity } from '../../domain/types/domain-types';
import { QueryOptions, RepositoryResult, QueryFilter, QuerySort } from '../types/repository-types';
import { FilterOperator, SortDirection } from '../types/repository-types';

export class InMemoryAdapter<T extends DomainEntity> implements IRepositoryAdapter<T> {
  private _data: Map<string, T>;
  private _connected: boolean;

  constructor() {
    this._data = new Map();
    this._connected = false;
  }

  getType(): string {
    return 'IN_MEMORY';
  }

  async connect(): Promise<void> {
    this._connected = true;
    return Promise.resolve();
  }

  async disconnect(): Promise<void> {
    this._connected = false;
    return Promise.resolve();
  }

  isConnected(): boolean {
    return this._connected;
  }

  async findById(id: string): Promise<RepositoryResult<T>> {
    this._ensureConnected();
    const entity = this._data.get(id);
    if (entity === undefined) {
      return Promise.resolve({
        success: false,
        error: { code: 'ENTITY_NOT_FOUND', message: `Entity with ID ${id} not found` },
      });
    }
    return Promise.resolve({ success: true, data: entity });
  }

  async find(options?: QueryOptions): Promise<RepositoryResult<T[]>> {
    this._ensureConnected();
    let results = Array.from(this._data.values());

    if (options?.filters !== undefined && options.filters.length > 0) {
      results = results.filter((entity) => this._matchesAllFilters(entity, options.filters!));
    }

    if (options?.sorts !== undefined && options.sorts.length > 0) {
      results = this._applySorts(results, options.sorts);
    }

    if (options?.offset !== undefined) {
      results = results.slice(options.offset);
    }

    if (options?.limit !== undefined) {
      results = results.slice(0, options.limit);
    }

    return Promise.resolve({ success: true, data: results });
  }

  async save(entity: T): Promise<RepositoryResult<T>> {
    this._ensureConnected();
    entity.updatedAt = new Date();
    this._data.set(entity.id, entity);
    return Promise.resolve({ success: true, data: entity });
  }

  async delete(id: string): Promise<RepositoryResult<void>> {
    this._ensureConnected();
    if (!this._data.has(id)) {
      return Promise.resolve({
        success: false,
        error: { code: 'ENTITY_NOT_FOUND', message: `Entity with ID ${id} not found` },
      });
    }
    this._data.delete(id);
    return Promise.resolve({ success: true });
  }

  async count(options?: QueryOptions): Promise<RepositoryResult<number>> {
    this._ensureConnected();
    if (options?.filters !== undefined && options.filters.length > 0) {
      const filtered = await this.find(options);
      return Promise.resolve({ success: true, data: filtered.data?.length ?? 0 });
    }
    return Promise.resolve({ success: true, data: this._data.size });
  }

  async clear(): Promise<void> {
    this._data.clear();
    return Promise.resolve();
  }

  getSize(): number {
    return this._data.size;
  }

  private _ensureConnected(): void {
    if (!this._connected) {
      throw new Error('InMemoryAdapter is not connected');
    }
  }

  private _matchesAllFilters(entity: T, filters: QueryFilter[]): boolean {
    return filters.every((filter) => this._matchesFilter(entity, filter));
  }

  private _matchesFilter(entity: T, filter: QueryFilter): boolean {
    const entityRecord = entity as unknown as Record<string, unknown>;
    const fieldValue = entityRecord[filter.field];

    switch (filter.operator) {
      case FilterOperator.EQUALS:
        return fieldValue === filter.value;
      case FilterOperator.NOT_EQUALS:
        return fieldValue !== filter.value;
      case FilterOperator.CONTAINS:
        return typeof fieldValue === 'string' && typeof filter.value === 'string' && fieldValue.includes(filter.value);
      case FilterOperator.STARTS_WITH:
        return (
          typeof fieldValue === 'string' && typeof filter.value === 'string' && fieldValue.startsWith(filter.value)
        );
      case FilterOperator.ENDS_WITH:
        return typeof fieldValue === 'string' && typeof filter.value === 'string' && fieldValue.endsWith(filter.value);
      case FilterOperator.GREATER_THAN:
        return typeof fieldValue === 'number' && typeof filter.value === 'number' && fieldValue > filter.value;
      case FilterOperator.LESS_THAN:
        return typeof fieldValue === 'number' && typeof filter.value === 'number' && fieldValue < filter.value;
      case FilterOperator.GREATER_THAN_OR_EQUALS:
        return typeof fieldValue === 'number' && typeof filter.value === 'number' && fieldValue >= filter.value;
      case FilterOperator.LESS_THAN_OR_EQUALS:
        return typeof fieldValue === 'number' && typeof filter.value === 'number' && fieldValue <= filter.value;
      case FilterOperator.IN:
        return Array.isArray(filter.value) && filter.value.includes(fieldValue);
      case FilterOperator.NOT_IN:
        return Array.isArray(filter.value) && !filter.value.includes(fieldValue);
      default:
        return false;
    }
  }

  private _applySorts(data: T[], sorts: QuerySort[]): T[] {
    const sorted = [...data];
    sorted.sort((a, b) => {
      for (const sort of sorts) {
        const aRecord = a as unknown as Record<string, unknown>;
        const bRecord = b as unknown as Record<string, unknown>;
        const aVal = aRecord[sort.field];
        const bVal = bRecord[sort.field];

        if (aVal === bVal) continue;
        const aStr = String(aVal);
        const bStr = String(bVal);
        const comparison = aStr < bStr ? -1 : 1;
        return sort.direction === SortDirection.ASC ? comparison : -comparison;
      }
      return 0;
    });
    return sorted;
  }
}
