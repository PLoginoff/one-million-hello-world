/**
 * Cache Configuration Validator
 * 
 * Validates cache configuration settings.
 */

import { InvalidationStrategy } from '../../types/cache-types';
import { CacheConfigOptions } from '../defaults/DefaultConfigs';

export class CacheConfigValidator {
  /**
   * Validate complete cache configuration
   */
  static validate(config: CacheConfigOptions): void {
    this.validateMaxSize(config.maxSize);
    this.validateDefaultTTL(config.defaultTTL);
    this.validateInvalidationStrategy(config.invalidationStrategy);
    this.validateMultiLevel(config.enableMultiLevel);
  }

  /**
   * Validate max size
   */
  static validateMaxSize(maxSize: number): void {
    if (typeof maxSize !== 'number' || isNaN(maxSize)) {
      throw new Error('Max size must be a number');
    }
    if (maxSize < 1) {
      throw new Error('Max size must be at least 1');
    }
    if (maxSize > 1000000) {
      throw new Error('Max size cannot exceed 1,000,000');
    }
  }

  /**
   * Validate default TTL
   */
  static validateDefaultTTL(ttl: number): void {
    if (typeof ttl !== 'number' || isNaN(ttl)) {
      throw new Error('Default TTL must be a number');
    }
    if (ttl < 0) {
      throw new Error('Default TTL cannot be negative');
    }
    if (ttl > 86400000) {
      throw new Error('Default TTL cannot exceed 24 hours (86400000ms)');
    }
  }

  /**
   * Validate invalidation strategy
   */
  static validateInvalidationStrategy(strategy: InvalidationStrategy): void {
    if (!Object.values(InvalidationStrategy).includes(strategy)) {
      throw new Error(`Invalid invalidation strategy: ${strategy}`);
    }
  }

  /**
   * Validate multi-level setting
   */
  static validateMultiLevel(enableMultiLevel: boolean): void {
    if (typeof enableMultiLevel !== 'boolean') {
      throw new Error('Enable multi-level must be a boolean');
    }
  }

  /**
   * Validate partial configuration
   */
  static validatePartial(config: Partial<CacheConfigOptions>): void {
    if (config.maxSize !== undefined) {
      this.validateMaxSize(config.maxSize);
    }
    if (config.defaultTTL !== undefined) {
      this.validateDefaultTTL(config.defaultTTL);
    }
    if (config.invalidationStrategy !== undefined) {
      this.validateInvalidationStrategy(config.invalidationStrategy);
    }
    if (config.enableMultiLevel !== undefined) {
      this.validateMultiLevel(config.enableMultiLevel);
    }
  }
}
