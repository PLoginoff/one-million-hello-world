/**
 * Saga Configuration Repository
 *
 * Infrastructure repository for persisting saga configurations.
 * Provides data access operations for saga config storage.
 */

import { SagaConfig } from '../../domain/value-objects/SagaConfig';

export interface SagaConfigRepository {
  save(config: SagaConfig): Promise<void>;
  findByName(name: string): Promise<SagaConfig | null>;
  findAll(): Promise<SagaConfig[]>;
  delete(name: string): Promise<void>;
  exists(name: string): Promise<boolean>;
}

export class InMemorySagaConfigRepository implements SagaConfigRepository {
  private readonly _storage: Map<string, SagaConfig>;

  constructor() {
    this._storage = new Map();
  }

  async save(config: SagaConfig): Promise<void> {
    this._storage.set(config.getName(), config);
  }

  async findByName(name: string): Promise<SagaConfig | null> {
    return this._storage.get(name) || null;
  }

  async findAll(): Promise<SagaConfig[]> {
    return Array.from(this._storage.values());
  }

  async delete(name: string): Promise<void> {
    this._storage.delete(name);
  }

  async exists(name: string): Promise<boolean> {
    return this._storage.has(name);
  }

  clear(): void {
    this._storage.clear();
  }
}
