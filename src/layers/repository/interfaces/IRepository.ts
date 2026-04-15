/**
 * Repository Interface
 * 
 * Defines the contract for repository operations
 * including data access abstraction and query builders.
 */

import { DomainEntity } from '../../domain/types/domain-types';
import {
  QueryOptions,
  RepositoryResult,
  RepositoryConfig,
} from '../types/repository-types';

/**
 * Interface for repository operations
 */
export interface IRepository<T extends DomainEntity> {
  /**
   * Finds an entity by ID
   * 
   * @param id - Entity ID
   * @returns Repository result with entity
   */
  findById(id: string): Promise<RepositoryResult<T>>;

  /**
   * Finds entities matching query options
   * 
   * @param options - Query options
   * @returns Repository result with array of entities
   */
  find(options?: QueryOptions): Promise<RepositoryResult<T[]>>;

  /**
   * Saves an entity (create or update)
   * 
   * @param entity - Entity to save
   * @returns Repository result with saved entity
   */
  save(entity: T): Promise<RepositoryResult<T>>;

  /**
   * Deletes an entity by ID
   * 
   * @param id - Entity ID
   * @returns Repository result
   */
  delete(id: string): Promise<RepositoryResult<void>>;

  /**
   * Counts entities matching query options
   * 
   * @param options - Query options
   * @returns Repository result with count
   */
  count(options?: QueryOptions): Promise<RepositoryResult<number>>;

  /**
   * Checks if an entity exists by ID
   * 
   * @param id - Entity ID
   * @returns Repository result with boolean
   */
  exists(id: string): Promise<RepositoryResult<boolean>>;

  /**
   * Sets repository configuration
   * 
   * @param config - Repository configuration
   */
  setConfig(config: RepositoryConfig): void;

  /**
   * Gets current repository configuration
   * 
   * @returns Current repository configuration
   */
  getConfig(): RepositoryConfig;

  /**
   * Clears all cached data
   */
  clearCache(): void;
}
