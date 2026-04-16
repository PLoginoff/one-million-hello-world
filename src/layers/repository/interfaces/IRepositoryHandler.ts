/**
 * Repository Handler Interface
 * 
 * Defines the contract for repository operation handlers
 * that encapsulate business logic for data operations.
 */

import { DomainEntity } from '../../domain/types/domain-types';
import {
  QueryOptions,
} from '../types/repository-types';

/**
 * Handler context for repository operations
 */
export interface HandlerContext {
  operation: string;
  timestamp: Date;
  metadata?: Record<string, unknown>;
}

/**
 * Handler result
 */
export interface HandlerResult<T> {
  success: boolean;
  data?: T;
  error?: HandlerError;
  metrics?: HandlerMetrics;
}

/**
 * Handler error
 */
export interface HandlerError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
  retryable?: boolean;
}

/**
 * Handler metrics
 */
export interface HandlerMetrics {
  executionTime: number;
  cacheHit?: boolean;
  transactionUsed?: boolean;
}

/**
 * Interface for repository operation handlers
 */
export interface IRepositoryHandler<T extends DomainEntity> {
  /**
   * Handles a find operation
   * 
   * @param options - Query options
   * @param context - Handler context
   * @returns Handler result with entities
   */
  handleFind(options?: QueryOptions, context?: HandlerContext): Promise<HandlerResult<T[]>>;

  /**
   * Handles a find by ID operation
   * 
   * @param id - Entity ID
   * @param context - Handler context
   * @returns Handler result with entity
   */
  handleFindById(id: string, context?: HandlerContext): Promise<HandlerResult<T>>;

  /**
   * Handles a save operation
   * 
   * @param entity - Entity to save
   * @param context - Handler context
   * @returns Handler result with saved entity
   */
  handleSave(entity: T, context?: HandlerContext): Promise<HandlerResult<T>>;

  /**
   * Handles a delete operation
   * 
   * @param id - Entity ID
   * @param context - Handler context
   * @returns Handler result
   */
  handleDelete(id: string, context?: HandlerContext): Promise<HandlerResult<void>>;

  /**
   * Handles a count operation
   * 
   * @param options - Query options
   * @param context - Handler context
   * @returns Handler result with count
   */
  handleCount(options?: QueryOptions, context?: HandlerContext): Promise<HandlerResult<number>>;

  /**
   * Handles an exists operation
   * 
   * @param id - Entity ID
   * @param context - Handler context
   * @returns Handler result with boolean
   */
  handleExists(id: string, context?: HandlerContext): Promise<HandlerResult<boolean>>;

  /**
   * Creates a handler context
   * 
   * @param operation - Operation name
   * @param metadata - Optional metadata
   * @returns Handler context
   */
  createContext(operation: string, metadata?: Record<string, unknown>): HandlerContext;

  /**
   * Sets handler configuration
   * 
   * @param config - Handler configuration
   */
  setConfig(config: HandlerConfig): void;

  /**
   * Gets handler configuration
   * 
   * @returns Handler configuration
   */
  getConfig(): HandlerConfig;
}

/**
 * Handler configuration
 */
export interface HandlerConfig {
  enableMetrics: boolean;
  enableValidation: boolean;
  enableCaching: boolean;
  enableTransactions: boolean;
  maxRetries: number;
}
