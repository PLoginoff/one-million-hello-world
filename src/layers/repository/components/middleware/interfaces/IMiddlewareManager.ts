/**
 * Middleware Manager Interface
 * 
 * Defines the contract for middleware chains and cross-cutting concerns.
 */

import {
  MiddlewareFunction,
  MiddlewareContext,
  MiddlewareResult,
  MiddlewareChain,
  Middleware,
  MiddlewareConfig,
  MiddlewareStats,
  MiddlewarePipeline,
} from '../types/middleware-types';

/**
 * Interface for middleware management
 */
export interface IMiddlewareManager<T = unknown> {
  /**
   * Adds a middleware to the chain
   * 
   * @param middleware - Middleware to add
   */
  addMiddleware(middleware: Middleware<T>): void;

  /**
   * Removes a middleware from the chain
   * 
   * @param name - Middleware name
   */
  removeMiddleware(name: string): void;

  /**
   * Gets a middleware by name
   * 
   * @param name - Middleware name
   * @returns Middleware or undefined
   */
  getMiddleware(name: string): Middleware<T> | undefined;

  /**
   * Gets all middlewares
   * 
   * @returns Array of middlewares
   */
  getMiddlewares(): Middleware<T>[];

  /**
   * Enables a middleware
   * 
   * @param name - Middleware name
   */
  enableMiddleware(name: string): void;

  /**
   * Disables a middleware
   * 
   * @param name - Middleware name
   */
  disableMiddleware(name: string): void;

  /**
   * Creates a middleware chain
   * 
   * @param middlewares - Array of middlewares
   * @returns Middleware chain
   */
  createChain(middlewares: Middleware<T>[]): MiddlewareChain<T>;

  /**
   * Executes a middleware chain
   * 
   * @param context - Middleware context
   * @param chain - Middleware chain
   * @returns Middleware result
   */
  executeChain(context: MiddlewareContext<T>, chain: MiddlewareChain<T>): Promise<MiddlewareResult<T>>;

  /**
   * Executes all middlewares
   * 
   * @param context - Middleware context
   * @returns Middleware result
   */
  execute(context: MiddlewareContext<T>): Promise<MiddlewareResult<T>>;

  /**
   * Creates a middleware pipeline
   * 
   * @param name - Pipeline name
   * @param middlewares - Array of middlewares
   * @param parallel - Whether to execute in parallel
   * @returns Middleware pipeline
   */
  createPipeline(name: string, middlewares: Middleware<T>[], parallel?: boolean): MiddlewarePipeline<T>;

  /**
   * Executes a middleware pipeline
   * 
   * @param pipeline - Middleware pipeline
   * @param context - Middleware context
   * @returns Middleware result
   */
  executePipeline(pipeline: MiddlewarePipeline<T>, context: MiddlewareContext<T>): Promise<MiddlewareResult<T>>;

  /**
   * Sets middleware configuration
   * 
   * @param config - Middleware configuration
   */
  setConfig(config: Partial<MiddlewareConfig>): void;

  /**
   * Gets current middleware configuration
   * 
   * @returns Current middleware configuration
   */
  getConfig(): MiddlewareConfig;

  /**
   * Gets middleware statistics
   * 
   * @returns Middleware statistics
   */
  getStats(): MiddlewareStats;

  /**
   * Resets middleware statistics
   */
  resetStats(): void;

  /**
   * Clears all middlewares
   */
  clearMiddlewares(): void;

  /**
   * Sorts middlewares by priority
   */
  sortByPriority(): void;

  /**
   * Gets middlewares for a specific operation
   * 
   * @param operation - Operation name
   * @returns Array of middlewares for the operation
   */
  getMiddlewaresForOperation(operation: string): Middleware<T>[];

  /**
   * Adds a middleware for a specific operation
   * 
   * @param operation - Operation name
   * @param middleware - Middleware to add
   */
  addMiddlewareForOperation(operation: string, middleware: Middleware<T>): void;

  /**
   * Removes middlewares for a specific operation
   * 
   * @param operation - Operation name
   */
  removeMiddlewaresForOperation(operation: string): void;

  /**
   * Creates a middleware context
   * 
   * @param operation - Operation name
   * @param data - Data to process
   * @param metadata - Optional metadata
   * @returns Middleware context
   */
  createContext(operation: string, data: T, metadata?: Record<string, unknown>): MiddlewareContext<T>;

  /**
   * Resets middleware manager to default state
   */
  reset(): void;
}
