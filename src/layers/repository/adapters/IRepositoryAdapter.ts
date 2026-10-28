/**
 * Repository Adapter Interface
 *
 * Defines contract for different storage backend adapters.
 * Each adapter implements data access for a specific storage technology.
 */

import { DomainEntity } from '../../domain/types/domain-types';
import { QueryOptions, RepositoryResult } from '../types/repository-types';
import { IQueryBuilder } from '../interfaces/IQueryBuilder';

/**
 * Connection pool statistics
 */
export interface ConnectionPoolStats {
  totalConnections: number;
  activeConnections: number;
  idleConnections: number;
  waitingRequests: number;
  maxConnections: number;
  minConnections: number;
}

/**
 * Adapter health status
 */
export interface AdapterHealthStatus {
  healthy: boolean;
  latencyMs: number;
  lastCheck: Date;
  error?: string;
}

/**
 * Adapter configuration
 */
export interface AdapterConfig {
  enableQueryLogging?: boolean;
  slowQueryThresholdMs?: number;
  maxRetries?: number;
  retryDelayMs?: number;
  connectionTimeoutMs?: number;
  queryTimeoutMs?: number;
}

/**
 * Extended adapter interface with advanced features
 */
export interface IRepositoryAdapter<T extends DomainEntity> {
  /**
   * Get adapter type name
   */
  getType(): string;

  /**
   * Get adapter configuration
   */
  getConfig(): AdapterConfig;

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
   * Get connection pool statistics
   */
  getPoolStats(): ConnectionPoolStats | null;

  /**
   * Perform health check
   */
  healthCheck(): Promise<AdapterHealthStatus>;

  /**
   * Find entity by ID
   */
  findById(id: string): Promise<RepositoryResult<T>>;

  /**
   * Find entities matching query options
   */
  find(options?: QueryOptions): Promise<RepositoryResult<T[]>>;

  /**
   * Find a single entity matching query options
   */
  findOne(options?: QueryOptions): Promise<RepositoryResult<T | null>>;

  /**
   * Save entity (create or update)
   */
  save(entity: T): Promise<RepositoryResult<T>>;

  /**
   * Save multiple entities in a batch
   */
  saveMany(entities: T[]): Promise<RepositoryResult<T[]>>;

  /**
   * Delete entity by ID
   */
  delete(id: string): Promise<RepositoryResult<void>>;

  /**
   * Delete multiple entities by IDs
   */
  deleteMany(ids: string[]): Promise<RepositoryResult<void>>;

  /**
   * Count entities matching query options
   */
  count(options?: QueryOptions): Promise<RepositoryResult<number>>;

  /**
   * Check if entity exists by ID
   */
  exists(id: string): Promise<RepositoryResult<boolean>>;

  /**
   * Execute a raw query
   */
  executeRawQuery<R>(query: string, params?: unknown[]): Promise<RepositoryResult<R[]>>;

  /**
   * Get the query builder for this adapter
   */
  getQueryBuilder(): IQueryBuilder;

  /**
   * Clear all data (for testing)
   */
  clear(): Promise<void>;

  /**
   * Begin a transaction
   */
  beginTransaction(): Promise<RepositoryTransaction>;

  /**
   * Get adapter-specific metrics
   */
  getMetrics(): AdapterMetrics;
}

/**
 * Transaction interface
 */
export interface RepositoryTransaction {
  /**
   * Commit the transaction
   */
  commit(): Promise<void>;

  /**
   * Rollback the transaction
   */
  rollback(): Promise<void>;

  /**
   * Execute a query within the transaction
   */
  execute<R>(query: string, params?: unknown[]): Promise<R[]>;

  /**
   * Save entity within transaction
   */
  save<T extends DomainEntity>(entity: T): Promise<T>;

  /**
   * Delete entity within transaction
   */
  delete(id: string): Promise<void>;
}

/**
 * Adapter metrics
 */
export interface AdapterMetrics {
  queriesExecuted: number;
  queriesSucceeded: number;
  queriesFailed: number;
  averageQueryTimeMs: number;
  slowQueries: number;
  connectionsCreated: number;
  connectionsClosed: number;
  connectionErrors: number;
  lastQueryTime?: Date;
  lastErrorTime?: Date;
}
