/**
 * Validator Factory Interface
 * 
 * Defines the contract for creating validators.
 */

import { IValidator } from '../validation/IValidator';

export interface IValidatorFactory {
  /**
   * Creates a validator by name
   * 
   * @param name - Validator name
   * @param config - Optional configuration
   * @returns Validator instance
   * @throws Error if validator is not found
   */
  createValidator(name: string, config?: Record<string, unknown>): IValidator;

  /**
   * Registers a validator
   * 
   * @param name - Validator name
   * @param factory - Validator factory function
   */
  registerValidator(name: string, factory: (config?: Record<string, unknown>) => IValidator): void;

  /**
   * Checks if a validator is registered
   * 
   * @param name - Validator name
   * @returns True if registered
   */
  hasValidator(name: string): boolean;

  /**
   * Gets all registered validator names
   * 
   * @returns Array of validator names
   */
  getValidatorNames(): string[];
}
