/**
 * Network Configuration Builder
 * 
 * Fluent builder for creating network configurations.
 */

import { NetworkConfigOptions, DefaultConfigs } from '../defaults/DefaultConfigs';
import { NetworkConfigValidator } from '../validators/NetworkConfigValidator';
import { ConnectionPriorityEnum } from '../../domain/value-objects/ConnectionPriority';
import { ConnectionTypeEnum } from '../../domain/value-objects/ConnectionType';

export class NetworkConfigBuilder {
  private config: NetworkConfigOptions;

  constructor() {
    this.config = { ...DefaultConfigs.DEFAULT };
  }

  /**
   * Start with default configuration
   */
  static create(): NetworkConfigBuilder {
    return new NetworkConfigBuilder();
  }

  /**
   * Start with high-performance configuration
   */
  static highPerformance(): NetworkConfigBuilder {
    const builder = new NetworkConfigBuilder();
    builder.config = { ...DefaultConfigs.HIGH_PERFORMANCE };
    return builder;
  }

  /**
   * Start with secure configuration
   */
  static secure(): NetworkConfigBuilder {
    const builder = new NetworkConfigBuilder();
    builder.config = { ...DefaultConfigs.SECURE };
    return builder;
  }

  /**
   * Start with development configuration
   */
  static development(): NetworkConfigBuilder {
    const builder = new NetworkConfigBuilder();
    builder.config = { ...DefaultConfigs.DEVELOPMENT };
    return builder;
  }

  /**
   * Start with production configuration
   */
  static production(): NetworkConfigBuilder {
    const builder = new NetworkConfigBuilder();
    builder.config = { ...DefaultConfigs.PRODUCTION };
    return builder;
  }

  /**
   * Set max connections
   */
  withMaxConnections(max: number): NetworkConfigBuilder {
    NetworkConfigValidator.validateMaxConnections(max);
    this.config.maxConnections = max;
    return this;
  }

  /**
   * Set default timeout in milliseconds
   */
  withTimeout(timeout: number): NetworkConfigBuilder {
    NetworkConfigValidator.validateTimeout(timeout);
    this.config.defaultTimeout = timeout;
    return this;
  }

  /**
   * Set default timeout in seconds
   */
  withTimeoutSeconds(seconds: number): NetworkConfigBuilder {
    return this.withTimeout(seconds * 1000);
  }

  /**
   * Enable or disable keep-alive
   */
  withKeepAlive(enabled: boolean, delay?: number): NetworkConfigBuilder {
    const keepAliveDelay = delay ?? this.config.keepAliveInitialDelay;
    NetworkConfigValidator.validateKeepAlive(enabled, keepAliveDelay);
    this.config.keepAlive = enabled;
    this.config.keepAliveInitialDelay = keepAliveDelay;
    return this;
  }

  /**
   * Set retry settings
   */
  withRetries(maxRetries: number, delay: number, multiplier: number): NetworkConfigBuilder {
    NetworkConfigValidator.validateRetrySettings(maxRetries, delay, multiplier);
    this.config.maxRetries = maxRetries;
    this.config.retryDelay = delay;
    this.config.backoffMultiplier = multiplier;
    return this;
  }

  /**
   * Set connection priority
   */
  withPriority(priority: ConnectionPriorityEnum): NetworkConfigBuilder {
    NetworkConfigValidator.validatePriority(priority);
    this.config.priority = priority;
    return this;
  }

  /**
   * Set connection type
   */
  withConnectionType(type: ConnectionTypeEnum): NetworkConfigBuilder {
    NetworkConfigValidator.validateConnectionType(type);
    this.config.connectionType = type;
    return this;
  }

  /**
   * Enable or disable compression
   */
  withCompression(enabled: boolean): NetworkConfigBuilder {
    this.config.enableCompression = enabled;
    return this;
  }

  /**
   * Enable or disable encryption
   */
  withEncryption(enabled: boolean): NetworkConfigBuilder {
    this.config.enableEncryption = enabled;
    return this;
  }

  /**
   * Set bandwidth limit in bytes per second
   */
  withBandwidthLimit(limit: number): NetworkConfigBuilder {
    NetworkConfigValidator.validateBandwidthLimit(limit);
    this.config.bandwidthLimit = limit;
    return this;
  }

  /**
   * Set bandwidth limit in MB/s
   */
  withBandwidthLimitMB(mbps: number): NetworkConfigBuilder {
    return this.withBandwidthLimit(mbps * 1024 * 1024);
  }

  /**
   * Enable or disable metrics
   */
  withMetrics(enabled: boolean): NetworkConfigBuilder {
    this.config.enableMetrics = enabled;
    return this;
  }

  /**
   * Enable or disable logging
   */
  withLogging(enabled: boolean): NetworkConfigBuilder {
    this.config.enableLogging = enabled;
    return this;
  }

  /**
   * Build the configuration
   */
  build(): NetworkConfigOptions {
    NetworkConfigValidator.validate(this.config);
    return { ...this.config };
  }

  /**
   * Build without validation (use with caution)
   */
  buildUnsafe(): NetworkConfigOptions {
    return { ...this.config };
  }
}
