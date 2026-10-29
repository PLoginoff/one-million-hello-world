/**
 * Cache Connection Error
 *
 * Thrown when a cache backend connection fails (e.g., Redis, Cluster).
 *
 * @module CacheLayer/Errors
 */

import { CacheError, CacheErrorCode } from './CacheError';

/**
 * Error thrown when cache backend connection fails
 */
export class CacheConnectionError extends CacheError {
  /** The host that failed to connect */
  readonly host?: string;
  /** The port that failed to connect */
  readonly port?: number;
  /** Original error if available */
  readonly originalError?: Error;

  /**
   * Create a new CacheConnectionError
   *
   * @param message - Error message
   * @param context - Additional context information
   * @param retryable - Whether the operation can be retried
   */
  constructor(message: string, context: Record<string, unknown> = {}, retryable: boolean = true) {
    super(CacheErrorCode.CONNECTION_ERROR, message, context, retryable);
    this.name = 'CacheConnectionError';
    this.host = context.host as string | undefined;
    this.port = context.port as number | undefined;
    this.originalError = context.originalError as Error | undefined;
  }

  /**
   * Create a connection error for Redis
   */
  static redis(host: string, port: number, originalError: Error, context: Record<string, unknown> = {}): CacheConnectionError {
    return new CacheConnectionError(
      `Failed to connect to Redis at ${host}:${port}: ${originalError.message}`,
      { ...context, host, port, originalError },
      true
    );
  }

  /**
   * Create a connection error for Redis Cluster
   */
  static cluster(nodes: Array<{ host: string; port: number }>, originalError: Error, context: Record<string, unknown> = {}): CacheConnectionError {
    const nodeStr = nodes.map(n => `${n.host}:${n.port}`).join(', ');
    return new CacheConnectionError(
      `Failed to connect to Redis Cluster (${nodeStr}): ${originalError.message}`,
      { ...context, nodes, originalError },
      true
    );
  }

  /**
   * Create a timeout error
   */
  static timeout(operation: string, timeoutMs: number, context: Record<string, unknown> = {}): CacheConnectionError {
    return new CacheConnectionError(
      `${operation} timed out after ${timeoutMs}ms`,
      { ...context, operation, timeoutMs },
      true
    );
  }

  /**
   * Create a connection lost error
   */
  static connectionLost(host: string, port: number, context: Record<string, unknown> = {}): CacheConnectionError {
    return new CacheConnectionError(
      `Connection lost to ${host}:${port}`,
      { ...context, host, port },
      true
    );
  }
}