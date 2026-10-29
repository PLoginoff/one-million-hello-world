/**
 * In-Memory Repository Adapter
 *
 * Stores entities in a Map. Used for testing and development.
 * Implements full IRepositoryAdapter interface with connection pooling simulation.
 */

import {
  IRepositoryAdapter,
  AdapterConfig,
  ConnectionPoolStats,
  AdapterHealthStatus,
  AdapterMetrics,
  RepositoryTransaction,
} from './IRepositoryAdapter';
import { DomainEntity } from '../../domain/types/domain-types';
import {
  QueryOptions,
  RepositoryResult,
  QueryFilter,
  QuerySort,
  FilterOperator,
  SortDirection,
} from '../types/repository-types';
import { QueryBuilder } from '../implementations/QueryBuilder';
import { IQueryBuilder } from '../interfaces/IQueryBuilder';

interface InMemoryTransaction extends RepositoryTransaction {
  _adapter: InMemoryAdapter<DomainEntity>;
  _operations: Array<() => Promise<void>>;
  _committed: boolean;
  _rolledBack: boolean;
}

export class InMemoryAdapter<T extends DomainEntity> implements IRepositoryAdapter<T> {
  private _data: Map<string, T>;
  private _connected: boolean;
  private _config: AdapterConfig;
  private _queryBuilder: IQueryBuilder;
  private _metrics: AdapterMetrics;
  private _connectionStartTime: number;
  private _poolStats: ConnectionPoolStats;

  constructor(config?: Partial<AdapterConfig>) {
    this._data = new Map();
    this._connected = false;
    this._config = {
      enableQueryLogging: false,
      slowQueryThresholdMs: 100,
      maxRetries: 3,
      retryDelayMs: 100,
      connectionTimeoutMs: 5000,
      queryTimeoutMs: 30000,
      ...config,
    };
    this._queryBuilder = new QueryBuilder();
    this._metrics = this._initMetrics();
    this._connectionStartTime = 0;
    this._poolStats = {
      totalConnections: 0,
      activeConnections: 0,
      idleConnections: 0,
      waitingRequests: 0,
      maxConnections: 1,
      minConnections: 1,
    };
  }

  getType(): string {
    return 'IN_MEMORY';
  }

  getConfig(): AdapterConfig {
    return { ...this._config };
  }

  async connect(): Promise<void> {
    const startTime = Date.now();

    // Simulate connection delay
    await new Promise((resolve) => setTimeout(resolve, 1));

    this._connected = true;
    this._connectionStartTime = Date.now();
    this._poolStats = {
      ...this._poolStats,
      totalConnections: 1,
      activeConnections: 1,
      idleConnections: 0,
    };
    this._metrics.connectionsCreated++;

    if (this._config.enableQueryLogging) {
      console.log(`[InMemoryAdapter] Connected in ${Date.now() - startTime}ms`);
    }
  }

  async disconnect(): Promise<void> {
    if (!this._connected) {
      return;
    }

    this._connected = false;
    this._poolStats = {
      ...this._poolStats,
      activeConnections: 0,
      idleConnections: 0,
    };
    this._metrics.connectionsClosed++;

    if (this._config.enableQueryLogging) {
      console.log('[InMemoryAdapter] Disconnected');
    }
  }

  isConnected(): boolean {
    return this._connected;
  }

  getPoolStats(): ConnectionPoolStats {
    return { ...this._poolStats };
  }

