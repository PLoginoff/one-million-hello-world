/**
 * Router Configuration Validator
 * 
 * Validates router configuration options.
 */

import { RouterConfigOptions } from '../defaults/DefaultConfigs';

export class RouterConfigValidator {
  private static readonly MIN_MAX_ROUTES = 1;
  private static readonly MAX_MAX_ROUTES = 10000;

  /**
   * Validate complete configuration
   */
  static validate(config: RouterConfigOptions): void {
    this.validateMaxRoutes(config.maxRoutes);
  }

  /**
   * Validate max routes
   */
  static validateMaxRoutes(maxRoutes: number): void {
    if (typeof maxRoutes !== 'number' || isNaN(maxRoutes)) {
      throw new Error('maxRoutes must be a number');
    }
    if (!Number.isInteger(maxRoutes)) {
      throw new Error('maxRoutes must be an integer');
    }
    if (maxRoutes < this.MIN_MAX_ROUTES) {
      throw new Error(`maxRoutes must be at least ${this.MIN_MAX_ROUTES}`);
    }
    if (maxRoutes > this.MAX_MAX_ROUTES) {
      throw new Error(`maxRoutes cannot exceed ${this.MAX_MAX_ROUTES}`);
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
