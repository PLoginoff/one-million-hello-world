/**
 * Redis Repository Adapter
 *
 * Stores entities in Redis. Uses a simulated Redis client interface
 * that can be backed by ioredis or any compatible client.
 */

import { IRepositoryAdapter, AdapterConfig, AdapterHealthStatus, AdapterMetrics, ConnectionPoolStats, RepositoryTransaction } from './IRepositoryAdapter';
import { DomainEntity } from '../../domain/types/domain-types';
import { QueryOptions, RepositoryResult } from '../types/repository-types';
import { IQueryBuilder } from '../interfaces/IQueryBuilder';
import { QueryBuilder } from '../implementations/QueryBuilder';

export interface RedisClientInterface {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  del(key: string): Promise<number>;
  keys(pattern: string): Promise<string[]>;
  ping(): Promise<string>;
}

export class RedisAdapter<T extends DomainEntity> implements IRepositoryAdapter<T> {
  private readonly _client: RedisClientInterface;
  private readonly _keyPrefix: string;
  private readonly _config: AdapterConfig;
  private _connected: boolean;
  private readonly _metrics: AdapterMetrics;

  constructor(client: RedisClientInterface, keyPrefix: string = 'repo:', config?: AdapterConfig) {
    this._client = client;
    this._keyPrefix = keyPrefix;
    this._config = config ?? {};
    this._connected = false;
    this._metrics = {
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

  getType(): string {
    return 'REDIS';
  }

  getConfig(): AdapterConfig {
    return { ...this._config };
  }

  async connect(): Promise<void> {
    const response = await this._client.ping();
    if (response !== 'PONG') {
      throw new Error(`Redis ping failed: ${response}`);
    }
    this._connected = true;
    this._metrics.connectionsCreated++;
  }

  async disconnect(): Promise<void> {
    this._connected = false;
    this._metrics.connectionsClosed++;
    return Promise.resolve();
  }

  isConnected(): boolean {
    return this._connected;
  }

  getPoolStats(): ConnectionPoolStats | null {
    return null;
  }

  async healthCheck(): Promise<AdapterHealthStatus> {
    const start = Date.now();
    try {
      const response = await this._client.ping();
      return {
        healthy: response === 'PONG',
        latencyMs: Date.now() - start,
        lastCheck: new Date(),
      };
    } catch (error) {
      return {
        healthy: false,
        latencyMs: Date.now() - start,
        lastCheck: new Date(),
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async findById(id: string): Promise<RepositoryResult<T>> {
    this._ensureConnected();
    const raw = await this._client.get(this._key(id));
    if (raw === null) {
      return { success: false, error: { code: 'ENTITY_NOT_FOUND', message: `Entity with ID ${id} not found` } };
    }
    return { success: true, data: JSON.parse(raw) as T };
  }

  async find(_options?: QueryOptions): Promise<RepositoryResult<T[]>> {
    this._ensureConnected();
    const keys = await this._client.keys(`${this._keyPrefix}*`);
    const entities: T[] = [];
    for (const key of keys) {
      const raw = await this._client.get(key);
      if (raw !== null) {
        entities.push(JSON.parse(raw) as T);
      }
    }
    return { success: true, data: entities };
  }

  async findOne(_options?: QueryOptions): Promise<RepositoryResult<T | null>> {
    this._ensureConnected();
    const keys = await this._client.keys(`${this._keyPrefix}*`);
    if (keys.length === 0) {
      return { success: true, data: null };
    }
    const raw = await this._client.get(keys[0]);
    if (raw === null) {
      return { success: true, data: null };
    }
    return { success: true, data: JSON.parse(raw) as T };
  }

  async save(entity: T): Promise<RepositoryResult<T>> {
    this._ensureConnected();
    entity.updatedAt = new Date();
    await this._client.set(this._key(entity.id), JSON.stringify(entity));
    return { success: true, data: entity };
  }

  async saveMany(entities: T[]): Promise<RepositoryResult<T[]>> {
    this._ensureConnected();
    const saved: T[] = [];
    for (const entity of entities) {
      const result = await this.save(entity);
      if (result.success && result.data) {
        saved.push(result.data);
      }
    }
    return { success: true, data: saved };
  }

  async delete(id: string): Promise<RepositoryResult<void>> {
    this._ensureConnected();
    const deleted = await this._client.del(this._key(id));
    if (deleted === 0) {
      return { success: false, error: { code: 'ENTITY_NOT_FOUND', message: `Entity with ID ${id} not found` } };
    }
    return { success: true };
  }

  async deleteMany(ids: string[]): Promise<RepositoryResult<void>> {
    this._ensureConnected();
    for (const id of ids) {
      await this.delete(id);
    }
    return { success: true };
  }

  async count(_options?: QueryOptions): Promise<RepositoryResult<number>> {
    this._ensureConnected();
    const keys = await this._client.keys(`${this._keyPrefix}*`);
    return { success: true, data: keys.length };
  }

  async exists(id: string): Promise<RepositoryResult<boolean>> {
    this._ensureConnected();
    const raw = await this._client.get(this._key(id));
    return { success: true, data: raw !== null };
  }

  async executeRawQuery<R>(query: string, _params?: unknown[]): Promise<RepositoryResult<R[]>> {
    this._ensureConnected();
    return {
      success: false,
      error: { code: 'UNSUPPORTED', message: 'Raw queries are not supported on Redis adapter' },
    };
  }

  getQueryBuilder(): IQueryBuilder {
    return new QueryBuilder();
  }

  async clear(): Promise<void> {
    this._ensureConnected();
    const keys = await this._client.keys(`${this._keyPrefix}*`);
    for (const key of keys) {
      await this._client.del(key);
    }
  }

  async beginTransaction(): Promise<RepositoryTransaction> {
    this._ensureConnected();
    return new RedisTransaction(this._client, this._keyPrefix);
  }

  getMetrics(): AdapterMetrics {
    return { ...this._metrics };
  }

  private _key(id: string): string {
    return `${this._keyPrefix}${id}`;
  }

  private _ensureConnected(): void {
    if (!this._connected) {
      throw new Error('RedisAdapter is not connected');
    }
  }
}

class RedisTransaction implements RepositoryTransaction {
  constructor(
    private readonly _client: RedisClientInterface,
    private readonly _keyPrefix: string
  ) {}

  async commit(): Promise<void> {
    // Redis doesn't support transactions in this simulated client
    return Promise.resolve();
  }

  async rollback(): Promise<void> {
    // Redis doesn't support transactions in this simulated client
    return Promise.resolve();
  }

  async execute<R>(_query: string, _params?: unknown[]): Promise<R[]> {
    return Promise.resolve([]);
  }

  async save<T extends DomainEntity>(entity: T): Promise<T> {
    entity.updatedAt = new Date();
    await this._client.set(`${this._keyPrefix}${entity.id}`, JSON.stringify(entity));
    return entity;
  }

  async delete(id: string): Promise<void> {
    await this._client.del(`${this._keyPrefix}${id}`);
  }
}
