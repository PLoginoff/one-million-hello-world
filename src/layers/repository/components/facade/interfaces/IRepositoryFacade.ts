/**
 * Repository Facade Interface
 * 
 * Defines the contract for the repository facade that provides a unified interface.
 */

import { DomainEntity } from '../../../../domain/types/domain-types';
import {
  RepositoryFacadeConfig,
  RepositoryFacadeResult,
  FacadeQueryOptions,
  BulkOperationOptions,
  RepositoryFacadeStats,
  HealthCheckResult,
} from '../types/facade-types';

/**
 * Interface for repository facade operations
 */
export interface IRepositoryFacade<T extends DomainEntity> {
  /**
   * Finds entities matching query options
   * 
   * @param options - Facade query options
   * @returns Repository facade result with array of entities
   */
  find(options?: FacadeQueryOptions): Promise<RepositoryFacadeResult<T[]>>;

  /**
   * Finds an entity by ID
   * 
   * @param id - Entity ID
   * @param options - Facade query options
   * @returns Repository facade result with entity
   */
  findById(id: string, options?: FacadeQueryOptions): Promise<RepositoryFacadeResult<T>>;

  /**
   * Finds one entity matching query options
   * 
   * @param options - Facade query options
   * @returns Repository facade result with entity or null
   */
  findOne(options?: FacadeQueryOptions): Promise<RepositoryFacadeResult<T | null>>;

  /**
   * Saves an entity (create or update)
   * 
   * @param entity - Entity to save
   * @param options - Facade query options
   * @returns Repository facade result with saved entity
   */
  save(entity: T, options?: FacadeQueryOptions): Promise<RepositoryFacadeResult<T>>;

  /**
   * Updates an entity
   * 
   * @param id - Entity ID
   * @param updates - Partial updates
   * @param options - Facade query options
   * @returns Repository facade result with updated entity
   */
  update(id: string, updates: Partial<T>, options?: FacadeQueryOptions): Promise<RepositoryFacadeResult<T>>;

  /**
   * Deletes an entity by ID
   * 
   * @param id - Entity ID
   * @param options - Facade query options
   * @returns Repository facade result
   */
  delete(id: string, options?: FacadeQueryOptions): Promise<RepositoryFacadeResult<void>>;

  /**
   * Deletes multiple entities
   * 
   * @param ids - Array of entity IDs
   * @param options - Bulk operation options
   * @returns Repository facade result with number of deleted entities
   */
  deleteMany(ids: string[], options?: BulkOperationOptions): Promise<RepositoryFacadeResult<number>>;

  /**
   * Counts entities matching query options
   * 
   * @param options - Facade query options
   * @returns Repository facade result with count
   */
  count(options?: FacadeQueryOptions): Promise<RepositoryFacadeResult<number>>;

  /**
   * Checks if an entity exists by ID
   * 
   * @param id - Entity ID
   * @param options - Facade query options
   * @returns Repository facade result with boolean
   */
  exists(id: string, options?: FacadeQueryOptions): Promise<RepositoryFacadeResult<boolean>>;

  /**
   * Performs aggregation
   * 
   * @param aggregation - Aggregation query
   * @param options - Facade query options
   * @returns Repository facade result with aggregation result
   */
  aggregate(aggregation: Record<string, unknown>, options?: FacadeQueryOptions): Promise<RepositoryFacadeResult<Record<string, unknown>>>;

  /**
   * Performs bulk save operation
   * 
   * @param entities - Array of entities to save
   * @param options - Bulk operation options
   * @returns Repository facade result with bulk operation result
   */
  bulkSave(entities: T[], options?: BulkOperationOptions): Promise<RepositoryFacadeResult<{ successful: T[]; failed: Array<{ item: T; error: string }> }>>;

  /**
   * Sets repository facade configuration
   * 
   * @param config - Repository facade configuration
   */
  setConfig(config: Partial<RepositoryFacadeConfig>): void;

  /**
   * Gets current repository facade configuration
   * 
   * @returns Current repository facade configuration
   */
  getConfig(): RepositoryFacadeConfig;

  /**
   * Gets repository facade statistics
   * 
   * @returns Repository facade statistics
   */
  getStats(): RepositoryFacadeStats;

  /**
   * Resets repository facade statistics
   */
  resetStats(): void;

  /**
   * Performs health check
   * 
   * @returns Health check result
   */
  healthCheck(): Promise<HealthCheckResult>;

  /**
   * Clears all caches
   * 
   * @returns Repository facade result
   */
  clearCache(): Promise<RepositoryFacadeResult<void>>;

  /**
   * Clears all data
   * 
   * @returns Repository facade result
   */
  clearData(): Promise<RepositoryFacadeResult<void>>;

  /**
   * Gets the total number of entities
   * 
   * @returns Repository facade result with total count
   */
  getTotalCount(): Promise<RepositoryFacadeResult<number>>;

  /**
   * Gets repository layer information
   * 
   * @returns Map of layer name to layer information
   */
  getLayerInfo(): Map<string, Record<string, unknown>>;

  /**
   * Enables a layer
   * 
   * @param layer - Layer name
   * @returns Repository facade result
   */
  enableLayer(layer: string): Promise<RepositoryFacadeResult<void>>;

  /**
   * Disables a layer
   * 
   * @param layer - Layer name
   * @returns Repository facade result
   */
  disableLayer(layer: string): Promise<RepositoryFacadeResult<void>>;

  /**
   * Resets repository facade to default state
   */
  reset(): void;
}
