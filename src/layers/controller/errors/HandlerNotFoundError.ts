/**
 * Handler Not Found Error
 *
 * Thrown when a requested handler is not registered for an operation.
 *
 * @module ControllerLayer/Errors
 */

import { ControllerError, ControllerErrorCodes } from './ControllerError';
import { HttpStatusCode } from '../types/controller-types';

/**
 * Error thrown when a handler is not found for a given operation.
 */
export class HandlerNotFoundError extends ControllerError {
  /** The operation name that was requested */
  override readonly operation: string;

  /** Available operations (if known) */
  readonly availableOperations?: readonly string[];

  /**
   * Creates a new HandlerNotFoundError instance.
   *
   * @param operation - The operation name that was not found
   * @param options - Additional context options
   */
  constructor(
    operation: string,
    options: {
      controllerId?: string;
      availableOperations?: readonly string[];
      cause?: Error;
    } = {}
  ) {
    const available = options.availableOperations?.length
      ? `. Available operations: ${options.availableOperations.join(', ')}`
      : '';

    super(
      ControllerErrorCodes.HANDLER_NOT_FOUND,
      `Handler not found for operation: ${operation}${available}`,
      HttpStatusCode.NOT_FOUND,
      {
        controllerId: options.controllerId,
        operation,
        details: {
          requestedOperation: operation,
          availableOperations: options.availableOperations,
        },
        cause: options.cause,
      }
    );

    this.operation = operation;
    this.availableOperations = options.availableOperations;
  }

  /**
   * Creates a HandlerNotFoundError from a handler registry.
   *
   * @param operation - The operation that was not found
   * @param registry - Map of registered handlers
   * @param controllerId - Optional controller ID
   * @returns HandlerNotFoundError instance
   */
  static fromRegistry(operation: string, registry: Map<string, unknown>, controllerId?: string): HandlerNotFoundError {
    return new HandlerNotFoundError(operation, {
      controllerId,
      availableOperations: Array.from(registry.keys()),
    });
  }
}
