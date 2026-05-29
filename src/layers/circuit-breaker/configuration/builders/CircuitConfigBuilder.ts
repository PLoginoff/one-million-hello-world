/**
 * Circuit Breaker Configuration Builder
 * 
 * Fluent builder for creating circuit breaker configurations.
 * Provides a type-safe way to construct complex configurations.
 */

import { CircuitThreshold } from '../../domain/value-objects/CircuitThreshold';
import { CircuitConfigDefaults } from '../defaults/CircuitDefaults';

export interface CircuitConfig {
  threshold: CircuitThreshold;
  enableMetrics: boolean;
  enableLogging: boolean;
  enableSlidingWindow: boolean;
  slidingWindowSize: number;
  name?: string;
  tags?: string[];
}

export class CircuitConfigBuilder {
  private _config: Partial<CircuitConfig> = {};

  constructor(defaults?: CircuitConfigDefaults) {
    if (defaults) {
      this._config = {
        threshold: defaults.threshold,
        enableMetrics: defaults.enableMetrics,
        enableLogging: defaults.enableLogging,
        enableSlidingWindow: defaults.enableSlidingWindow,
        slidingWindowSize: defaults.slidingWindowSize,
      };
    }
  }

  /**
   * Set circuit threshold
   */
  withThreshold(threshold: CircuitThreshold): CircuitConfigBuilder {
    this._config.threshold = threshold;
    return this;
  }

  /**
   * Set failure threshold
   */
  withFailureThreshold(value: number): CircuitConfigBuilder {
    const currentThreshold = this._config.threshold || CircuitThreshold.createDefault();
    this._config.threshold = currentThreshold.withUpdates({ failureThreshold: value });
    return this;
  }

  /**
   * Set success threshold
   */
  withSuccessThreshold(value: number): CircuitConfigBuilder {
    const currentThreshold = this._config.threshold || CircuitThreshold.createDefault();
    this._config.threshold = currentThreshold.withUpdates({ successThreshold: value });
    return this;
  }

  /**
   * Set timeout
   */
  withTimeout(value: number): CircuitConfigBuilder {
    const currentThreshold = this._config.threshold || CircuitThreshold.createDefault();
    this._config.threshold = currentThreshold.withUpdates({ timeout: value });
    return this;
  }

  /**
   * Set reset timeout
   */
  withResetTimeout(value: number): CircuitConfigBuilder {
    const currentThreshold = this._config.threshold || CircuitThreshold.createDefault();
    this._config.threshold = currentThreshold.withUpdates({ resetTimeout: value });
    return this;
  }

  /**
   * Set sliding window size
   */
  withSlidingWindowSize(value: number): CircuitConfigBuilder {
    const currentThreshold = this._config.threshold || CircuitThreshold.createDefault();
    this._config.threshold = currentThreshold.withUpdates({ slidingWindowSize: value });
    this._config.slidingWindowSize = value;
    return this;
  }

  /**
   * Set minimum requests
   */
  withMinimumRequests(value: number): CircuitConfigBuilder {
    const currentThreshold = this._config.threshold || CircuitThreshold.createDefault();
    this._config.threshold = currentThreshold.withUpdates({ minimumRequests: value });
    return this;
  }

  /**
   * Enable or disable metrics
   */
  withMetrics(enabled: boolean): CircuitConfigBuilder {
    this._config.enableMetrics = enabled;
    return this;
  }

  /**
   * Enable or disable logging
   */
  withLogging(enabled: boolean): CircuitConfigBuilder {
    this._config.enableLogging = enabled;
    return this;
  }

  /**
   * Enable or disable sliding window
   */
  withSlidingWindow(enabled: boolean): CircuitConfigBuilder {
    this._config.enableSlidingWindow = enabled;
    return this;
  }

  /**
   * Set circuit name
   */
  withName(name: string): CircuitConfigBuilder {
    this._config.name = name;
    return this;
  }

  /**
   * Add tag
   */
  withTag(tag: string): CircuitConfigBuilder {
    if (!this._config.tags) {
      this._config.tags = [];
    }
    this._config.tags.push(tag);
    return this;
  }

  /**
   * Set tags
   */
  withTags(tags: string[]): CircuitConfigBuilder {
    this._config.tags = tags;
    return this;
  }

  /**
   * Build the configuration
   */
  build(): CircuitConfig {
    const threshold = this._config.threshold || CircuitThreshold.createDefault();

    return {
      threshold,
      enableMetrics: this._config.enableMetrics ?? true,
      enableLogging: this._config.enableLogging ?? true,
      enableSlidingWindow: this._config.enableSlidingWindow ?? true,
      slidingWindowSize: this._config.slidingWindowSize ?? threshold.getSlidingWindowSize(),
      name: this._config.name,
      tags: this._config.tags,
    };
  }

  /**
   * Create a new builder with default configuration
   */
  static create(): CircuitConfigBuilder {
    return new CircuitConfigBuilder();
  }

  /**
   * Create a new builder from existing configuration
   */
  static fromConfig(config: CircuitConfig): CircuitConfigBuilder {
    const builder = new CircuitConfigBuilder();
    builder._config = { ...config };
    return builder;
  }
}
