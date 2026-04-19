/**
 * Validation Configuration Builder
 * 
 * Fluent builder for creating validation configurations.
 */

import { ValidationConfigOptions, DefaultConfigs } from '../defaults/DefaultConfigs';
import { ValidationConfigValidator } from '../validators/ValidationConfigValidator';

export class ValidationConfigBuilder {
  private config: ValidationConfigOptions;

  constructor() {
    this.config = { ...DefaultConfigs.DEFAULT };
  }

  /**
   * Start with default configuration
   */
  static create(): ValidationConfigBuilder {
    return new ValidationConfigBuilder();
  }

  /**
   * Start with strict configuration
   */
  static strict(): ValidationConfigBuilder {
    const builder = new ValidationConfigBuilder();
    builder.config = { ...DefaultConfigs.STRICT };
    return builder;
  }

  /**
   * Start with lenient configuration
   */
  static lenient(): ValidationConfigBuilder {
    const builder = new ValidationConfigBuilder();
    builder.config = { ...DefaultConfigs.LENIENT };
    return builder;
  }

  /**
   * Start with API configuration
   */
  static api(): ValidationConfigBuilder {
    const builder = new ValidationConfigBuilder();
    builder.config = { ...DefaultConfigs.API };
    return builder;
  }

  /**
   * Enable or disable strict mode
   */
  withStrictMode(enabled: boolean): ValidationConfigBuilder {
    ValidationConfigValidator.validateBooleanOption(enabled, 'enableStrictMode');
    this.config.enableStrictMode = enabled;
    return this;
  }

  /**
   * Enable or disable stop on first error
   */
  withStopOnFirstError(enabled: boolean): ValidationConfigBuilder {
    ValidationConfigValidator.validateBooleanOption(enabled, 'stopOnFirstError');
    this.config.stopOnFirstError = enabled;
    return this;
  }

  /**
   * Enable or disable return all errors
   */
  withReturnAllErrors(enabled: boolean): ValidationConfigBuilder {
    ValidationConfigValidator.validateBooleanOption(enabled, 'returnAllErrors');
    this.config.returnAllErrors = enabled;
    return this;
  }

  /**
   * Enable or disable auto trim
   */
  withAutoTrim(enabled: boolean): ValidationConfigBuilder {
    ValidationConfigValidator.validateBooleanOption(enabled, 'enableAutoTrim');
    this.config.enableAutoTrim = enabled;
    return this;
  }

  /**
   * Enable or disable type coercion
   */
  withTypeCoercion(enabled: boolean): ValidationConfigBuilder {
    ValidationConfigValidator.validateBooleanOption(enabled, 'enableTypeCoercion');
    this.config.enableTypeCoercion = enabled;
    return this;
  }

  /**
   * Set max depth
   */
  withMaxDepth(maxDepth: number): ValidationConfigBuilder {
    ValidationConfigValidator.validateMaxDepth(maxDepth);
    this.config.maxDepth = maxDepth;
    return this;
  }

  /**
   * Set max errors
   */
  withMaxErrors(maxErrors: number): ValidationConfigBuilder {
    ValidationConfigValidator.validateMaxErrors(maxErrors);
    this.config.maxErrors = maxErrors;
    return this;
  }

  /**
   * Build the configuration
   */
  build(): ValidationConfigOptions {
    ValidationConfigValidator.validate(this.config);
    return { ...this.config };
  }

  /**
   * Build without validation (use with caution)
   */
  buildUnsafe(): ValidationConfigOptions {
    return { ...this.config };
  }
}
