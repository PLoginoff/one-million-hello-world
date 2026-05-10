/**
 * Compression Configuration Builder
 * 
 * Fluent builder for creating compression configurations.
 * Provides a type-safe way to construct complex configurations.
 */

import { CompressionAlgorithm } from '../../domain/value-objects/CompressionAlgorithm';
import { CompressionThreshold } from '../../domain/value-objects/CompressionThreshold';
import { CompressionConfigDefaults } from '../defaults/CompressionDefaults';

export interface CompressionConfig {
  algorithm: CompressionAlgorithm;
  threshold: CompressionThreshold;
  enableMetrics: boolean;
  enableLogging: boolean;
  defaultLevel: number;
  name?: string;
  tags?: string[];
}

export class CompressionConfigBuilder {
  private _config: Partial<CompressionConfig> = {};

  constructor(defaults?: CompressionConfigDefaults) {
    if (defaults) {
      this._config = {
        algorithm: defaults.algorithm,
        threshold: defaults.threshold,
        enableMetrics: defaults.enableMetrics,
        enableLogging: defaults.enableLogging,
        defaultLevel: defaults.defaultLevel,
      };
    }
  }

  /**
   * Set compression algorithm
   */
  withAlgorithm(algorithm: CompressionAlgorithm): CompressionConfigBuilder {
    this._config.algorithm = algorithm;
    return this;
  }

  /**
   * Set threshold
   */
  withThreshold(threshold: CompressionThreshold): CompressionConfigBuilder {
    this._config.threshold = threshold;
    return this;
  }

  /**
   * Set default compression level
   */
  withDefaultLevel(level: number): CompressionConfigBuilder {
    this._config.defaultLevel = level;
    return this;
  }

  /**
   * Enable or disable metrics
   */
  withMetrics(enabled: boolean): CompressionConfigBuilder {
    this._config.enableMetrics = enabled;
    return this;
  }

  /**
   * Enable or disable logging
   */
  withLogging(enabled: boolean): CompressionConfigBuilder {
    this._config.enableLogging = enabled;
    return this;
  }

  /**
   * Set configuration name
   */
  withName(name: string): CompressionConfigBuilder {
    this._config.name = name;
    return this;
  }

  /**
   * Add tag
   */
  withTag(tag: string): CompressionConfigBuilder {
    if (!this._config.tags) {
      this._config.tags = [];
    }
    this._config.tags.push(tag);
    return this;
  }

  /**
   * Set tags
   */
  withTags(tags: string[]): CompressionConfigBuilder {
    this._config.tags = tags;
    return this;
  }

  /**
   * Build the configuration
   */
  build(): CompressionConfig {
    const algorithm = this._config.algorithm || CompressionAlgorithm.createGzip();
    const threshold = this._config.threshold || CompressionThreshold.createDefault();

    return {
      algorithm,
      threshold,
      enableMetrics: this._config.enableMetrics ?? true,
      enableLogging: this._config.enableLogging ?? true,
      defaultLevel: this._config.defaultLevel ?? algorithm.getDefaultLevel(),
      name: this._config.name,
      tags: this._config.tags,
    };
  }

  /**
   * Create a new builder with default configuration
   */
  static create(): CompressionConfigBuilder {
    return new CompressionConfigBuilder();
  }

  /**
   * Create a new builder from existing configuration
   */
  static fromConfig(config: CompressionConfig): CompressionConfigBuilder {
    const builder = new CompressionConfigBuilder();
    builder._config = { ...config };
    return builder;
  }
}
