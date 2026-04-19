/**
 * Base Validator
 * 
 * Abstract base class providing common functionality for validators.
 */

import { IValidator, ValidationResult } from './IValidator';

export abstract class BaseValidator implements IValidator {
  protected _name: string;
  protected _enabled: boolean;

  constructor(name: string) {
    this._name = name;
    this._enabled = true;
  }

  abstract validate(data: unknown): ValidationResult;

  /**
   * Gets validator name
   * 
   * @returns Validator name
   */
  getValidatorName(): string {
    return this._name;
  }

  /**
   * Gets validator name (alias for getValidatorName)
   * 
   * @returns Validator name
   */
  getName(): string {
    return this._name;
  }

  /**
   * Checks if validator is enabled
   * 
   * @returns True if enabled
   */
  isEnabled(): boolean {
    return this._enabled;
  }

  /**
   * Enables or disables the validator
   * 
   * @param enabled - Enable flag
   */
  setEnabled(enabled: boolean): void {
    this._enabled = enabled;
  }

  /**
   * Creates a successful validation result
   * 
   * @param warnings - Optional warnings
   * @returns Validation result
   */
  protected _success(warnings: string[] = []): ValidationResult {
    return {
      valid: true,
      errors: [],
      warnings,
    };
  }

  /**
   * Creates a failed validation result
   * 
   * @param errors - Error messages
   * @param warnings - Optional warnings
   * @returns Validation result
   */
  protected _failure(errors: string[], warnings: string[] = []): ValidationResult {
    return {
      valid: false,
      errors,
      warnings,
    };
  }

  /**
   * Adds error message to result
   * 
   * @param result - Validation result
   * @param message - Error message
   * @returns Updated result
   */
  protected _addError(result: ValidationResult, message: string): ValidationResult {
    return {
      ...result,
      valid: false,
      errors: [...result.errors, message],
    };
  }

  /**
   * Adds warning message to result
   * 
   * @param result - Validation result
   * @param message - Warning message
   * @returns Updated result
   */
  protected _addWarning(result: ValidationResult, message: string): ValidationResult {
    return {
      ...result,
      warnings: [...result.warnings, message],
    };
  }

  /**
   * Validates if data is not null/undefined
   * 
   * @param data - Data to validate
   * @returns True if valid
   */
  protected _isNotNull(data: unknown): boolean {
    return data !== null && data !== undefined;
  }

  /**
   * Validates if data is of expected type
   * 
   * @param data - Data to validate
   * @param type - Expected type
   * @returns True if type matches
   */
  protected _isType(data: unknown, type: string): boolean {
    return typeof data === type;
  }

  /**
   * Validates if data is an object
   * 
   * @param data - Data to validate
   * @returns True if object
   */
  protected _isObject(data: unknown): boolean {
    return typeof data === 'object' && data !== null && !Array.isArray(data);
  }

  /**
   * Validates if data is an array
   * 
   * @param data - Data to validate
   * @returns True if array
   */
  protected _isArray(data: unknown): boolean {
    return Array.isArray(data);
  }

  /**
   * Validates if string is not empty
   * 
   * @param data - Data to validate
   * @returns True if not empty
   */
  protected _isNotEmpty(data: string): boolean {
    return typeof data === 'string' && data.length > 0;
  }
}
