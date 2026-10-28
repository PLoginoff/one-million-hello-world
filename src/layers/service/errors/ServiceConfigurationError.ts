/**
 * Service Configuration Error
 *
 * Thrown when service configuration is invalid or missing required values.
 *
 * @module ServiceLayer/Errors
 */

import { ServiceError, ServiceErrorDetails } from './ServiceError';

/**
 * Error thrown when service configuration is invalid.
 */
export class ServiceConfigurationError extends ServiceError {
  /** The configuration key that caused the error */
  readonly configKey: string;

  /** The invalid value that was provided (if applicable) */
  readonly providedValue?: unknown;

  /** The expected value or format (if applicable) */
  readonly expectedValue?: unknown;

  /**
   * Creates a new ServiceConfigurationError instance.
   *
   * @param configKey - The configuration key that is invalid
   * @param message - Error message describing the issue
   * @param options - Optional configuration error details
   */
  constructor(
    configKey: string,
    message: string,
    options: {
      providedValue?: unknown;
      expectedValue?: unknown;
      details?: ServiceErrorDetails;
    } = {}
  ) {
    const details: ServiceErrorDetails = { configKey, ...options.details };
    if (options.providedValue !== undefined) {
      details.providedValue = options.providedValue;
    }
    if (options.expectedValue !== undefined) {
      details.expectedValue = options.expectedValue;
    }

    super('SERVICE_CONFIGURATION_ERROR', message, {
      statusCode: 500,
      details,
      retryable: false,
    });

    this.name = 'ServiceConfigurationError';
    this.configKey = configKey;
    this.providedValue = options.providedValue;
    this.expectedValue = options.expectedValue;
  }

  /**
   * Creates a ServiceConfigurationError for a missing required configuration.
   *
   * @param configKey - The missing configuration key
   * @returns ServiceConfigurationError instance
   */
  static missing(configKey: string): ServiceConfigurationError {
    return new ServiceConfigurationError(configKey, `Required configuration '${configKey}' is missing`, {
      expectedValue: 'required',
    });
  }

  /**
   * Creates a ServiceConfigurationError for an invalid configuration value.
   *
   * @param configKey - The configuration key with invalid value
   * @param providedValue - The value that was provided
   * @param expectedValue - The expected value or format description
   * @returns ServiceConfigurationError instance
   */
  static invalid(configKey: string, providedValue: unknown, expectedValue: unknown): ServiceConfigurationError {
    return new ServiceConfigurationError(
      configKey,
      `Invalid value for configuration '${configKey}': expected ${expectedValue}, got ${JSON.stringify(providedValue)}`,
      { providedValue, expectedValue }
    );
  }

  /**
   * Creates a ServiceConfigurationError for an out-of-range numeric value.
   *
   * @param configKey - The configuration key
   * @param providedValue - The value that was provided
   * @param min - Minimum allowed value
   * @param max - Maximum allowed value
   * @returns ServiceConfigurationError instance
   */
  static outOfRange(configKey: string, providedValue: number, min: number, max: number): ServiceConfigurationError {
    return new ServiceConfigurationError(
      configKey,
      `Configuration '${configKey}' value ${providedValue} is out of range [${min}, ${max}]`,
      { providedValue, expectedValue: `[${min}, ${max}]` }
    );
  }
}
