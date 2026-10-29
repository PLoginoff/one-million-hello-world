/**
 * Postgres Repository Adapter
 *
 * Stores entities in PostgreSQL. Uses a simulated Postgres client interface
 * that can be backed by pg or any compatible client.
 */

import { IRepositoryAdapter, AdapterConfig, AdapterHealthStatus, AdapterMetrics, ConnectionPoolStats, RepositoryTransaction } from './IRepositoryAdapter';
import { DomainEntity } from '../../domain/types/domain-types';
import { QueryOptions, RepositoryResult } from '../types/repository-types';
import { IQueryBuilder } from '../interfaces/IQueryBuilder';
import { QueryBuilder } from '../implementations/QueryBuilder';

export interface PostgresClientInterface {
  query(text: string, params?: unknown[]): Promise<{ rows: unknown[]; rowCount: number }>;
  connect(): Promise<void>;
  end(): Promise<void>;
}

export class PostgresAdapter<T extends DomainEntity> implements IRepositoryAdapter<T> {
  private readonly _client: PostgresClientInterface;
  private readonly _tableName: string;
  private readonly _config: AdapterConfig;
  private _connected: boolean;
  private readonly _metrics: AdapterMetrics;

  constructor(client: PostgresClientInterface, tableName: string = 'entities', config?: AdapterConfig) {
    this._client = client;
    this._tableName = tableName;
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
    return 'POSTGRES';
  }

  getConfig(): AdapterConfig {
    return { ...this._config };
  }

  async connect(): Promise<void> {
    await this._client.connect();
    await this._client.query(`
      CREATE TABLE IF NOT EXISTS ${this._tableName} (
        id TEXT PRIMARY KEY,
        data JSONB NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    this._connected = true;
    this._metrics.connectionsCreated++;
  }

  async disconnect(): Promise<void> {
    await this._client.end();
    this._connected = false;
    this._metrics.connectionsClosed++;
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
      await this._client.query('SELECT 1');
      return { healthy: true, latencyMs: Date.now() - start, lastCheck: new Date() };
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
    const result = await this._client.query(`SELECT data FROM ${this._tableName} WHERE id = $1`, [id]);
    if (result.rows.length === 0) {
      return { success: false, error: { code: 'ENTITY_NOT_FOUND', message: `Entity with ID ${id} not found` } };
    }
    return { success: true, data: (result.rows[0] as { data: T }).data };
  }

  async find(_options?: QueryOptions): Promise<RepositoryResult<T[]>> {
    this._ensureConnected();
    const result = await this._client.query(`SELECT data FROM ${this._tableName}`);
    return { success: true, data: result.rows.map((r) => (r as { data: T }).data) };
  }

  async findOne(options?: QueryOptions): Promise<RepositoryResult<T | null>> {
    this._ensureConnected();
    const result = await this._client.query(`SELECT data FROM ${this._tableName} LIMIT 1`);
    if (result.rows.length === 0) {
      return { success: true, data: null };
    }
    return { success: true, data: (result.rows[0] as { data: T }).data };
  }

  async save(entity: T): Promise<RepositoryResult<T>> {
    this._ensureConnected();
    entity.updatedAt = new Date();
    await this._client.query(
      `INSERT INTO ${this._tableName} (id, data, updated_at) VALUES ($1, $2, NOW())
       ON CONFLICT (id) DO UPDATE SET data = $2, updated_at = NOW()`,
      [entity.id, JSON.stringify(entity)]
    );
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
    const result = await this._client.query(`DELETE FROM ${this._tableName} WHERE id = $1`, [id]);
    if (result.rowCount === 0) {
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
    const result = await this._client.query(`SELECT COUNT(*) FROM ${this._tableName}`);
    return { success: true, data: Number((result.rows[0] as { count: string }).count) };
  }

  async exists(id: string): Promise<RepositoryResult<boolean>> {
    this._ensureConnected();
    const result = await this._client.query(`SELECT 1 FROM ${this._tableName} WHERE id = $1`, [id]);
    return { success: true, data: result.rows.length > 0 };
  }

  async executeRawQuery<R>(query: string, params?: unknown[]): Promise<RepositoryResult<R[]>> {
    this._ensureConnected();
    try {
      const result = await this._client.query(query, params);
      return { success: true, data: result.rows as R[] };
    } catch (error) {
      return {
        success: false,
        error: { code: 'QUERY_ERROR', message: error instanceof Error ? error.message : 'Unknown error' },
      };
    }
  }

  getQueryBuilder(): IQueryBuilder {
    return new QueryBuilder();
  }

  async clear(): Promise<void> {
    this._ensureConnected();
    await this._client.query(`DELETE FROM ${this._tableName}`);
  }

  async beginTransaction(): Promise<RepositoryTransaction> {
    this._ensureConnected();
    return new PostgresTransaction(this._client, this._tableName);
  }

  getMetrics(): AdapterMetrics {
    return { ...this._metrics };
  }

  private _ensureConnected(): void {
    if (!this._connected) {
      throw new Error('PostgresAdapter is not connected');
    }
  }
}

class PostgresTransaction implements RepositoryTransaction {
  constructor(
    private readonly _client: PostgresClientInterface,
    private readonly _tableName: string
  ) {}

  async commit(): Promise<void> {
    await this._client.query('COMMIT');
  }

  async rollback(): Promise<void> {
    await this._client.query('ROLLBACK');
  }

  async execute<R>(query: string, params?: unknown[]): Promise<R[]> {
    const result = await this._client.query(query, params);
    return result.rows as R[];
  }

  async save<T extends DomainEntity>(entity: T): Promise<T> {
    entity.updatedAt = new Date();
    await this._client.query(
      `INSERT INTO ${this._tableName} (id, data, updated_at) VALUES ($1, $2, NOW())
       ON CONFLICT (id) DO UPDATE SET data = $2, updated_at = NOW()`,
      [entity.id, JSON.stringify(entity)]
    );
    return entity;
  }

  async delete(id: string): Promise<void> {
    await this._client.query(`DELETE FROM ${this._tableName} WHERE id = $1`, [id]);
  }
}
