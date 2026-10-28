/**
 * Controller Configuration Error
 *
 * Thrown when controller configuration is invalid or missing required values.
 *
 * @module ControllerLayer/Errors
 */

import { ControllerError, ControllerErrorCodes } from './ControllerError';
import { HttpStatusCode } from '../types/controller-types';

/**
 * Represents a single configuration validation error.
 */
export interface ConfigurationValidationError {
  /** The configuration field that failed validation */
  field: string;

  /** The validation rule that failed */
  rule: string;

  /** The invalid value that was provided */
  value: unknown;

  /** Human-readable error message */
  message: string;
}

/**
 * Error thrown when controller configuration is invalid.
 * Contains detailed validation errors for all failed fields.
 */
export class ControllerConfigurationError extends ControllerError {
  /** Array of individual validation errors */
  readonly validationErrors: readonly ConfigurationValidationError[];

  /** The configuration object that failed validation (sanitized) */
  readonly configSnapshot?: Record<string, unknown>;

  /**
   * Creates a new ControllerConfigurationError instance.
   *
   * @param validationErrors - Array of validation errors
   * @param options - Additional context options
   */
  constructor(
    validationErrors: readonly ConfigurationValidationError[],
    options: {
      controllerId?: string;
      configSnapshot?: Record<string, unknown>;
      cause?: Error;
    } = {}
  ) {
    const errorCount = validationErrors.length;
    const firstError = validationErrors[0];
    const message =
      `Configuration validation failed with ${errorCount} error${errorCount > 1 ? 's' : ''}` +
      (firstError ? `: ${firstError.field} - ${firstError.message}` : '');

    super(ControllerErrorCodes.CONFIGURATION_INVALID, message, HttpStatusCode.BAD_REQUEST, {
      controllerId: options.controllerId,
      details: {
        validationErrors: validationErrors.map((e) => ({
          field: e.field,
          rule: e.rule,
          value: e.value,
          message: e.message,
        })),
        configSnapshot: options.configSnapshot
          ? ControllerConfigurationError._sanitizeConfig(options.configSnapshot)
          : undefined,
      },
      cause: options.cause,
    });

    this.validationErrors = validationErrors;
    this.configSnapshot = options.configSnapshot
      ? ControllerConfigurationError._sanitizeConfig(options.configSnapshot)
      : undefined;
  }

  /**
   * Creates a ControllerConfigurationError from a validation result.
   *
   * @param result - Validation result with errors
   * @param config - The configuration that was validated
   * @param controllerId - Optional controller ID
   * @returns ControllerConfigurationError instance
   */
  static fromValidationResult(
    result: { valid: boolean; errors: string[]; warnings: string[] },
    config: Record<string, unknown>,
    controllerId?: string
  ): ControllerConfigurationError {
    const validationErrors: ConfigurationValidationError[] = result.errors.map((error, index) => ({
      field: `field_${index}`,
      rule: 'validation',
      value: undefined,
      message: error,
    }));

    return new ControllerConfigurationError(validationErrors, {
      controllerId,
      configSnapshot: config,
    });
  }

  /**
   * Creates a ControllerConfigurationError for a single field.
   *
   * @param field - The field name
   * @param rule - The validation rule
   * @param value - The invalid value
   * @param message - Error message
   * @param controllerId - Optional controller ID
   * @returns ControllerConfigurationError instance
   */
  static forField(
    field: string,
    rule: string,
    value: unknown,
    message: string,
    controllerId?: string
  ): ControllerConfigurationError {
    return new ControllerConfigurationError(
      [
        {
          field,
          rule,
          value,
          message,
        },
      ],
      { controllerId }
    );
  }

  /**
   * Gets the first validation error.
   *
   * @returns First validation error or undefined
   */
  getFirstError(): ConfigurationValidationError | undefined {
    return this.validationErrors[0];
  }

  /**
   * Gets all validation errors for a specific field.
   *
   * @param field - Field name to filter by
   * @returns Array of validation errors for the field
   */
  getErrorsForField(field: string): readonly ConfigurationValidationError[] {
    return this.validationErrors.filter((e) => e.field === field);
  }

  /**
   * Sanitizes configuration for safe logging (removes sensitive fields).
   *
   * @param config - Configuration object
   * @returns Sanitized configuration
   */
  private static _sanitizeConfig(config: Record<string, unknown>): Record<string, unknown> {
    const sensitiveKeys = ['password', 'secret', 'token', 'key', 'apiKey', 'auth'];
    const sanitized: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(config)) {
      const lowerKey = key.toLowerCase();
      if (sensitiveKeys.some((s) => lowerKey.includes(s))) {
        sanitized[key] = '[REDACTED]';
      } else if (typeof value === 'object' && value !== null) {
        sanitized[key] = ControllerConfigurationError._sanitizeConfig(value as Record<string, unknown>);
      } else {
        sanitized[key] = value;
      }
    }

    return sanitized;
  }
}
