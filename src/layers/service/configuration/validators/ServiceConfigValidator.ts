/**
 * Service Configuration Validator
 * 
 * Validates service configuration options.
 */

import { ServiceConfigOptions } from '../defaults/DefaultConfigs';

export class ServiceConfigValidator {
  private static readonly MIN_MAX_SERVICES = 1;
  private static readonly MAX_MAX_SERVICES = 1000;
  private static readonly MIN_HEALTH_CHECK_INTERVAL = 1000;

  /**
   * Validate complete configuration
   */
  static validate(config: ServiceConfigOptions): void {
    this.validateMaxServices(config.maxServices);
    this.validateHealthCheckInterval(config.healthCheckInterval);
  }

  /**
   * Validate max services
   */
  static validateMaxServices(maxServices: number): void {
    if (typeof maxServices !== 'number' || isNaN(maxServices)) {
      throw new Error('maxServices must be a number');
    }
    if (!Number.isInteger(maxServices)) {
      throw new Error('maxServices must be an integer');
    }
    if (maxServices < this.MIN_MAX_SERVICES) {
      throw new Error(`maxServices must be at least ${this.MIN_MAX_SERVICES}`);
    }
    if (maxServices > this.MAX_MAX_SERVICES) {
      throw new Error(`maxServices cannot exceed ${this.MAX_MAX_SERVICES}`);
    }
  }

  /**
   * Validate health check interval
   */
  static validateHealthCheckInterval(interval: number): void {
    if (typeof interval !== 'number' || isNaN(interval)) {
      throw new Error('healthCheckInterval must be a number');
    }
    if (!Number.isInteger(interval)) {
      throw new Error('healthCheckInterval must be an integer');
    }
    if (interval < this.MIN_HEALTH_CHECK_INTERVAL) {
      throw new Error(`healthCheckInterval must be at least ${this.MIN_HEALTH_CHECK_INTERVAL}ms`);
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
