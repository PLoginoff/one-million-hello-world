/**
 * Validation Pipeline
 * 
 * Manages a chain of validators for data validation.
 */

import { IValidator, ValidationResult } from './IValidator';

export class ValidationPipeline {
  private _validators: IValidator[] = [];

  /**
   * Adds a validator to the pipeline
   * 
   * @param validator - Validator to add
   */
  addValidator(validator: IValidator): void {
    this._validators.push(validator);
  }

  /**
   * Removes a validator from the pipeline
   * 
   * @param validator - Validator to remove
   */
  removeValidator(validator: IValidator): void {
    const index = this._validators.indexOf(validator);
    if (index > -1) {
      this._validators.splice(index, 1);
    }
  }

  /**
   * Clears all validators
   */
  clearValidators(): void {
    this._validators = [];
  }

  /**
   * Validates data using all validators in the pipeline
   * 
   * @param data - Data to validate
   * @returns Combined validation result
   */
  validate(data: unknown): ValidationResult {
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

  /**
   * Gets the number of validators in the pipeline
   * 
   * @returns Number of validators
   */
  getValidatorCount(): number {
    return this._validators.length;
  }

  /**
   * Gets all validators
   * 
   * @returns Array of validators
   */
  getValidators(): IValidator[] {
    return [...this._validators];
  }
}
