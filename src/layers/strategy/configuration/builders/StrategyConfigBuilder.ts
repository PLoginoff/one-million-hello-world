/**
 * Strategy Configuration Builder
 * 
 * Fluent builder for creating strategy configurations.
 * Provides a type-safe way to construct complex configurations.
 */

import { StrategyConfig as DomainStrategyConfig, RetryPolicy } from '../../domain/value-objects/StrategyConfig';
import { StrategyConfigDefaults } from '../defaults/StrategyDefaults';

export interface StrategyBuilderConfig {
  strategyConfig: DomainStrategyConfig;
  enableMetrics: boolean;
  enableLogging: boolean;
  enableFeatureFlags: boolean;
  name?: string;
  tags?: string[];
}

export class StrategyConfigBuilder {
  private _config: Partial<StrategyBuilderConfig> = {};

  constructor(defaults?: StrategyConfigDefaults) {
    if (defaults) {
      this._config = {
        strategyConfig: defaults.strategyConfig,
        enableMetrics: defaults.enableMetrics,
        enableLogging: defaults.enableLogging,
        enableFeatureFlags: defaults.enableFeatureFlags,
      };
    }
  }

  /**
   * Set strategy configuration
   */
  withStrategyConfig(strategyConfig: DomainStrategyConfig): StrategyConfigBuilder {
    this._config.strategyConfig = strategyConfig;
    return this;
  }

  /**
   * Set strategy name
   */
  withName(name: string): StrategyConfigBuilder {
    const currentConfig = this._config.strategyConfig || DomainStrategyConfig.createDefault('default');
    this._config.strategyConfig = currentConfig.withUpdates({ name });
    return this;
  }

  /**
   * Set description
   */
  withDescription(description: string): StrategyConfigBuilder {
    const currentConfig = this._config.strategyConfig || DomainStrategyConfig.createDefault('default');
    this._config.strategyConfig = currentConfig.withUpdates({ description });
    return this;
  }

  /**
   * Set enabled
   */
  withEnabled(enabled: boolean): StrategyConfigBuilder {
    const currentConfig = this._config.strategyConfig || DomainStrategyConfig.createDefault('default');
    this._config.strategyConfig = currentConfig.withUpdates({ enabled });
    return this;
  }

  /**
   * Set priority
   */
  withPriority(priority: number): StrategyConfigBuilder {
    const currentConfig = this._config.strategyConfig || DomainStrategyConfig.createDefault('default');
    this._config.strategyConfig = currentConfig.withUpdates({ priority });
    return this;
  }

  /**
   * Set timeout
   */
  withTimeout(timeout: number): StrategyConfigBuilder {
    const currentConfig = this._config.strategyConfig || DomainStrategyConfig.createDefault('default');
    this._config.strategyConfig = currentConfig.withUpdates({ timeout });
    return this;
  }

  /**
   * Set retry policy
   */
  withRetryPolicy(retryPolicy: RetryPolicy): StrategyConfigBuilder {
    const currentConfig = this._config.strategyConfig || DomainStrategyConfig.createDefault('default');
    this._config.strategyConfig = currentConfig.withUpdates({ retryPolicy });
    return this;
  }

  /**
   * Set fallback strategy
   */
  withFallbackStrategy(fallbackStrategy: string): StrategyConfigBuilder {
    const currentConfig = this._config.strategyConfig || DomainStrategyConfig.createDefault('default');
    this._config.strategyConfig = currentConfig.withUpdates({ fallbackStrategy });
    return this;
  }

  /**
   * Add tag
   */
  withTag(tag: string): StrategyConfigBuilder {
    const currentConfig = this._config.strategyConfig || DomainStrategyConfig.createDefault('default');
    const currentTags = currentConfig.getTags();
    this._config.strategyConfig = currentConfig.withUpdates({ tags: [...currentTags, tag] });
    return this;
  }

  /**
   * Set tags
   */
  withTags(tags: string[]): StrategyConfigBuilder {
    const currentConfig = this._config.strategyConfig || DomainStrategyConfig.createDefault('default');
    this._config.strategyConfig = currentConfig.withUpdates({ tags });
    return this;
  }

  /**
   * Enable or disable metrics
   */
  withMetrics(enabled: boolean): StrategyConfigBuilder {
    this._config.enableMetrics = enabled;
    return this;
  }

  /**
   * Enable or disable logging
   */
  withLogging(enabled: boolean): StrategyConfigBuilder {
    this._config.enableLogging = enabled;
    return this;
  }

  /**
   * Enable or disable feature flags
   */
  withFeatureFlags(enabled: boolean): StrategyConfigBuilder {
    this._config.enableFeatureFlags = enabled;
    return this;
  }

  /**
   * Set configuration name
   */
  withConfigName(name: string): StrategyConfigBuilder {
    this._config.name = name;
    return this;
  }

  /**
   * Build the configuration
   */
  build(): StrategyBuilderConfig {
    const strategyConfig = this._config.strategyConfig || DomainStrategyConfig.createDefault('default');

    return {
      strategyConfig,
      enableMetrics: this._config.enableMetrics ?? true,
      enableLogging: this._config.enableLogging ?? true,
      enableFeatureFlags: this._config.enableFeatureFlags ?? false,
      name: this._config.name,
      tags: this._config.tags,
    };
  }

  /**
   * Create a new builder with default configuration
   */
  static create(): StrategyConfigBuilder {
    return new StrategyConfigBuilder();
  }

  /**
   * Create a new builder from existing configuration
   */
  static fromConfig(config: StrategyBuilderConfig): StrategyConfigBuilder {
    const builder = new StrategyConfigBuilder();
    builder._config = { ...config };
    return builder;
  }
}
