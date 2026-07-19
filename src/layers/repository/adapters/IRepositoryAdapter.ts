/**
 * Repository Adapter Interface
 *
 * Defines contract for different storage backend adapters.
 * Each adapter implements data access for a specific storage technology.
 */

import { DomainEntity } from '../../domain/types/domain-types';
import { QueryOptions, RepositoryResult } from '../types/repository-types';

export interface IRepositoryAdapter<T extends DomainEntity> {
  /**
   * Get adapter type name
   */
  getType(): string;

  /**
   * Connect to the storage backend
   */
  connect(): Promise<void>;

  /**
   * Disconnect from the storage backend
   */
  disconnect(): Promise<void>;

  /**
   * Check if adapter is connected
   */
  isConnected(): boolean;

  /**
   * Find entity by ID
   */
  findById(id: string): Promise<RepositoryResult<T>>;

  /**
   * Find entities matching query options
   */
  find(options?: QueryOptions): Promise<RepositoryResult<T[]>>;

  /**
   * Save entity (create or update)
   */
  save(entity: T): Promise<RepositoryResult<T>>;

  /**
   * Delete entity by ID
   */
  delete(id: string): Promise<RepositoryResult<void>>;

  /**
   * Count entities matching query options
   */
  count(options?: QueryOptions): Promise<RepositoryResult<number>>;

  /**
   * Clear all data (for testing)
   */
  clear(): Promise<void>;
}
