/**
 * Facade Configuration Builder
 *
 * Fluent builder for creating facade configurations.
 * Provides a type-safe way to construct complex configurations.
 */

import { FacadeConfig as DomainFacadeConfig, RetryPolicy } from '../../domain/value-objects/FacadeConfig';
import { FacadeConfigDefaults } from '../defaults/FacadeDefaults';

export interface FacadeBuilderConfig {
  facadeConfig: DomainFacadeConfig;
  enableMetrics: boolean;
  enableLogging: boolean;
  enableTracing: boolean;
  name?: string;
  tags?: string[];
}

export class FacadeConfigBuilder {
  private _config: Partial<FacadeBuilderConfig> = {};

  constructor(defaults?: FacadeConfigDefaults) {
    if (defaults) {
      this._config = {
        facadeConfig: defaults.facadeConfig,
        enableMetrics: defaults.enableMetrics,
        enableLogging: defaults.enableLogging,
        enableTracing: defaults.enableTracing,
      };
    }
  }

  /**
   * Set facade configuration
   */
  withFacadeConfig(facadeConfig: DomainFacadeConfig): FacadeConfigBuilder {
    this._config.facadeConfig = facadeConfig;
    return this;
  }

  /**
   * Set facade name
   */
  withName(name: string): FacadeConfigBuilder {
    const currentConfig = this._config.facadeConfig || DomainFacadeConfig.createDefault('default');
    this._config.facadeConfig = currentConfig.withUpdates({ name });
    return this;
  }

  /**
   * Set description
   */
  withDescription(description: string): FacadeConfigBuilder {
    const currentConfig = this._config.facadeConfig || DomainFacadeConfig.createDefault('default');
    this._config.facadeConfig = currentConfig.withUpdates({ description });
    return this;
  }

  /**
   * Set enabled
   */
  withEnabled(enabled: boolean): FacadeConfigBuilder {
    const currentConfig = this._config.facadeConfig || DomainFacadeConfig.createDefault('default');
    this._config.facadeConfig = currentConfig.withUpdates({ enabled });
    return this;
  }

  /**
   * Set timeout
   */
  withTimeout(timeout: number): FacadeConfigBuilder {
    const currentConfig = this._config.facadeConfig || DomainFacadeConfig.createDefault('default');
    this._config.facadeConfig = currentConfig.withUpdates({ timeout });
    return this;
  }

  /**
   * Set retry policy
   */
  withRetryPolicy(retryPolicy: RetryPolicy): FacadeConfigBuilder {
    const currentConfig = this._config.facadeConfig || DomainFacadeConfig.createDefault('default');
    this._config.facadeConfig = currentConfig.withUpdates({ retryPolicy });
    return this;
  }

  /**
   * Set fallback enabled
   */
  withFallbackEnabled(fallbackEnabled: boolean): FacadeConfigBuilder {
    const currentConfig = this._config.facadeConfig || DomainFacadeConfig.createDefault('default');
    this._config.facadeConfig = currentConfig.withUpdates({ fallbackEnabled });
    return this;
  }

  /**
   * Add tag
   */
  withTag(tag: string): FacadeConfigBuilder {
    const currentConfig = this._config.facadeConfig || DomainFacadeConfig.createDefault('default');
    const currentTags = currentConfig.getTags();
    this._config.facadeConfig = currentConfig.withUpdates({ tags: [...currentTags, tag] });
    return this;
  }

  /**
   * Set tags
   */
  withTags(tags: string[]): FacadeConfigBuilder {
    const currentConfig = this._config.facadeConfig || DomainFacadeConfig.createDefault('default');
    this._config.facadeConfig = currentConfig.withUpdates({ tags });
    return this;
  }

  /**
   * Enable or disable metrics
   */
  withMetrics(enabled: boolean): FacadeConfigBuilder {
    this._config.enableMetrics = enabled;
    return this;
  }

  /**
   * Enable or disable logging
   */
  withLogging(enabled: boolean): FacadeConfigBuilder {
    this._config.enableLogging = enabled;
    return this;
  }

  /**
   * Enable or disable tracing
   */
  withTracing(enabled: boolean): FacadeConfigBuilder {
    this._config.enableTracing = enabled;
    return this;
  }

  /**
   * Set configuration name
   */
  withConfigName(name: string): FacadeConfigBuilder {
    this._config.name = name;
    return this;
  }

  /**
   * Build the configuration
   */
  build(): FacadeBuilderConfig {
    const facadeConfig = this._config.facadeConfig || DomainFacadeConfig.createDefault('default');

    return {
      facadeConfig,
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
  static create(): FacadeConfigBuilder {
    return new FacadeConfigBuilder();
  }

  /**
   * Create a new builder from existing configuration
   */
  static fromConfig(config: FacadeBuilderConfig): FacadeConfigBuilder {
    const builder = new FacadeConfigBuilder();
    builder._config = { ...config };
    return builder;
  }
}
