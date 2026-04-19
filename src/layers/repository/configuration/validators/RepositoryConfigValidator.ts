/**
 * Repository Configuration Validator
 * 
 * Validates repository configuration options.
 */

import { RepositoryConfigOptions } from '../defaults/DefaultConfigs';

export class RepositoryConfigValidator {
  private static readonly MIN_MAX_REPOSITORIES = 1;
  private static readonly MAX_MAX_REPOSITORIES = 1000;
  private static readonly MIN_MAX_CONNECTIONS = 1;
  private static readonly MAX_MAX_CONNECTIONS = 100;

  /**
   * Validate complete configuration
   */
  static validate(config: RepositoryConfigOptions): void {
    this.validateMaxRepositories(config.maxRepositories);
    this.validateMaxConnections(config.maxConnections);
  }

  /**
   * Validate max repositories
   */
  static validateMaxRepositories(maxRepositories: number): void {
    if (typeof maxRepositories !== 'number' || isNaN(maxRepositories)) {
      throw new Error('maxRepositories must be a number');
    }
    if (!Number.isInteger(maxRepositories)) {
      throw new Error('maxRepositories must be an integer');
    }
    if (maxRepositories < this.MIN_MAX_REPOSITORIES) {
      throw new Error(`maxRepositories must be at least ${this.MIN_MAX_REPOSITORIES}`);
    }
    if (maxRepositories > this.MAX_MAX_REPOSITORIES) {
      throw new Error(`maxRepositories cannot exceed ${this.MAX_MAX_REPOSITORIES}`);
    }
  }

  /**
   * Validate max connections
   */
  static validateMaxConnections(maxConnections: number): void {
    if (typeof maxConnections !== 'number' || isNaN(maxConnections)) {
      throw new Error('maxConnections must be a number');
    }
    if (!Number.isInteger(maxConnections)) {
      throw new Error('maxConnections must be an integer');
    }
    if (maxConnections < this.MIN_MAX_CONNECTIONS) {
      throw new Error(`maxConnections must be at least ${this.MIN_MAX_CONNECTIONS}`);
    }
    if (maxConnections > this.MAX_MAX_CONNECTIONS) {
      throw new Error(`maxConnections cannot exceed ${this.MAX_MAX_CONNECTIONS}`);
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
