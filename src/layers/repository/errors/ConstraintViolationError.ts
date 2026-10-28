/**
 * Constraint Violation Error
 *
 * Error thrown when a database constraint is violated.
 * This includes unique constraints, foreign key constraints, check constraints, and not-null constraints.
 */

import { RepositoryError } from './RepositoryError';

export type ConstraintType = 'PRIMARY_KEY' | 'FOREIGN_KEY' | 'UNIQUE' | 'CHECK' | 'NOT_NULL' | 'EXCLUSION' | 'CUSTOM';

export interface ConstraintViolationErrorDetails {
  constraintName: string;
  constraintType: ConstraintType;
  table: string;
  column?: string;
  value?: unknown;
  referencedTable?: string;
  referencedColumn?: string;
  operation?: 'INSERT' | 'UPDATE' | 'DELETE';
  conflictingFields?: string[];
  existingEntityId?: string;
}

export class ConstraintViolationError extends RepositoryError {
  readonly details: ConstraintViolationErrorDetails;

  constructor(
    message: string,
    options: {
      details: ConstraintViolationErrorDetails;
      cause?: Error;
    }
  ) {
    super('CONSTRAINT_VIOLATION', message, {
      statusCode: 409,
      retryable: false,
      details: options.details,
      cause: options.cause,
    });
    this.details = options.details;
  }

  /**
   * Create a primary key violation error
   */
  static primaryKey(
    table: string,
    constraintName: string,
    value: unknown,
    options: { details?: Partial<ConstraintViolationErrorDetails>; cause?: Error } = {}
  ): ConstraintViolationError {
    return new ConstraintViolationError(
      `Primary key violation: duplicate value '${value}' for constraint '${constraintName}' on table '${table}'`,
      {
        details: {
          constraintName,
          constraintType: 'PRIMARY_KEY',
          table,
          value,
          operation: 'INSERT',
          ...options.details,
        },
        cause: options.cause,
      }
    );
  }

  /**
   * Create a unique constraint violation error
   */
  static unique(
    table: string,
    constraintName: string,
    column: string,
    value: unknown,
    options: { details?: Partial<ConstraintViolationErrorDetails>; cause?: Error } = {}
  ): ConstraintViolationError {
    return new ConstraintViolationError(
      `Unique constraint violation: duplicate value '${value}' for column '${column}' (constraint '${constraintName}') on table '${table}'`,
      {
        details: {
          constraintName,
          constraintType: 'UNIQUE',
          table,
          column,
          value,
          operation: 'INSERT',
          ...options.details,
        },
        cause: options.cause,
      }
    );
  }

  /**
   * Create a foreign key violation error
   */
  static foreignKey(
    table: string,
    constraintName: string,
    column: string,
    value: unknown,
    referencedTable: string,
    referencedColumn: string,
    options: { details?: Partial<ConstraintViolationErrorDetails>; cause?: Error } = {}
  ): ConstraintViolationError {
    return new ConstraintViolationError(
      `Foreign key violation: value '${value}' in column '${column}' on table '${table}' references non-existent ${referencedTable}.${referencedColumn} (constraint '${constraintName}')`,
      {
        details: {
          constraintName,
          constraintType: 'FOREIGN_KEY',
          table,
          column,
          value,
          referencedTable,
          referencedColumn,
          operation: 'INSERT',
          ...options.details,
        },
        cause: options.cause,
      }
    );
  }

  /**
   * Create a check constraint violation error
   */
  static check(
    table: string,
    constraintName: string,
    column: string,
    value: unknown,
    options: { details?: Partial<ConstraintViolationErrorDetails>; cause?: Error } = {}
  ): ConstraintViolationError {
    return new ConstraintViolationError(
      `Check constraint violation: value '${value}' in column '${column}' on table '${table}' violates constraint '${constraintName}'`,
      {
        details: {
          constraintName,
          constraintType: 'CHECK',
          table,
          column,
          value,
          operation: 'INSERT',
          ...options.details,
        },
        cause: options.cause,
      }
    );
  }

  /**
   * Create a not-null constraint violation error
   */
  static notNull(
    table: string,
    constraintName: string,
    column: string,
    options: { details?: Partial<ConstraintViolationErrorDetails>; cause?: Error } = {}
  ): ConstraintViolationError {
    return new ConstraintViolationError(
      `Not-null constraint violation: column '${column}' on table '${table}' cannot be null (constraint '${constraintName}')`,
      {
        details: {
          constraintName,
          constraintType: 'NOT_NULL',
          table,
          column,
          value: null,
          operation: 'INSERT',
          ...options.details,
        },
        cause: options.cause,
      }
    );
  }

  /**
   * Create an exclusion constraint violation error
   */
  static exclusion(
    table: string,
    constraintName: string,
    conflictingFields: string[],
    options: { details?: Partial<ConstraintViolationErrorDetails>; cause?: Error } = {}
  ): ConstraintViolationError {
    return new ConstraintViolationError(
      `Exclusion constraint violation: conflicting values for fields [${conflictingFields.join(', ')}] on table '${table}' (constraint '${constraintName}')`,
      {
        details: {
          constraintName,
          constraintType: 'EXCLUSION',
          table,
          conflictingFields,
          operation: 'INSERT',
          ...options.details,
        },
        cause: options.cause,
      }
    );
  }

  /**
   * Create a custom constraint violation error
   */
  static custom(
    table: string,
    constraintName: string,
    constraintType: ConstraintType,
    message: string,
    options: { details?: Partial<ConstraintViolationErrorDetails>; cause?: Error } = {}
  ): ConstraintViolationError {
    return new ConstraintViolationError(message, {
      details: {
        constraintName,
        constraintType,
        table,
        operation: 'INSERT',
        ...options.details,
      },
      cause: options.cause,
    });
  }

  /**
   * Get the conflicting entity ID if available
   */
  getConflictingEntityId(): string | undefined {
    return this.details.existingEntityId;
  }

  /**
   * Check if this is a duplicate key error
   */
  isDuplicateKey(): boolean {
    return this.details.constraintType === 'PRIMARY_KEY' || this.details.constraintType === 'UNIQUE';
  }

  /**
   * Check if this is a referential integrity error
   */
  isReferentialIntegrity(): boolean {
    return this.details.constraintType === 'FOREIGN_KEY';
  }
}
