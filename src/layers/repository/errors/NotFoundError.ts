/**
 * Not Found Error
 *
 * Error thrown when an entity or resource is not found.
 * This is a non-retryable error with 404 status code.
 */

import { RepositoryError } from './RepositoryError';

export interface NotFoundErrorDetails {
  entityType?: string;
  entityId?: string;
  field?: string;
  value?: unknown;
  table?: string;
  query?: string;
  operation?: 'findById' | 'find' | 'findOne' | 'delete' | 'update';
}

export class NotFoundError extends RepositoryError {
  override readonly details: NotFoundErrorDetails;

  constructor(
    message: string,
    options: {
      details?: NotFoundErrorDetails;
      cause?: Error;
    } = {}
  ) {
    super('ENTITY_NOT_FOUND', message, {
      statusCode: 404,
      retryable: false,
      details: options.details,
      cause: options.cause,
    });
    this.details = options.details ?? {};
  }

  /**
   * Create a not found error by ID
   */
  static byId(
    entityType: string,
    entityId: string,
    options: { details?: NotFoundErrorDetails; cause?: Error } = {}
  ): NotFoundError {
    return new NotFoundError(`${entityType} with ID '${entityId}' not found`, {
      details: { ...options.details, entityType, entityId, operation: 'findById' },
      cause: options.cause,
    });
  }

  /**
   * Create a not found error by field
   */
  static byField(
    entityType: string,
    field: string,
    value: unknown,
    options: { details?: NotFoundErrorDetails; cause?: Error } = {}
  ): NotFoundError {
    return new NotFoundError(`${entityType} with ${field}='${value}' not found`, {
      details: { ...options.details, entityType, field, value, operation: 'find' },
      cause: options.cause,
    });
  }

  /**
   * Create a not found error for delete operation
   */
  static forDelete(
    entityType: string,
    entityId: string,
    options: { details?: NotFoundErrorDetails; cause?: Error } = {}
  ): NotFoundError {
    return new NotFoundError(`Cannot delete: ${entityType} with ID '${entityId}' not found`, {
      details: { ...options.details, entityType, entityId, operation: 'delete' },
      cause: options.cause,
    });
  }

  /**
   * Create a not found error for update operation
   */
  static forUpdate(
    entityType: string,
    entityId: string,
    options: { details?: NotFoundErrorDetails; cause?: Error } = {}
  ): NotFoundError {
    return new NotFoundError(`Cannot update: ${entityType} with ID '${entityId}' not found`, {
      details: { ...options.details, entityType, entityId, operation: 'update' },
      cause: options.cause,
    });
  }

  /**
   * Create a generic not found error
   */
  static entity(
    entityType: string,
    identifier: string,
    options: { details?: NotFoundErrorDetails; cause?: Error } = {}
  ): NotFoundError {
    return new NotFoundError(`${entityType} not found: ${identifier}`, {
      details: { ...options.details, entityType, entityId: identifier, operation: 'findById' },
      cause: options.cause,
    });
  }

  /**
   * Create a not found error for query result
   */
  static queryResult(
    entityType: string,
    query: string,
    options: { details?: NotFoundErrorDetails; cause?: Error } = {}
  ): NotFoundError {
    return new NotFoundError(`No ${entityType} found matching query`, {
      details: { ...options.details, entityType, query, operation: 'find' },
      cause: options.cause,
    });
  }
}
