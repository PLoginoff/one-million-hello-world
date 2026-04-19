/**
 * Controller Configuration Validator
 * 
 * Validates controller configuration options.
 */

import { ControllerConfigOptions } from '../defaults/DefaultConfigs';

export class ControllerConfigValidator {
  private static readonly MIN_MAX_CONTROLLERS = 1;
  private static readonly MAX_MAX_CONTROLLERS = 1000;

  /**
   * Validate complete configuration
   */
  static validate(config: ControllerConfigOptions): void {
    this.validateMaxControllers(config.maxControllers);
    this.validateDefaultScope(config.defaultScope);
  }

  /**
   * Validate max controllers
   */
  static validateMaxControllers(maxControllers: number): void {
    if (typeof maxControllers !== 'number' || isNaN(maxControllers)) {
      throw new Error('maxControllers must be a number');
    }
    if (!Number.isInteger(maxControllers)) {
      throw new Error('maxControllers must be an integer');
    }
    if (maxControllers < this.MIN_MAX_CONTROLLERS) {
      throw new Error(`maxControllers must be at least ${this.MIN_MAX_CONTROLLERS}`);
    }
    if (maxControllers > this.MAX_MAX_CONTROLLERS) {
      throw new Error(`maxControllers cannot exceed ${this.MAX_MAX_CONTROLLERS}`);
    }
  }

  /**
   * Validate default scope
   */
  static validateDefaultScope(scope: string): void {
    const validScopes = ['singleton', 'transient', 'request'];
    if (!validScopes.includes(scope)) {
      throw new Error(`defaultScope must be one of: ${validScopes.join(', ')}`);
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
