/**
 * Decorator Interface
 * 
 * Defines the contract for decorator operations
 * including runtime decoration and cross-cutting concerns.
 */

import { DecoratorResult, DecoratorConfig } from '../types/decorator-types';

/**
 * Interface for decorator operations
 */
export interface IDecorator {
  /**
   * Executes operation with decorators
   * 
   * @param operation - Operation to execute
   * @param decorators - Decorator names
   * @returns Decorator result
   */
  execute<T>(operation: () => Promise<T>, decorators: string[]): Promise<DecoratorResult<T>>;

  /**
   * Sets decorator configuration
   * 
   * @param config - Decorator configuration
   */
  setConfig(config: DecoratorConfig): void;

  /**
   * Gets current decorator configuration
   * 
   * @returns Current decorator configuration
   */
  getConfig(): DecoratorConfig;
}
