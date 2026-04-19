/**
 * Rate Limit Configuration Validator
 * 
 * Validates rate limiting configuration options.
 */

import { RateLimitConfigOptions } from '../defaults/DefaultConfigs';

export class RateLimitConfigValidator {
  private static readonly MIN_LIMIT = 1;
  private static readonly MAX_LIMIT = 1000000;
  private static readonly MIN_WINDOW = 1000;
  private static readonly MAX_WINDOW = 86400000;
  private static readonly MIN_CLEANUP_INTERVAL = 10000;
  private static readonly MAX_CLEANUP_INTERVAL = 3600000;

  /**
   * Validate complete configuration
   */
  static validate(config: RateLimitConfigOptions): void {
    this.validateDefaultLimit(config.defaultLimit);
    this.validateDefaultWindow(config.defaultWindow);
    this.validateBurstLimit(config.burstLimit);
    this.validateCleanupInterval(config.cleanupInterval);
    this.validateMaxKeysInMemory(config.maxKeysInMemory);
  }

  /**
   * Validate default limit
   */
  static validateDefaultLimit(limit: number): void {
    if (typeof limit !== 'number' || isNaN(limit)) {
      throw new Error('defaultLimit must be a number');
    }
    if (!Number.isInteger(limit)) {
      throw new Error('defaultLimit must be an integer');
    }
    if (limit < this.MIN_LIMIT) {
      throw new Error(`defaultLimit must be at least ${this.MIN_LIMIT}`);
    }
    if (limit > this.MAX_LIMIT) {
      throw new Error(`defaultLimit cannot exceed ${this.MAX_LIMIT}`);
    }
  }

  /**
   * Validate default window
   */
  static validateDefaultWindow(window: number): void {
    if (typeof window !== 'number' || isNaN(window)) {
      throw new Error('defaultWindow must be a number');
    }
    if (!Number.isInteger(window)) {
      throw new Error('defaultWindow must be an integer');
    }
    if (window < this.MIN_WINDOW) {
      throw new Error(`defaultWindow must be at least ${this.MIN_WINDOW}ms`);
    }
    if (window > this.MAX_WINDOW) {
      throw new Error(`defaultWindow cannot exceed ${this.MAX_WINDOW}ms`);
    }
  }

  /**
   * Validate burst limit
   */
  static validateBurstLimit(limit: number): void {
    if (typeof limit !== 'number' || isNaN(limit)) {
      throw new Error('burstLimit must be a number');
    }
    if (!Number.isInteger(limit)) {
      throw new Error('burstLimit must be an integer');
    }
    if (limit < this.MIN_LIMIT) {
      throw new Error(`burstLimit must be at least ${this.MIN_LIMIT}`);
    }
  }

  /**
   * Validate cleanup interval
   */
  static validateCleanupInterval(interval: number): void {
    if (typeof interval !== 'number' || isNaN(interval)) {
      throw new Error('cleanupInterval must be a number');
    }
    if (!Number.isInteger(interval)) {
      throw new Error('cleanupInterval must be an integer');
    }
    if (interval < this.MIN_CLEANUP_INTERVAL) {
      throw new Error(`cleanupInterval must be at least ${this.MIN_CLEANUP_INTERVAL}ms`);
    }
    if (interval > this.MAX_CLEANUP_INTERVAL) {
      throw new Error(`cleanupInterval cannot exceed ${this.MAX_CLEANUP_INTERVAL}ms`);
    }
  }

  /**
   * Validate max keys in memory
   */
  static validateMaxKeysInMemory(maxKeys: number): void {
    if (typeof maxKeys !== 'number' || isNaN(maxKeys)) {
      throw new Error('maxKeysInMemory must be a number');
    }
    if (!Number.isInteger(maxKeys)) {
      throw new Error('maxKeysInMemory must be an integer');
    }
    if (maxKeys < 1) {
      throw new Error('maxKeysInMemory must be at least 1');
    }
  }

  /**
   * Validate boolean configuration option
   */
  static validateBooleanOption(value: boolean, optionName: string): void {
    if (typeof value !== 'boolean') {
      throw new Error(`${optionName} must be a boolean`);
    }
  }
}
