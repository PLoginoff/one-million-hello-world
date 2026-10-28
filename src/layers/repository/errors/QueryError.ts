/**
 * Query Error
 *
 * Error thrown when a query execution fails.
 * This includes syntax errors, constraint violations, and execution errors.
 */

import { RepositoryError } from './RepositoryError';

export interface QueryErrorDetails {
  query?: string;
  parameters?: unknown[];
  table?: string;
  operation?: 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE' | 'COUNT' | 'EXISTS';
  constraintName?: string;
  constraintType?: 'PRIMARY_KEY' | 'FOREIGN_KEY' | 'UNIQUE' | 'CHECK' | 'NOT_NULL';
  errorCode?: string;
  sqlState?: string;
  executionTime?: number;
}

export class QueryError extends RepositoryError {
  readonly details: QueryErrorDetails;

  constructor(
    message: string,
    options: {
      details?: QueryErrorDetails;
      cause?: Error;
      retryable?: boolean;
      statusCode?: number;
    } = {}
  ) {
    super('QUERY_ERROR', message, {
      statusCode: options.statusCode ?? 500,
      retryable: options.retryable ?? false,
      details: options.details,
      cause: options.cause,
    });
    this.details = options.details ?? {};
  }

  /**
   * Create a query syntax error
   */
  static syntaxError(
    query: string,
    errorMessage: string,
    options: { details?: QueryErrorDetails; cause?: Error } = {}
  ): QueryError {
    return new QueryError(`Query syntax error: ${errorMessage}`, {
      retryable: false,
      statusCode: 400,
      details: { ...options.details, query, operation: 'SELECT' },
      cause: options.cause,
    });
  }

  /**
   * Create a query execution error
   */
  static executionError(
    operation: QueryErrorDetails['operation'],
    message: string,
    options: { details?: QueryErrorDetails; cause?: Error } = {}
  ): QueryError {
    return new QueryError(`Query execution failed (${operation}): ${message}`, {
      retryable: true,
      details: { ...options.details, operation },
      cause: options.cause,
    });
  }

  /**
   * Create a constraint violation error
   */
  static constraintViolation(
    constraintName: string,
    constraintType: QueryErrorDetails['constraintType'],
    table: string,
    options: { details?: QueryErrorDetails; cause?: Error } = {}
  ): QueryError {
    return new QueryError(
      `Constraint violation: ${constraintType} constraint '${constraintName}' on table '${table}'`,
      {
        retryable: false,
        statusCode: 409,
        details: { ...options.details, constraintName, constraintType, table, operation: 'INSERT' },
        cause: options.cause,
      }
    );
  }

  /**
   * Create a deadlock error
   */
  static deadlock(
    operation: QueryErrorDetails['operation'],
    options: { details?: QueryErrorDetails; cause?: Error } = {}
  ): QueryError {
    return new QueryError(`Deadlock detected during ${operation}`, {
      retryable: true,
      details: { ...options.details, operation },
      cause: options.cause,
    });
  }

  /**
   * Create a query timeout error
   */
  static timeout(
    query: string,
    timeout: number,
    options: { details?: QueryErrorDetails; cause?: Error } = {}
  ): QueryError {
    return new QueryError(`Query timeout after ${timeout}ms`, {
      retryable: true,
      details: { ...options.details, query, executionTime: timeout },
      cause: options.cause,
    });
  }

  /**
   * Create a table not found error
   */
  static tableNotFound(table: string, options: { details?: QueryErrorDetails; cause?: Error } = {}): QueryError {
    return new QueryError(`Table '${table}' does not exist`, {
      retryable: false,
      statusCode: 404,
      details: { ...options.details, table, operation: 'SELECT' },
      cause: options.cause,
    });
  }

  /**
   * Create a column not found error
   */
  static columnNotFound(
    column: string,
    table: string,
    options: { details?: QueryErrorDetails; cause?: Error } = {}
  ): QueryError {
    return new QueryError(`Column '${column}' does not exist in table '${table}'`, {
      retryable: false,
      statusCode: 400,
      details: { ...options.details, table, operation: 'SELECT' },
      cause: options.cause,
    });
  }
}
