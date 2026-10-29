/**
 * Connection Error
 *
 * Error thrown when a connection to the storage backend fails.
 * This includes connection timeouts, refused connections, and pool exhaustion.
 */

import { RepositoryError } from './RepositoryError';

export interface ConnectionErrorDetails {
  host?: string;
  port?: number;
  database?: string;
  poolSize?: number;
  availableConnections?: number;
  waitQueueLength?: number;
  operation?: string;
  timeout?: number;
}

export class ConnectionError extends RepositoryError {
  override readonly details: ConnectionErrorDetails;

  constructor(
    message: string,
    options: {
      details?: ConnectionErrorDetails;
      cause?: Error;
      retryable?: boolean;
    } = {}
  ) {
    super('CONNECTION_ERROR', message, {
      statusCode: 503,
      retryable: options.retryable ?? true,
      details: options.details,
      cause: options.cause,
    });
    this.details = options.details ?? {};
  }

  /**
   * Create a connection timeout error
   */
  static timeout(
    operation: string,
    timeout: number,
    options: { details?: ConnectionErrorDetails; cause?: Error } = {}
  ): ConnectionError {
    return new ConnectionError(`Connection timeout during ${operation} after ${timeout}ms`, {
      retryable: true,
      details: { ...options.details, operation, timeout },
      cause: options.cause,
    });
  }

  /**
   * Create a connection refused error
   */
  static refused(
    host: string,
    port: number,
    options: { details?: ConnectionErrorDetails; cause?: Error } = {}
  ): ConnectionError {
    return new ConnectionError(`Connection refused to ${host}:${port}`, {
      retryable: true,
      details: { ...options.details, host, port, operation: 'connect' },
      cause: options.cause,
    });
  }

  /**
   * Create a pool exhausted error
   */
  static poolExhausted(
    poolSize: number,
    waitQueueLength: number,
    options: { details?: ConnectionErrorDetails; cause?: Error } = {}
  ): ConnectionError {
    return new ConnectionError(
      `Connection pool exhausted: ${poolSize} connections in use, ${waitQueueLength} waiting`,
      {
        retryable: true,
        details: { ...options.details, poolSize, waitQueueLength, operation: 'acquire' },
        cause: options.cause,
      }
    );
  }

  /**
   * Create a connection lost error
   */
  static lost(operation: string, options: { details?: ConnectionErrorDetails; cause?: Error } = {}): ConnectionError {
    return new ConnectionError(`Connection lost during ${operation}`, {
      retryable: true,
      details: { ...options.details, operation },
      cause: options.cause,
    });
  }

  /**
   * Create an authentication failed error
   */
  static authenticationFailed(
    host: string,
    options: { details?: ConnectionErrorDetails; cause?: Error } = {}
  ): ConnectionError {
    const error = new ConnectionError(`Authentication failed for ${host}`, {
      retryable: false,
      details: { ...options.details, host, operation: 'authenticate' },
      cause: options.cause,
    });
    return error;
  }
}
