/**
 * Handler Manager Interface
 * 
 * Defines the contract for business logic handlers and operation orchestration.
 */

import { DomainEntity } from '../../../../domain/types/domain-types';
import {
  HandlerOperation,
  HandlerContext,
  HandlerResult,
  HandlerConfig,
  HandlerStats,
  OperationHandler,
  HandlerPipeline,
  BulkOperationResult,
} from '../types/handler-types';

/**
 * Interface for handler management
 */
export interface IHandlerManager<T extends DomainEntity> {
  /**
   * Handles a find operation
   * 
   * @param context - Handler context
   * @param input - Input data
   * @returns Handler result with entities
   */
  handleFind(context: HandlerContext, input: unknown): Promise<HandlerResult<T[]>>;

  /**
   * Handles a find by ID operation
   * 
   * @param context - Handler context
   * @param input - Input data (entity ID)
   * @returns Handler result with entity
   */
  handleFindById(context: HandlerContext, input: unknown): Promise<HandlerResult<T>>;

  /**
   * Handles a find one operation
   * 
   * @param context - Handler context
   * @param input - Input data
   * @returns Handler result with entity
   */
  handleFindOne(context: HandlerContext, input: unknown): Promise<HandlerResult<T | null>>;

  /**
   * Handles a save operation
   * 
   * @param context - Handler context
   * @param input - Input data (entity)
   * @returns Handler result with saved entity
   */
  handleSave(context: HandlerContext, input: unknown): Promise<HandlerResult<T>>;

  /**
   * Handles an update operation
   * 
   * @param context - Handler context
   * @param input - Input data (entity)
   * @returns Handler result with updated entity
   */
  handleUpdate(context: HandlerContext, input: unknown): Promise<HandlerResult<T>>;

  /**
   * Handles a delete operation
   * 
   * @param context - Handler context
   * @param input - Input data (entity ID)
   * @returns Handler result
   */
  handleDelete(context: HandlerContext, input: unknown): Promise<HandlerResult<void>>;

  /**
   * Handles a delete many operation
   * 
   * @param context - Handler context
   * @param input - Input data (entity IDs)
   * @returns Handler result
   */
  handleDeleteMany(context: HandlerContext, input: unknown): Promise<HandlerResult<number>>;

  /**
   * Handles a count operation
   * 
   * @param context - Handler context
   * @param input - Input data
   * @returns Handler result with count
   */
  handleCount(context: HandlerContext, input: unknown): Promise<HandlerResult<number>>;

  /**
   * Handles an exists operation
   * 
   * @param context - Handler context
   * @param input - Input data (entity ID)
   * @returns Handler result with boolean
   */
  handleExists(context: HandlerContext, input: unknown): Promise<HandlerResult<boolean>>;

  /**
   * Handles an aggregate operation
   * 
   * @param context - Handler context
   * @param input - Input data
   * @returns Handler result with aggregation
   */
  handleAggregate(context: HandlerContext, input: unknown): Promise<HandlerResult<Record<string, unknown>>>;

  /**
   * Handles a bulk save operation
   * 
   * @param context - Handler context
   * @param input - Input data (array of entities)
   * @returns Handler result with bulk operation result
   */
  handleBulkSave(context: HandlerContext, input: unknown): Promise<HandlerResult<BulkOperationResult<T>>>;

  /**
   * Handles a bulk delete operation
   * 
   * @param context - Handler context
   * @param input - Input data (array of entity IDs)
   * @returns Handler result with bulk operation result
   */
  handleBulkDelete(context: HandlerContext, input: unknown): Promise<HandlerResult<BulkOperationResult<T>>>;

  /**
   * Registers an operation handler
   * 
   * @param handler - Operation handler to register
   */
  registerHandler(handler: OperationHandler<T>): void;

  /**
   * Unregisters an operation handler
   * 
   * @param operation - Operation type
   */
  unregisterHandler(operation: HandlerOperation): void;

  /**
   * Gets an operation handler
   * 
   * @param operation - Operation type
   * @returns Operation handler or undefined
   */
  getHandler(operation: HandlerOperation): OperationHandler<T> | undefined;

  /**
   * Gets all operation handlers
   * 
   * @returns Array of operation handlers
   */
  getHandlers(): OperationHandler<T>[];

  /**
   * Creates a handler pipeline
   * 
   * @param handlers - Array of handlers
   * @param preHandlers - Array of pre-handlers
   * @param postHandlers - Array of post-handlers
   * @returns Handler pipeline
   */
  createPipeline(
    handlers: OperationHandler<T>[],
    preHandlers?: OperationHandler<T>[],
    postHandlers?: OperationHandler<T>[]
  ): HandlerPipeline<T>;

  /**
   * Executes a handler pipeline
   * 
   * @param pipeline - Handler pipeline
   * @param context - Handler context
   * @param input - Input data
   * @returns Handler result
   */
  executePipeline(pipeline: HandlerPipeline<T>, context: HandlerContext, input: unknown): Promise<HandlerResult<T>>;

  /**
   * Sets handler configuration
   * 
   * @param config - Handler configuration
   */
  setConfig(config: Partial<HandlerConfig>): void;

  /**
   * Gets current handler configuration
   * 
   * @returns Current handler configuration
   */
  getConfig(): HandlerConfig;

  /**
   * Gets handler statistics
   * 
   * @returns Handler statistics
   */
  getStats(): HandlerStats;

  /**
   * Resets handler statistics
   */
  resetStats(): void;

  /**
   * Creates a handler context
   * 
   * @param operation - Operation type
   * @param requestId - Request ID
   * @param metadata - Optional metadata
   * @returns Handler context
   */
  createContext(operation: HandlerOperation, requestId: string, metadata?: Record<string, unknown>): HandlerContext;

  /**
   * Clears all handlers
   */
  clearHandlers(): void;

  /**
   * Resets handler manager to default state
   */
  reset(): void;
}
