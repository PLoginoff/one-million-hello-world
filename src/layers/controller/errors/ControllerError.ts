/**
 * Controller Error
 *
 * Base error class for all controller layer errors.
 * Provides structured error information with codes and context.
 *
 * @module ControllerLayer/Errors
 */

import { HttpStatusCode } from '../types/controller-types';

/**
 * Base controller error class.
 * All controller-specific errors should extend this class.
 */
export abstract class ControllerError extends Error {
  /** Unique error code for programmatic handling */
  readonly code: string;

  /** HTTP status code associated with this error */
  readonly statusCode: HttpStatusCode;

  /** Optional controller ID for context */
  readonly controllerId?: string;

  /** Optional operation name for context */
  readonly operation?: string;

  /** Optional additional details */
  readonly details?: Record<string, unknown>;

  /**
   * Creates a new ControllerError instance.
   *
   * @param code - Unique error code
   * @param message - Human-readable error message
   * @param statusCode - HTTP status code
   * @param options - Additional context options
   */
  constructor(
    code: string,
    message: string,
    statusCode: HttpStatusCode,
    options: {
      controllerId?: string;
      operation?: string;
      details?: Record<string, unknown>;
      cause?: Error;
    } = {}
  ) {
    super(message, { cause: options.cause });
    this.name = this.constructor.name;
    this.code = code;
    this.statusCode = statusCode;
    this.controllerId = options.controllerId;
    this.operation = options.operation;
    this.details = options.details;

    if (typeof Error.captureStackTrace === 'function') {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  /**
   * Converts the error to a plain object for serialization.
   *
   * @returns Serializable error representation
   */
  toJSON(): {
    name: string;
    code: string;
    message: string;
    statusCode: number;
    controllerId?: string;
    operation?: string;
    details?: Record<string, unknown>;
    stack?: string;
  } {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      statusCode: this.statusCode,
      controllerId: this.controllerId,
      operation: this.operation,
      details: this.details,
      stack: this.stack,
    };
  }

  /**
   * Creates a user-friendly error message.
   *
   * @returns Formatted error message
   */
  override toString(): string {
    const parts = [`[${this.code}] ${this.message}`];
    if (this.controllerId) parts.push(`Controller: ${this.controllerId}`);
    if (this.operation) parts.push(`Operation: ${this.operation}`);
    return parts.join(' | ');
  }
}

/**
 * Error codes used throughout the controller layer.
 */
export const ControllerErrorCodes = {
  /** Handler not found for operation */
  HANDLER_NOT_FOUND: 'HANDLER_NOT_FOUND',
  /** Handler execution failed */
  HANDLER_EXECUTION_FAILED: 'HANDLER_EXECUTION_FAILED',
  /** Controller configuration is invalid */
  CONFIGURATION_INVALID: 'CONFIGURATION_INVALID',
  /** Controller not registered */
  CONTROLLER_NOT_REGISTERED: 'CONTROLLER_NOT_REGISTERED',
  /** Controller already registered */
  CONTROLLER_ALREADY_REGISTERED: 'CONTROLLER_ALREADY_REGISTERED',
  /** Controller disabled */
  CONTROLLER_DISABLED: 'CONTROLLER_DISABLED',
  /** Request timeout */
  REQUEST_TIMEOUT: 'REQUEST_TIMEOUT',
  /** Validation failed */
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  /** Unauthorized access */
  UNAUTHORIZED: 'UNAUTHORIZED',
  /** Forbidden access */
  FORBIDDEN: 'FORBIDDEN',
  /** Internal server error */
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;

/**
 * Type for controller error codes.
 */
export type ControllerErrorCode = (typeof ControllerErrorCodes)[keyof typeof ControllerErrorCodes];
