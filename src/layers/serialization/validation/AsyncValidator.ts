/**
 * Async Validator
 * 
 * Validator that supports asynchronous validation.
 */

import { IValidator, ValidationResult } from './IValidator';
import { BaseValidator } from './BaseValidator';

export type AsyncValidationFunction = (data: unknown) => Promise<ValidationResult>;

export class AsyncValidator extends BaseValidator {
  private _asyncValidator: AsyncValidationFunction;
  private _timeout?: number;

  constructor(name: string, asyncValidator: AsyncValidationFunction, timeout?: number) {
    super(name);
    this._asyncValidator = asyncValidator;
    this._timeout = timeout;
  }

  async validateAsync(data: unknown): Promise<ValidationResult> {
    if (this._timeout) {
      return this._validateWithTimeout(data);
    }
    return this._asyncValidator(data);
  }

  validate(data: unknown): ValidationResult {
    this._success(['Async validation called synchronously - use validateAsync instead']);
    return {
      valid: false,
      errors: ['Async validation called synchronously - use validateAsync instead'],
      warnings: [],
    };
  }

  /**
   * Gets the async validation function
   * 
   * @returns Async validation function
   */
  getAsyncValidator(): AsyncValidationFunction {
    return this._asyncValidator;
  }

  /**
   * Sets the async validation function
   * 
   * @param validator - New async validator
   * @returns This validator for chaining
   */
  setAsyncValidator(validator: AsyncValidationFunction): AsyncValidator {
    this._asyncValidator = validator;
    return this;
  }

  /**
   * Gets the timeout
   * 
   * @returns Timeout in milliseconds or undefined
   */
  getTimeout(): number | undefined {
    return this._timeout;
  }

  /**
   * Sets the timeout
   * 
   * @param timeout - Timeout in milliseconds
   * @returns This validator for chaining
   */
  setTimeout(timeout: number): AsyncValidator {
    this._timeout = timeout;
    return this;
  }

  /**
   * Validates with timeout
   * 
   * @param data - Data to validate
   * @returns Validation result
   */
  private async _validateWithTimeout(data: unknown): Promise<ValidationResult> {
    const timeoutPromise = new Promise<ValidationResult>((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Validation timeout after ${this._timeout}ms`));
      }, this._timeout);
    });

    try {
      return await Promise.race([
        this._asyncValidator(data),
        timeoutPromise,
      ]) as ValidationResult;
    } catch (error) {
      return {
        valid: false,
        errors: [error instanceof Error ? error.message : String(error)],
        warnings: [],
      };
    }
  }
}
