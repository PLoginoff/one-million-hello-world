/**
 * Validation Configuration Validator
 * 
 * Validates validation configuration options.
 */

import { ValidationConfigOptions } from '../defaults/DefaultConfigs';

export class ValidationConfigValidator {
  private static readonly MIN_MAX_DEPTH = 1;
  private static readonly MAX_MAX_DEPTH = 100;
  private static readonly MIN_MAX_ERRORS = 1;
  private static readonly MAX_MAX_ERRORS = 1000;

  /**
   * Validate complete configuration
   */
  static validate(config: ValidationConfigOptions): void {
    this.validateMaxDepth(config.maxDepth);
    this.validateMaxErrors(config.maxErrors);
  }

  /**
   * Validate max depth
   */
  static validateMaxDepth(maxDepth: number): void {
    if (typeof maxDepth !== 'number' || isNaN(maxDepth)) {
      throw new Error('maxDepth must be a number');
    }
    if (!Number.isInteger(maxDepth)) {
      throw new Error('maxDepth must be an integer');
    }
    if (maxDepth < this.MIN_MAX_DEPTH) {
      throw new Error(`maxDepth must be at least ${this.MIN_MAX_DEPTH}`);
    }
    if (maxDepth > this.MAX_MAX_DEPTH) {
      throw new Error(`maxDepth cannot exceed ${this.MAX_MAX_DEPTH}`);
    }
  }

  /**
   * Validate max errors
   */
  static validateMaxErrors(maxErrors: number): void {
    if (typeof maxErrors !== 'number' || isNaN(maxErrors)) {
      throw new Error('maxErrors must be a number');
    }
    if (!Number.isInteger(maxErrors)) {
      throw new Error('maxErrors must be an integer');
    }
    if (maxErrors < this.MIN_MAX_ERRORS) {
      throw new Error(`maxErrors must be at least ${this.MIN_MAX_ERRORS}`);
    }
    if (maxErrors > this.MAX_MAX_ERRORS) {
      throw new Error(`maxErrors cannot exceed ${this.MAX_MAX_ERRORS}`);
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
