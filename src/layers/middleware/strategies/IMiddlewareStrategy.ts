/**
 * Middleware Strategy Interface
 *
 * Defines the contract for middleware execution strategies.
 * Strategies encapsulate different middleware pipeline behaviors.
 *
 * @module MiddlewareLayer/Strategies
 */

import { CorrelationContext } from '../types/middleware-types';

/**
 * Context passed to middleware strategies during execution.
 */
export interface MiddlewareStrategyContext {
  /** Correlation context for tracing */
  readonly correlationContext: CorrelationContext;
  /** HTTP method */
  readonly method: string;
  /** Request path */
  readonly path: string;
  /** Request headers */
  readonly headers: Record<string, string>;
  /** Request body (if any) */
  readonly body?: unknown;
  /** Query parameters */
  readonly query: Record<string, string>;
  /** Timestamp when the request was received */
  readonly timestamp: number;
}

/**
 * Result of a middleware strategy execution.
 */
export interface MiddlewareStrategyResult {
  /** Whether the middleware processing was successful */
  readonly success: boolean;
  /** Modified headers (if any) */
  readonly headers?: Record<string, string>;
  /** Modified body (if any) */
  readonly body?: unknown;
  /** Response status code (if middleware terminates the request) */
  readonly statusCode?: number;
  /** Error information if processing failed */
  readonly error?: {
    readonly code: string;
    readonly message: string;
  };
  /** Execution metadata */
  readonly metadata?: {
    readonly strategyName: string;
    readonly executionTimeMs: number;
    readonly stagesExecuted: number;
    readonly stagesSkipped: number;
  };
}

/**
 * Interface for middleware execution strategies.
 *
 * Implementations provide different middleware pipeline behaviors
 * (sequential, parallel, conditional, etc.) and can be composed
 * with decorators for logging, metrics, etc.
 */
export interface IMiddlewareStrategy {
  /** Unique name identifying this strategy */
  readonly name: string;
  /** Priority for strategy selection (higher = preferred) */
  readonly priority: number;

  /**
   * Execute the middleware strategy.
   *
   * @param context - The middleware context containing request details
   * @returns Promise resolving to the middleware result
   */
  execute(context: MiddlewareStrategyContext): Promise<MiddlewareStrategyResult>;

  /**
   * Determine if this strategy can handle the given context.
   *
   * @param context - The middleware context to evaluate
   * @returns True if this strategy can handle the context
   */
  canHandle(context: MiddlewareStrategyContext): boolean;
}
