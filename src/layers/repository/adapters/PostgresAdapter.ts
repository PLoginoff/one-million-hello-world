/**
 * Postgres Repository Adapter
 *
 * Stores entities in PostgreSQL. Uses a simulated Postgres client interface
 * that can be backed by pg or any compatible client.
 */

import { IRepositoryAdapter } from './IRepositoryAdapter';
import { DomainEntity } from '../../domain/types/domain-types';
import { QueryOptions, RepositoryResult } from '../types/repository-types';

export interface PostgresClientInterface {
  query(text: string, params?: unknown[]): Promise<{ rows: unknown[]; rowCount: number }>;
  connect(): Promise<void>;
  end(): Promise<void>;
}

export class PostgresAdapter<T extends DomainEntity> implements IRepositoryAdapter<T> {
  private readonly _client: PostgresClientInterface;
  private readonly _tableName: string;
  private _connected: boolean;

  constructor(client: PostgresClientInterface, tableName: string = 'entities') {
    this._client = client;
    this._tableName = tableName;
    this._connected = false;
  }

  getType(): string {
    return 'POSTGRES';
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
  }

  async disconnect(): Promise<void> {
    await this._client.end();
    this._connected = false;
  }

  isConnected(): boolean {
    return this._connected;
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

  async delete(id: string): Promise<RepositoryResult<void>> {
    this._ensureConnected();
    const result = await this._client.query(`DELETE FROM ${this._tableName} WHERE id = $1`, [id]);
    if (result.rowCount === 0) {
      return { success: false, error: { code: 'ENTITY_NOT_FOUND', message: `Entity with ID ${id} not found` } };
    }
    return { success: true };
  }

  async count(_options?: QueryOptions): Promise<RepositoryResult<number>> {
    this._ensureConnected();
    const result = await this._client.query(`SELECT COUNT(*) FROM ${this._tableName}`);
    return { success: true, data: Number((result.rows[0] as { count: string }).count) };
  }

  async clear(): Promise<void> {
    this._ensureConnected();
    await this._client.query(`DELETE FROM ${this._tableName}`);
  }

  private _ensureConnected(): void {
    if (!this._connected) {
      throw new Error('PostgresAdapter is not connected');
    }
  }
}
