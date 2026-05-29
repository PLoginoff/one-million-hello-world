/**
 * Saga Configuration Builder
 *
 * Fluent builder for creating saga configurations.
 * Provides a type-safe way to construct complex configurations.
 */

import { SagaConfig as DomainSagaConfig, RetryPolicy, CompensationStrategy, IsolationLevel } from '../../domain/value-objects/SagaConfig';
import { SagaConfigDefaults } from '../defaults/SagaDefaults';

export interface SagaBuilderConfig {
  sagaConfig: DomainSagaConfig;
  enableMetrics: boolean;
  enableLogging: boolean;
  enableTracing: boolean;
  name?: string;
  tags?: string[];
}

export class SagaConfigBuilder {
  private _config: Partial<SagaBuilderConfig> = {};

  constructor(defaults?: SagaConfigDefaults) {
    if (defaults) {
      this._config = {
        sagaConfig: defaults.sagaConfig,
        enableMetrics: defaults.enableMetrics,
        enableLogging: defaults.enableLogging,
        enableTracing: defaults.enableTracing,
      };
    }
  }

  /**
   * Set saga configuration
   */
  withSagaConfig(sagaConfig: DomainSagaConfig): SagaConfigBuilder {
    this._config.sagaConfig = sagaConfig;
    return this;
  }

  /**
   * Set saga name
   */
  withName(name: string): SagaConfigBuilder {
    const currentConfig = this._config.sagaConfig || DomainSagaConfig.createDefault('default');
    this._config.sagaConfig = currentConfig.withUpdates({ name });
    return this;
  }

  /**
   * Set description
   */
  withDescription(description: string): SagaConfigBuilder {
    const currentConfig = this._config.sagaConfig || DomainSagaConfig.createDefault('default');
    this._config.sagaConfig = currentConfig.withUpdates({ description });
    return this;
  }

  /**
   * Set timeout
   */
  withTimeout(timeout: number): SagaConfigBuilder {
    const currentConfig = this._config.sagaConfig || DomainSagaConfig.createDefault('default');
    this._config.sagaConfig = currentConfig.withUpdates({ timeout });
    return this;
  }

  /**
   * Set retry policy
   */
  withRetryPolicy(retryPolicy: RetryPolicy): SagaConfigBuilder {
    const currentConfig = this._config.sagaConfig || DomainSagaConfig.createDefault('default');
    this._config.sagaConfig = currentConfig.withUpdates({ retryPolicy });
    return this;
  }

  /**
   * Set compensation strategy
   */
  withCompensationStrategy(strategy: CompensationStrategy): SagaConfigBuilder {
    const currentConfig = this._config.sagaConfig || DomainSagaConfig.createDefault('default');
    this._config.sagaConfig = currentConfig.withUpdates({ compensationStrategy: strategy });
    return this;
  }

  /**
   * Set isolation level
   */
  withIsolationLevel(level: IsolationLevel): SagaConfigBuilder {
    const currentConfig = this._config.sagaConfig || DomainSagaConfig.createDefault('default');
    this._config.sagaConfig = currentConfig.withUpdates({ isolationLevel: level });
    return this;
  }

  /**
   * Enable or disable metrics
   */
  withMetrics(enabled: boolean): SagaConfigBuilder {
    const currentConfig = this._config.sagaConfig || DomainSagaConfig.createDefault('default');
    this._config.sagaConfig = currentConfig.withUpdates({ enableMetrics: enabled });
    return this;
  }

  /**
   * Enable or disable logging
   */
  withLogging(enabled: boolean): SagaConfigBuilder {
    const currentConfig = this._config.sagaConfig || DomainSagaConfig.createDefault('default');
    this._config.sagaConfig = currentConfig.withUpdates({ enableLogging: enabled });
    return this;
  }

  /**
   * Enable or disable tracing
   */
  withTracing(enabled: boolean): SagaConfigBuilder {
    this._config.enableTracing = enabled;
    return this;
  }

  /**
   * Set configuration name
   */
  withConfigName(name: string): SagaConfigBuilder {
    this._config.name = name;
    return this;
  }

  /**
   * Build the configuration
   */
  build(): SagaBuilderConfig {
    const sagaConfig = this._config.sagaConfig || DomainSagaConfig.createDefault('default');

    return {
      sagaConfig,
      enableMetrics: this._config.enableMetrics ?? true,
      enableLogging: this._config.enableLogging ?? true,
      enableTracing: this._config.enableTracing ?? false,
      name: this._config.name,
      tags: this._config.tags,
    };
  }

  /**
   * Create a new builder with default configuration
   */
  static create(): SagaConfigBuilder {
    return new SagaConfigBuilder();
  }

  /**
   * Create a new builder from existing configuration
   */
  static fromConfig(config: SagaBuilderConfig): SagaConfigBuilder {
    const builder = new SagaConfigBuilder();
    builder._config = { ...config };
    return builder;
  }
}
