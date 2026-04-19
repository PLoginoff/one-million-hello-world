/**
 * Middleware Configuration Builder
 * 
 * Fluent builder for creating middleware configurations.
 */

import { MiddlewareConfigOptions, DefaultConfigs } from '../defaults/DefaultConfigs';
import { MiddlewareConfigValidator } from '../validators/MiddlewareConfigValidator';

export class MiddlewareConfigBuilder {
  private config: MiddlewareConfigOptions;

  constructor() {
    this.config = { ...DefaultConfigs.DEFAULT };
  }

  /**
   * Start with default configuration
   */
  static create(): MiddlewareConfigBuilder {
    return new MiddlewareConfigBuilder();
  }

  /**
   * Start with development configuration
   */
  static development(): MiddlewareConfigBuilder {
    const builder = new MiddlewareConfigBuilder();
    builder.config = { ...DefaultConfigs.DEVELOPMENT };
    return builder;
  }

  /**
   * Start with production configuration
   */
  static production(): MiddlewareConfigBuilder {
    const builder = new MiddlewareConfigBuilder();
    builder.config = { ...DefaultConfigs.PRODUCTION };
    return builder;
  }

  /**
   * Start with high-performance configuration
   */
  static highPerformance(): MiddlewareConfigBuilder {
    const builder = new MiddlewareConfigBuilder();
    builder.config = { ...DefaultConfigs.HIGH_PERFORMANCE };
    return builder;
  }

  /**
   * Enable or disable error handling
   */
  withErrorHandling(enabled: boolean): MiddlewareConfigBuilder {
    MiddlewareConfigValidator.validateBooleanOption(enabled, 'enableErrorHandling');
    this.config.enableErrorHandling = enabled;
    return this;
  }

  /**
   * Enable or disable logging
   */
  withLogging(enabled: boolean): MiddlewareConfigBuilder {
    MiddlewareConfigValidator.validateBooleanOption(enabled, 'enableLogging');
    this.config.enableLogging = enabled;
    return this;
  }

  /**
   * Enable or disable metrics
   */
  withMetrics(enabled: boolean): MiddlewareConfigBuilder {
    MiddlewareConfigValidator.validateBooleanOption(enabled, 'enableMetrics');
    this.config.enableMetrics = enabled;
    return this;
  }

  /**
   * Set default priority
   */
  withDefaultPriority(priority: number): MiddlewareConfigBuilder {
    if (typeof priority !== 'number' || isNaN(priority)) {
      throw new Error('defaultPriority must be a number');
    }
    this.config.defaultPriority = priority;
    return this;
  }

  /**
   * Enable or disable parallel execution
   */
  withParallelExecution(enabled: boolean): MiddlewareConfigBuilder {
    MiddlewareConfigValidator.validateBooleanOption(enabled, 'enableParallelExecution');
    this.config.enableParallelExecution = enabled;
    return this;
  }

  /**
   * Set max middleware depth
   */
  withMaxMiddlewareDepth(maxDepth: number): MiddlewareConfigBuilder {
    MiddlewareConfigValidator.validateMaxMiddlewareDepth(maxDepth);
    this.config.maxMiddlewareDepth = maxDepth;
    return this;
  }

  /**
   * Set timeout
   */
  withTimeout(timeout: number): MiddlewareConfigBuilder {
    MiddlewareConfigValidator.validateTimeout(timeout);
    this.config.timeout = timeout;
    return this;
  }

  /**
   * Build the configuration
   */
  build(): MiddlewareConfigOptions {
    MiddlewareConfigValidator.validate(this.config);
    return { ...this.config };
  }

  /**
   * Build without validation (use with caution)
   */
  buildUnsafe(): MiddlewareConfigOptions {
    return { ...this.config };
  }
}
