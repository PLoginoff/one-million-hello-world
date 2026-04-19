/**
 * Validator Interface
 * 
 * Defines the contract for data validators.
 */

export interface IValidator {
  /**
   * Validates data
   * 
   * @param data - Data to validate
   * @returns Validation result
   */
  validate(data: unknown): ValidationResult;

  /**
   * Gets the validator name
   * 
   * @returns Validator name
   */
  getValidatorName(): string;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}
