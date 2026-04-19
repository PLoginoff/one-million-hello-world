/**
 * Middleware Configuration Validator
 * 
 * Validates middleware configuration options.
 */

import { MiddlewareConfigOptions } from '../defaults/DefaultConfigs';

export class MiddlewareConfigValidator {
  private static readonly MIN_MAX_DEPTH = 1;
  private static readonly MAX_MAX_DEPTH = 200;
  private static readonly MIN_TIMEOUT = 100;
  private static readonly MAX_TIMEOUT = 300000;

  /**
   * Validate complete configuration
   */
  static validate(config: MiddlewareConfigOptions): void {
    this.validateMaxMiddlewareDepth(config.maxMiddlewareDepth);
    this.validateTimeout(config.timeout);
  }

  /**
   * Validate max middleware depth
   */
  static validateMaxMiddlewareDepth(maxDepth: number): void {
    if (typeof maxDepth !== 'number' || isNaN(maxDepth)) {
      throw new Error('maxMiddlewareDepth must be a number');
    }
    if (!Number.isInteger(maxDepth)) {
      throw new Error('maxMiddlewareDepth must be an integer');
    }
    if (maxDepth < this.MIN_MAX_DEPTH) {
      throw new Error(`maxMiddlewareDepth must be at least ${this.MIN_MAX_DEPTH}`);
    }
    if (maxDepth > this.MAX_MAX_DEPTH) {
      throw new Error(`maxMiddlewareDepth cannot exceed ${this.MAX_MAX_DEPTH}`);
    }
  }

  /**
   * Validate timeout
   */
  static validateTimeout(timeout: number): void {
    if (typeof timeout !== 'number' || isNaN(timeout)) {
      throw new Error('timeout must be a number');
    }
    if (timeout < this.MIN_TIMEOUT) {
      throw new Error(`timeout must be at least ${this.MIN_TIMEOUT}ms`);
    }
    if (timeout > this.MAX_TIMEOUT) {
      throw new Error(`timeout cannot exceed ${this.MAX_TIMEOUT}ms`);
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
