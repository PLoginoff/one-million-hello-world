/**
 * Retry Configuration Builder
 *
 * Fluent builder for creating retry configurations.
 * Provides a type-safe way to construct complex configurations.
 */

import { RetryPolicy as DomainRetryPolicy, BackoffStrategy } from '../../domain/value-objects/RetryPolicy';
import { RetryCondition as DomainRetryCondition } from '../../domain/value-objects/RetryCondition';
import { RetryConfigDefaults } from '../defaults/RetryDefaults';

export interface RetryBuilderConfig {
  retryPolicy: DomainRetryPolicy;
  retryCondition: DomainRetryCondition;
  enableMetrics: boolean;
  enableLogging: boolean;
  name?: string;
  tags?: string[];
}

export class RetryConfigBuilder {
  private _config: Partial<RetryBuilderConfig> = {};

  constructor(defaults?: RetryConfigDefaults) {
    if (defaults) {
      this._config = {
        retryPolicy: defaults.retryPolicy,
        retryCondition: defaults.retryCondition,
        enableMetrics: defaults.enableMetrics,
        enableLogging: defaults.enableLogging,
      };
    }
  }

  /**
   * Set retry policy
   */
  withRetryPolicy(retryPolicy: DomainRetryPolicy): RetryConfigBuilder {
    this._config.retryPolicy = retryPolicy;
    return this;
  }

  /**
   * Set max attempts
   */
  withMaxAttempts(maxAttempts: number): RetryConfigBuilder {
    const currentPolicy = this._config.retryPolicy || DomainRetryPolicy.createDefault();
    this._config.retryPolicy = currentPolicy.withUpdates({ maxAttempts });
    return this;
  }

  /**
   * Set backoff strategy
   */
  withBackoffStrategy(strategy: BackoffStrategy): RetryConfigBuilder {
    const currentPolicy = this._config.retryPolicy || DomainRetryPolicy.createDefault();
    this._config.retryPolicy = currentPolicy.withUpdates({ backoffStrategy: strategy });
    return this;
  }

  /**
   * Set initial delay
   */
  withInitialDelay(delay: number): RetryConfigBuilder {
    const currentPolicy = this._config.retryPolicy || DomainRetryPolicy.createDefault();
    this._config.retryPolicy = currentPolicy.withUpdates({ initialDelay: delay });
    return this;
  }

  /**
   * Set max delay
   */
  withMaxDelay(delay: number): RetryConfigBuilder {
    const currentPolicy = this._config.retryPolicy || DomainRetryPolicy.createDefault();
    this._config.retryPolicy = currentPolicy.withUpdates({ maxDelay: delay });
    return this;
  }

  /**
   * Set retry condition
   */
  withRetryCondition(condition: DomainRetryCondition): RetryConfigBuilder {
    this._config.retryCondition = condition;
    return this;
  }

  /**
   * Enable or disable metrics
   */
  withMetrics(enabled: boolean): RetryConfigBuilder {
    this._config.enableMetrics = enabled;
    return this;
  }

  /**
   * Enable or disable logging
   */
  withLogging(enabled: boolean): RetryConfigBuilder {
    this._config.enableLogging = enabled;
    return this;
  }

  /**
   * Set configuration name
   */
  withConfigName(name: string): RetryConfigBuilder {
    this._config.name = name;
    return this;
  }

  /**
   * Build the configuration
   */
  build(): RetryBuilderConfig {
    const retryPolicy = this._config.retryPolicy || DomainRetryPolicy.createDefault();
    const retryCondition = this._config.retryCondition || DomainRetryCondition.createDefault();

    return {
      retryPolicy,
      retryCondition,
      enableMetrics: this._config.enableMetrics ?? true,
      enableLogging: this._config.enableLogging ?? true,
      name: this._config.name,
      tags: this._config.tags,
    };
  }

  /**
   * Create a new builder with default configuration
   */
  static create(): RetryConfigBuilder {
    return new RetryConfigBuilder();
  }

  /**
   * Create a new builder from existing configuration
   */
  static fromConfig(config: RetryBuilderConfig): RetryConfigBuilder {
    const builder = new RetryConfigBuilder();
    builder._config = { ...config };
    return builder;
  }
}
