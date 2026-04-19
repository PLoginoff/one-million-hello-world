/**
 * Type Validator
 * 
 * Validates data types for serialization.
 */

import { IValidator, ValidationResult } from './IValidator';

export class TypeValidator implements IValidator {
  private readonly _expectedType: string;

  constructor(expectedType: string) {
    this._expectedType = expectedType;
  }

  validate(data: unknown): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    const actualType = typeof data;

    if (actualType !== this._expectedType) {
      errors.push(`Expected type '${this._expectedType}', got '${actualType}'`);
    }

    if (data === null) {
      warnings.push('Data is null');
    }

    if (data === undefined) {
      errors.push('Data is undefined');
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  getValidatorName(): string {
    return 'type';
  }
}
