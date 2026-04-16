/**
 * Data Access Layer Types
 * 
 * Type definitions for the lowest-level data access operations.
 * This layer only handles raw data storage and retrieval without any business logic.
 */

import { DomainEntity } from '../../../../domain/types/domain-types';

/**
 * Data access operation type
 */
export enum DataAccessOperation {
  READ = 'READ',
  WRITE = 'WRITE',
  DELETE = 'DELETE',
  EXISTS = 'EXISTS',
  COUNT = 'COUNT',
  CLEAR = 'CLEAR',
}

/**
 * Data access result
 */
export interface DataAccessResult<T> {
  success: boolean;
  data?: T;
  error?: DataAccessError;
}

/**
 * Data access error
 */
export interface DataAccessError {
  code: string;
  message: string;
  operation: DataAccessOperation;
  details?: Record<string, unknown>;
}

/**
 * Data access configuration
 */
export interface DataAccessConfig {
  enablePersistence: boolean;
  enableIndexing: boolean;
  maxStorageSize?: number;
  compressionEnabled?: boolean;
}

/**
 * Storage statistics
 */
export interface StorageStats {
  totalEntries: number;
  totalSize: number;
  lastModified: Date;
  operationCounts: Map<DataAccessOperation, number>;
}

/**
 * Index configuration
 */
export interface IndexConfig {
  field: string;
  unique: boolean;
  caseSensitive: boolean;
}

/**
 * Data entry metadata
 */
export interface DataEntryMetadata {
  createdAt: Date;
  updatedAt: Date;
  version: number;
  checksum: string;
}

/**
 * Bulk operation result
 */
export interface BulkOperationResult {
  successful: number;
  failed: number;
  errors: DataAccessError[];
}

/**
 * Data snapshot
 */
export interface DataSnapshot<T extends DomainEntity> {
  timestamp: Date;
  data: Map<string, T>;
  metadata: Map<string, DataEntryMetadata>;
}
