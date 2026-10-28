/**
 * Handler Execution Error
 *
 * Thrown when a handler throws an error during execution.
 *
 * @module ControllerLayer/Errors
 */

import { ControllerError, ControllerErrorCodes } from './ControllerError';
import { HttpStatusCode } from '../types/controller-types';

/**
 * Error thrown when a handler fails during execution.
 * Wraps the original error with additional context.
 */
export class HandlerExecutionError extends ControllerError {
  /** The operation that was being executed */
  override readonly operation: string;

  /** The original error that caused this error */
  readonly originalError: Error;

  /** Execution time in milliseconds before failure */
  readonly executionTimeMs?: number;

  /**
   * Creates a new HandlerExecutionError instance.
   *
   * @param operation - The operation that failed
   * @param originalError - The error thrown by the handler
   * @param options - Additional context options
   */
  constructor(
    operation: string,
    originalError: Error,
    options: {
      controllerId?: string;
      executionTimeMs?: number;
      cause?: Error;
    } = {}
  ) {
    const message = `Handler execution failed for operation: ${operation}. ${originalError.message}`;

    super(ControllerErrorCodes.HANDLER_EXECUTION_FAILED, message, HttpStatusCode.INTERNAL_SERVER_ERROR, {
      controllerId: options.controllerId,
      operation,
      details: {
        operation,
        originalErrorName: originalError.name,
        originalErrorMessage: originalError.message,
        originalErrorStack: originalError.stack,
        executionTimeMs: options.executionTimeMs,
      },
      cause: options.cause ?? originalError,
    });

    this.operation = operation;
    this.originalError = originalError;
    this.executionTimeMs = options.executionTimeMs;
  }

  /**
   * Creates a HandlerExecutionError from an unknown error.
   *
   * @param operation - The operation that failed
   * @param error - The caught error (unknown type)
   * @param controllerId - Optional controller ID
   * @param executionTimeMs - Optional execution time
   * @returns HandlerExecutionError instance
   */
  static fromUnknown(
    operation: string,
    error: unknown,
    controllerId?: string,
    executionTimeMs?: number
  ): HandlerExecutionError {
    const originalError = error instanceof Error ? error : new Error(String(error));
    return new HandlerExecutionError(operation, originalError, {
      controllerId,
      executionTimeMs,
    });
  }

  /**
   * Gets the original error cause.
   *
   * @returns The original error
   */
  getCause(): Error {
    return this.originalError;
  }
}
