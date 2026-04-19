/**
 * Network Configuration Validator
 * 
 * Validates network configuration parameters.
 */

import { NetworkConfigOptions } from '../defaults/DefaultConfigs';
import { ConnectionPriorityEnum } from '../../domain/value-objects/ConnectionPriority';
import { ConnectionTypeEnum } from '../../domain/value-objects/ConnectionType';

export class NetworkConfigValidator {
  /**
   * Validate max connections
   */
  static validateMaxConnections(max: number): void {
    if (max < 1) {
      throw new Error('Max connections must be at least 1');
    }
    if (max > 100000) {
      throw new Error('Max connections cannot exceed 100000');
    }
  }

  /**
   * Validate timeout
   */
  static validateTimeout(timeout: number): void {
    if (timeout < 0) {
      throw new Error('Timeout cannot be negative');
    }
    if (timeout > 600000) {
      throw new Error('Timeout cannot exceed 10 minutes');
    }
  }

  /**
   * Validate keep alive settings
   */
  static validateKeepAlive(enabled: boolean, delay: number): void {
    if (enabled && delay < 0) {
      throw new Error('Keep-alive delay cannot be negative');
    }
    if (enabled && delay > 60000) {
      throw new Error('Keep-alive delay cannot exceed 60 seconds');
    }
  }

  /**
   * Validate retry settings
   */
  static validateRetrySettings(maxRetries: number, delay: number, multiplier: number): void {
    if (maxRetries < 0) {
      throw new Error('Max retries cannot be negative');
    }
    if (maxRetries > 10) {
      throw new Error('Max retries cannot exceed 10');
    }
    if (delay < 0) {
      throw new Error('Retry delay cannot be negative');
    }
    if (delay > 60000) {
      throw new Error('Retry delay cannot exceed 60 seconds');
    }
    if (multiplier < 1) {
      throw new Error('Backoff multiplier must be at least 1');
    }
    if (multiplier > 10) {
      throw new Error('Backoff multiplier cannot exceed 10');
    }
  }

  /**
   * Validate priority
   */
  static validatePriority(priority: ConnectionPriorityEnum): void {
    const validPriorities = [
      ConnectionPriorityEnum.LOW,
      ConnectionPriorityEnum.NORMAL,
      ConnectionPriorityEnum.HIGH,
      ConnectionPriorityEnum.CRITICAL,
    ];
    if (!validPriorities.includes(priority)) {
      throw new Error('Invalid priority value');
    }
  }

  /**
   * Validate connection type
   */
  static validateConnectionType(type: ConnectionTypeEnum): void {
    const validTypes = [
      ConnectionTypeEnum.TCP,
      ConnectionTypeEnum.UDP,
      ConnectionTypeEnum.TLS,
      ConnectionTypeEnum.WEBSOCKET,
    ];
    if (!validTypes.includes(type)) {
      throw new Error('Invalid connection type');
    }
  }

  /**
   * Validate bandwidth limit
   */
  static validateBandwidthLimit(limit: number): void {
    if (limit < 0) {
      throw new Error('Bandwidth limit cannot be negative');
    }
    if (limit > 1024 * 1024 * 1024) {
      throw new Error('Bandwidth limit cannot exceed 1 GB/s');
    }
  }

  /**
   * Validate complete configuration
   */
  static validate(config: NetworkConfigOptions): void {
    this.validateMaxConnections(config.maxConnections);
    this.validateTimeout(config.defaultTimeout);
    this.validateKeepAlive(config.keepAlive, config.keepAliveInitialDelay);
    this.validateRetrySettings(config.maxRetries, config.retryDelay, config.backoffMultiplier);
    this.validatePriority(config.priority);
    this.validateConnectionType(config.connectionType);
    this.validateBandwidthLimit(config.bandwidthLimit);
  }
}
