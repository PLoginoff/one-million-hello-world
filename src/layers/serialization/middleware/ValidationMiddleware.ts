/**
 * Validation Middleware
 * 
 * Middleware that validates data in the pipeline.
 */

import { IMiddleware, MiddlewareContext } from './IMiddleware';
import { IValidator, ValidationResult } from '../validation/IValidator';

export class ValidationMiddleware<T = unknown> implements IMiddleware<T> {
  private _name: string;
  private _validators: IValidator[];
  private _enabled: boolean;
  private _failOnError: boolean;

  constructor(name: string = 'validation', failOnError: boolean = true) {
    this._name = name;
    this._validators = [];
    this._enabled = true;
    this._failOnError = failOnError;
  }

  process(
    context: MiddlewareContext<T>,
    next: (context: MiddlewareContext<T>) => MiddlewareContext<T>
  ): MiddlewareContext<T> {
    if (!this._enabled) {
      return next(context);
    }

    const result = this._validate(context.data);

    if (!result.valid && this._failOnError) {
      context.metadata = context.metadata ?? {};
      context.metadata.validationErrors = result.errors;
      context.metadata.validationWarnings = result.warnings;
      context.metadata.validationFailed = true;
    }

    context.metadata = context.metadata ?? {};
    context.metadata.validationResult = result;

    return next(context);
  }

  /**
   * Validates data using all validators
   * 
   * @param data - Data to validate
   * @returns Validation result
   */
  private _validate(data: unknown): ValidationResult {
    const allErrors: string[] = [];
    const allWarnings: string[] = [];

    for (const validator of this._validators) {
      const result = validator.validate(data);
      allErrors.push(...result.errors);
      allWarnings.push(...result.warnings);
    }

    return {
      valid: allErrors.length === 0,
      errors: allErrors,
      warnings: allWarnings,
    };
  }

  getName(): string {
    return this._name;
  }

  /**
   * Adds a validator
   * 
   * @param validator - Validator to add
   * @returns This middleware for chaining
   */
  addValidator(validator: IValidator): ValidationMiddleware<T> {
    this._validators.push(validator);
    return this;
  }

  /**
   * Removes a validator
   * 
   * @param validator - Validator to remove
   * @returns This middleware for chaining
   */
  removeValidator(validator: IValidator): ValidationMiddleware<T> {
    const index = this._validators.indexOf(validator);
    if (index > -1) {
      this._validators.splice(index, 1);
    }
    return this;
  }

  /**
   * Clears all validators
   * 
   * @returns This middleware for chaining
   */
  clearValidators(): ValidationMiddleware<T> {
    this._validators = [];
    return this;
  }

  /**
   * Enables or disables the middleware
   * 
   * @param enabled - Enable flag
   * @returns This middleware for chaining
   */
  setEnabled(enabled: boolean): ValidationMiddleware<T> {
    this._enabled = enabled;
    return this;
  }

  /**
   * Checks if the middleware is enabled
   * 
   * @returns True if enabled
   */
  isEnabled(): boolean {
    return this._enabled;
  }

  /**
   * Sets whether to fail on validation error
   * 
   * @param fail - Fail on error flag
   * @returns This middleware for chaining
   */
  setFailOnError(fail: boolean): ValidationMiddleware<T> {
    this._failOnError = fail;
    return this;
  }
}
