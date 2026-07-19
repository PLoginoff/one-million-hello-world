/**
 * Redis Repository Adapter
 *
 * Stores entities in Redis. Uses a simulated Redis client interface
 * that can be backed by ioredis or any compatible client.
 */

import { IRepositoryAdapter } from './IRepositoryAdapter';
import { DomainEntity } from '../../domain/types/domain-types';
import { QueryOptions, RepositoryResult } from '../types/repository-types';

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
  private _connected: boolean;

  constructor(client: RedisClientInterface, keyPrefix: string = 'repo:') {
    this._client = client;
    this._keyPrefix = keyPrefix;
    this._connected = false;
  }

  getType(): string {
    return 'REDIS';
  }

  async connect(): Promise<void> {
    const response = await this._client.ping();
    if (response !== 'PONG') {
      throw new Error(`Redis ping failed: ${response}`);
    }
    this._connected = true;
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

  async save(entity: T): Promise<RepositoryResult<T>> {
    this._ensureConnected();
    entity.updatedAt = new Date();
    await this._client.set(this._key(entity.id), JSON.stringify(entity));
    return { success: true, data: entity };
  }

  async delete(id: string): Promise<RepositoryResult<void>> {
    this._ensureConnected();
    const deleted = await this._client.del(this._key(id));
    if (deleted === 0) {
      return { success: false, error: { code: 'ENTITY_NOT_FOUND', message: `Entity with ID ${id} not found` } };
    }
    return { success: true };
  }

  async count(_options?: QueryOptions): Promise<RepositoryResult<number>> {
    this._ensureConnected();
    const keys = await this._client.keys(`${this._keyPrefix}*`);
    return { success: true, data: keys.length };
  }

  async clear(): Promise<void> {
    this._ensureConnected();
    const keys = await this._client.keys(`${this._keyPrefix}*`);
    for (const key of keys) {
      await this._client.del(key);
    }
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
