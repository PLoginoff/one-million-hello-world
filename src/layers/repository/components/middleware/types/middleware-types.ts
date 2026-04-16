/**
 * Middleware Layer Types
 * 
 * Type definitions for middleware chains and cross-cutting concerns.
 */

/**
 * Middleware function
 */
export type MiddlewareFunction<T = unknown> = (
  context: MiddlewareContext<T>,
  next: MiddlewareNextFunction<T>
) => Promise<MiddlewareResult<T>>;

/**
 * Middleware next function
 */
export type MiddlewareNextFunction<T = unknown> = () => Promise<MiddlewareResult<T>>;

/**
 * Middleware context
 */
export interface MiddlewareContext<T = unknown> {
  operation: string;
  timestamp: Date;
  data: T;
  metadata: Record<string, unknown>;
  state: Map<string, unknown>;
}

/**
 * Middleware result
 */
export interface MiddlewareResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: MiddlewareError;
  metadata: Record<string, unknown>;
}

/**
 * Middleware error
 */
export interface MiddlewareError {
  code: string;
  message: string;
  middleware: string;
  details?: Record<string, unknown>;
}

/**
 * Middleware chain
 */
export interface MiddlewareChain<T = unknown> {
  middlewares: Middleware<T>[];
  execute(context: MiddlewareContext<T>): Promise<MiddlewareResult<T>>;
}

/**
 * Middleware definition
 */
export interface Middleware<T = unknown> {
  name: string;
  priority: number;
  enabled: boolean;
  execute: MiddlewareFunction<T>;
}

/**
 * Middleware configuration
 */
export interface MiddlewareConfig {
  enableGlobalMiddleware: boolean;
  enablePerOperationMiddleware: boolean;
  enableErrorHandling: boolean;
  enableLogging: boolean;
}

/**
 * Middleware statistics
 */
export interface MiddlewareStats {
  totalExecutions: number;
  successfulExecutions: number;
  failedExecutions: number;
  averageExecutionTime: number;
  middlewareExecutionCounts: Map<string, number>;
}

/**
 * Middleware pipeline
 */
export interface MiddlewarePipeline<T = unknown> {
  name: string;
  middlewares: Middleware<T>[];
  parallel: boolean;
  execute(context: MiddlewareContext<T>): Promise<MiddlewareResult<T>>;
}
