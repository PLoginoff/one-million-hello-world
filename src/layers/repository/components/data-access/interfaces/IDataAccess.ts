/**
 * Data Access Interface
 * 
 * Defines the contract for the lowest-level data access operations.
 * This layer only handles raw data storage and retrieval without any business logic.
 */

import { DomainEntity } from '../../../../domain/types/domain-types';
import {
  DataAccessResult,
  DataAccessConfig,
  StorageStats,
  IndexConfig,
  BulkOperationResult,
  DataSnapshot,
  DataAccessOperation,
} from '../types/data-access-types';

/**
 * Interface for data access operations
 */
export interface IDataAccess<T extends DomainEntity> {
  /**
   * Reads an entity by ID
   * 
   * @param id - Entity ID
   * @returns Data access result with entity
   */
  read(id: string): Promise<DataAccessResult<T>>;

  /**
   * Writes an entity to storage
   * 
   * @param entity - Entity to write
   * @returns Data access result with written entity
   */
  write(entity: T): Promise<DataAccessResult<T>>;

  /**
   * Deletes an entity by ID
   * 
   * @param id - Entity ID
   * @returns Data access result
   */
  delete(id: string): Promise<DataAccessResult<void>>;

  /**
   * Checks if an entity exists
   * 
   * @param id - Entity ID
   * @returns Data access result with boolean
   */
  exists(id: string): Promise<DataAccessResult<boolean>>;

  /**
   * Counts all entities
   * 
   * @returns Data access result with count
   */
  count(): Promise<DataAccessResult<number>>;

  /**
   * Reads all entities
   * 
   * @returns Data access result with array of entities
   */
  readAll(): Promise<DataAccessResult<T[]>>;

  /**
   * Clears all data from storage
   * 
   * @returns Data access result
   */
  clear(): Promise<DataAccessResult<void>>;

  /**
   * Performs bulk write operations
   * 
   * @param entities - Array of entities to write
   * @returns Bulk operation result
   */
  bulkWrite(entities: T[]): Promise<BulkOperationResult>;

  /**
   * Performs bulk delete operations
   * 
   * @param ids - Array of entity IDs to delete
   * @returns Bulk operation result
   */
  bulkDelete(ids: string[]): Promise<BulkOperationResult>;

  /**
   * Creates a data snapshot
   * 
   * @returns Data snapshot
   */
  createSnapshot(): DataSnapshot<T>;

  /**
   * Restores from a data snapshot
   * 
   * @param snapshot - Data snapshot to restore
   * @returns Data access result
   */
  restoreSnapshot(snapshot: DataSnapshot<T>): Promise<DataAccessResult<void>>;

  /**
   * Gets storage statistics
   * 
   * @returns Storage statistics
   */
  getStats(): StorageStats;

  /**
   * Sets data access configuration
   * 
   * @param config - Data access configuration
   */
  setConfig(config: DataAccessConfig): void;

  /**
   * Gets current data access configuration
   * 
   * @returns Current data access configuration
   */
  getConfig(): DataAccessConfig;

  /**
   * Creates an index on a field
   * 
   * @param config - Index configuration
   * @returns Data access result
   */
  createIndex(config: IndexConfig): Promise<DataAccessResult<void>>;

  /**
   * Drops an index on a field
   * 
   * @param field - Field name
   * @returns Data access result
   */
  dropIndex(field: string): Promise<DataAccessResult<void>>;

  /**
   * Gets operation count for a specific operation type
   * 
   * @param operation - Operation type
   * @returns Operation count
   */
  getOperationCount(operation: DataAccessOperation): number;

  /**
   * Resets all operation counts
   */
  resetOperationCounts(): void;
}
