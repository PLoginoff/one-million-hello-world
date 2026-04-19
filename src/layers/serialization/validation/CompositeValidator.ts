/**
 * Composite Validator
 * 
 * Composite validator that combines multiple validators.
 */

import { IValidator, ValidationResult } from './IValidator';
import { BaseValidator } from './BaseValidator';

export class CompositeValidator extends BaseValidator {
  private _validators: IValidator[];
  private _mode: 'all' | 'any' | 'first';

  constructor(name: string, mode: 'all' | 'any' | 'first' = 'all') {
    super(name);
    this._validators = [];
    this._mode = mode;
  }

  validate(data: unknown): ValidationResult {
    if (this._validators.length === 0) {
      return this._success();
    }

    switch (this._mode) {
      case 'all':
        return this._validateAll(data);
      case 'any':
        return this._validateAny(data);
      case 'first':
        return this._validateFirst(data);
      default:
        return this._validateAll(data);
    }
  }

  /**
   * Adds a validator to the composite
   * 
   * @param validator - Validator to add
   * @returns This validator for chaining
   */
  addValidator(validator: IValidator): CompositeValidator {
    this._validators.push(validator);
    return this;
  }

  /**
   * Removes a validator from the composite
   * 
   * @param validator - Validator to remove
   * @returns This validator for chaining
   */
  removeValidator(validator: IValidator): CompositeValidator {
    const index = this._validators.indexOf(validator);
    if (index > -1) {
      this._validators.splice(index, 1);
    }
    return this;
  }

  /**
   * Clears all validators
   * 
   * @returns This validator for chaining
   */
  clearValidators(): CompositeValidator {
    this._validators = [];
    return this;
  }

  /**
   * Gets all validators
   * 
   * @returns Array of validators
   */
  getValidators(): IValidator[] {
    return [...this._validators];
  }

  /**
   * Gets the number of validators
   * 
   * @returns Number of validators
   */
  getValidatorCount(): number {
    return this._validators.length;
  }

  /**
   * Sets the validation mode
   * 
   * @param mode - Validation mode
   * @returns This validator for chaining
   */
  setMode(mode: 'all' | 'any' | 'first'): CompositeValidator {
    this._mode = mode;
    return this;
  }

  /**
   * Gets the validation mode
   * 
   * @returns Current mode
   */
  getMode(): 'all' | 'any' | 'first' {
    return this._mode;
  }

  /**
   * Validates using all validators (AND logic)
   * 
   * @param data - Data to validate
   * @returns Combined validation result
   */
  private _validateAll(data: unknown): ValidationResult {
    const allErrors: string[] = [];
    const allWarnings: string[] = [];

    for (const validator of this._validators) {
      if (!validator.isEnabled()) {
        continue;
      }

      const result = validator.validate(data);
      allErrors.push(...result.errors);
      allWarnings.push(...result.warnings);

      if (!result.valid) {
        return this._failure(allErrors, allWarnings);
      }
    }

    return this._success(allWarnings);
  }

  /**
   * Validates using any validator (OR logic)
   * 
   * @param data - Data to validate
   * @returns Combined validation result
   */
  private _validateAny(data: unknown): ValidationResult {
    const allErrors: string[] = [];
    const allWarnings: string[] = [];

    for (const validator of this._validators) {
      if (!validator.isEnabled()) {
        continue;
      }

      const result = validator.validate(data);
      allWarnings.push(...result.warnings);

      if (result.valid) {
        return this._success(allWarnings);
      }

      allErrors.push(...result.errors);
    }

    return this._failure(allErrors, allWarnings);
  }

  /**
   * Validates using the first validator that succeeds
   * 
   * @param data - Data to validate
   * @returns Validation result
   */
  private _validateFirst(data: unknown): ValidationResult {
    for (const validator of this._validators) {
      if (!validator.isEnabled()) {
        continue;
      }

      const result = validator.validate(data);
      if (result.valid) {
        return result;
      }
    }

    return this._failure(['No validator succeeded']);
  }
}