  async healthCheck(): Promise<AdapterHealthStatus> {
    const startTime = Date.now();

    if (!this._connected) {
      return {
        healthy: false,
        latencyMs: Date.now() - startTime,
        lastCheck: new Date(),
        error: 'Not connected',
      };
    }

    // Perform a simple operation to verify connectivity
    try {
      this._data.size; // Simple operation
      return {
        healthy: true,
        latencyMs: Date.now() - startTime,
        lastCheck: new Date(),
      };
    } catch (error) {
      return {
        healthy: false,
        latencyMs: Date.now() - startTime,
        lastCheck: new Date(),
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async findById(id: string): Promise<RepositoryResult<T>> {
    return this._executeQuery('findById', async () => {
      this._ensureConnected();
      const entity = this._data.get(id);

      if (entity === undefined) {
        return {
          success: false,
          error: { code: 'ENTITY_NOT_FOUND', message: `Entity with ID ${id} not found` },
        };
      }

      return { success: true, data: entity };
    });
  }

  async find(options?: QueryOptions): Promise<RepositoryResult<T[]>> {
    return this._executeQuery('find', async () => {
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

      return { success: true, data: results };
    });
  }

  async findOne(options?: QueryOptions): Promise<RepositoryResult<T | null>> {
    const result = await this.find({ ...options, limit: 1 });
    if (!result.success) {
      return { success: false, error: result.error };
    }
    return { success: true, data: result.data?.[0] ?? null };
  }

  async save(entity: T): Promise<RepositoryResult<T>> {
    return this._executeQuery('save', async () => {
      this._ensureConnected();
      entity.updatedAt = new Date();
      this._data.set(entity.id, entity);
      return { success: true, data: entity };
    });
  }

  async saveMany(entities: T[]): Promise<RepositoryResult<T[]>> {
    return this._executeQuery('saveMany', async () => {
      this._ensureConnected();
      const saved: T[] = [];

      for (const entity of entities) {
        entity.updatedAt = new Date();
        this._data.set(entity.id, entity);
        saved.push(entity);
      }

      return { success: true, data: saved };
    });
  }

  async delete(id: string): Promise<RepositoryResult<void>> {
    return this._executeQuery('delete', async () => {
      this._ensureConnected();

      if (!this._data.has(id)) {
        return {
          success: false,
          error: { code: 'ENTITY_NOT_FOUND', message: `Entity with ID ${id} not found` },
        };
      }

      this._data.delete(id);
      return { success: true };
    });
  }

  async deleteMany(ids: string[]): Promise<RepositoryResult<void>> {
    return this._executeQuery('deleteMany', async () => {
      this._ensureConnected();

      for (const id of ids) {
        if (!this._data.has(id)) {
          return {
            success: false,
            error: { code: 'ENTITY_NOT_FOUND', message: `Entity with ID ${id} not found` },
          };
        }
        this._data.delete(id);
      }

      return { success: true };
    });
  }

  async count(options?: QueryOptions): Promise<RepositoryResult<number>> {
    return this._executeQuery('count', async () => {
      this._ensureConnected();

      if (options?.filters !== undefined && options.filters.length > 0) {
        const filtered = await this.find(options);
        return { success: true, data: filtered.data?.length ?? 0 };
      }

      return { success: true, data: this._data.size };
    });
  }

  async exists(id: string): Promise<RepositoryResult<boolean>> {
    return this._executeQuery('exists', async () => {
      this._ensureConnected();
      const exists = this._data.has(id);
      return { success: true, data: exists };
    });
  }

  async executeRawQuery<R>(query: string, params?: unknown[]): Promise<RepositoryResult<R[]>> {
    return this._executeQuery('executeRawQuery', async () => {
      this._ensureConnected();

      if (this._config.enableQueryLogging) {
        console.log(`[InMemoryAdapter] Raw query: ${query}`, params);
      }

      // For in-memory, we only support simple SELECT * queries
      if (query.trim().toUpperCase().startsWith('SELECT')) {
        const result = await this.find();
        return { success: true, data: result.data as unknown as R[] };
      }

      return { success: true, data: [] };
    });
  }

  getQueryBuilder(): IQueryBuilder {
    return this._queryBuilder;
  }

  async clear(): Promise<void> {
    this._ensureConnected();
    this._data.clear();

    if (this._config.enableQueryLogging) {
      console.log('[InMemoryAdapter] Cleared all data');
    }
  }

  async beginTransaction(): Promise<RepositoryTransaction> {
    this._ensureConnected();

    const transaction: InMemoryTransaction = {
      _adapter: this as unknown as InMemoryAdapter<DomainEntity>,
      _operations: [],
      _committed: false,
      _rolledBack: false,

      async commit(): Promise<void> {
        if (this._rolledBack) {
          throw new Error('Cannot commit rolled back transaction');
        }
        if (this._committed) {
          throw new Error('Transaction already committed');
        }

        // Execute all operations
        for (const op of this._operations) {
          await op();
        }
        this._committed = true;
      },

      async rollback(): Promise<void> {
        if (this._committed) {
          throw new Error('Cannot rollback committed transaction');
        }
        this._rolledBack = true;
        this._operations = [];
      },

      async execute<R>(query: string, params?: unknown[]): Promise<R[]> {
        const result = await this._adapter.executeRawQuery<R>(query, params);
        if (!result.success) {
          throw new Error(result.error?.message ?? 'Query failed');
        }
        return result.data ?? [];
      },

      async save<T extends DomainEntity>(entity: T): Promise<T> {
        const result = await this._adapter.save(entity);
        if (!result.success) {
          throw new Error(result.error?.message ?? 'Save failed');
        }
        return result.data as T;
      },

      async delete(id: string): Promise<void> {
        const result = await this._adapter.delete(id);
        if (!result.success) {
          throw new Error(result.error?.message ?? 'Delete failed');
        }
      },
    };

    return transaction;
  }

  getMetrics(): AdapterMetrics {
    return { ...this._metrics };
  }

  getSize(): number {
    return this._data.size;
  }

  private _initMetrics(): AdapterMetrics {
    return {
      queriesExecuted: 0,
      queriesSucceeded: 0,
      queriesFailed: 0,
      averageQueryTimeMs: 0,
      slowQueries: 0,
      connectionsCreated: 0,
      connectionsClosed: 0,
      connectionErrors: 0,
    };
  }

  private async _executeQuery<R>(
    operation: string,
    queryFn: () => Promise<RepositoryResult<R>>
  ): Promise<RepositoryResult<R>> {
    const startTime = Date.now();
    this._metrics.queriesExecuted++;

    try {
      const result = await queryFn();

      const duration = Date.now() - startTime;
      this._updateMetrics(duration, true);

      if (this._config.enableQueryLogging && duration > (this._config.slowQueryThresholdMs ?? 100)) {
        console.warn(`[InMemoryAdapter] Slow query: ${operation} took ${duration}ms`);
      }

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      this._updateMetrics(duration, false);
      this._metrics.lastErrorTime = new Date();

      if (this._config.enableQueryLogging) {
        console.error(`[InMemoryAdapter] Query failed: ${operation}`, error);
      }

      // Re-throw connection errors to let caller handle them
      if (error instanceof Error && error.message.includes('not connected')) {
        throw error;
      }

      return {
        success: false,
        error: {
          code: 'QUERY_ERROR',
          message: error instanceof Error ? error.message : 'Unknown query error',
        },
      };
    }
  }

  private _updateMetrics(duration: number, success: boolean): void {
    if (success) {
      this._metrics.queriesSucceeded++;
    } else {
      this._metrics.queriesFailed++;
    }

    // Update average query time
    const totalQueries = this._metrics.queriesSucceeded + this._metrics.queriesFailed;
    this._metrics.averageQueryTimeMs =
      (this._metrics.averageQueryTimeMs * (totalQueries - 1) + duration) / totalQueries;

    // Track slow queries
    if (duration > (this._config.slowQueryThresholdMs ?? 100)) {
      this._metrics.slowQueries++;
    }

    this._metrics.lastQueryTime = new Date();
  }

  private _ensureConnected(): void {
    if (!this._connected) {
      this._metrics.connectionErrors++;
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
