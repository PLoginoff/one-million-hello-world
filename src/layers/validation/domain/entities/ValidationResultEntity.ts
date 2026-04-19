/**
 * Validation Result Entity
 * 
 * Represents the result of a validation operation.
 */

export interface ValidationResultData {
  valid: boolean;
  errors: Array<{ field: string; message: string }>;
  warnings: Array<{ field: string; message: string }>;
  validatedAt: number;
}

export class ValidationResultEntity {
  readonly data: ValidationResultData;

  private constructor(data: ValidationResultData) {
    this.data = { ...data };
  }

  /**
   * Create successful validation result
   */
  static success(): ValidationResultEntity {
    return new ValidationResultEntity({
      valid: true,
      errors: [],
      warnings: [],
      validatedAt: Date.now(),
    });
  }

  /**
   * Create failed validation result
   */
  static failure(errors: Array<{ field: string; message: string }>): ValidationResultEntity {
    return new ValidationResultEntity({
      valid: false,
      errors,
      warnings: [],
      validatedAt: Date.now(),
    });
  }

  /**
   * Create validation result with warnings
   */
  static withWarnings(warnings: Array<{ field: string; message: string }>): ValidationResultEntity {
    return new ValidationResultEntity({
      valid: true,
      errors: [],
      warnings,
      validatedAt: Date.now(),
    });
  }

  /**
   * Add error to result
   */
  addError(field: string, message: string): ValidationResultEntity {
    return new ValidationResultEntity({
      ...this.data,
      valid: false,
      errors: [...this.data.errors, { field, message }],
    });
  }

  /**
   * Add warning to result
   */
  addWarning(field: string, message: string): ValidationResultEntity {
    return new ValidationResultEntity({
      ...this.data,
      warnings: [...this.data.warnings, { field, message }],
    });
  }

  /**
   * Merge with another result
   */
  merge(other: ValidationResultEntity): ValidationResultEntity {
    return new ValidationResultEntity({
      valid: this.data.valid && other.data.valid,
      errors: [...this.data.errors, ...other.data.errors],
      warnings: [...this.data.warnings, ...other.data.warnings],
      validatedAt: Date.now(),
    });
  }

  /**
   * Check if validation passed
   */
  isValid(): boolean {
    return this.data.valid;
  }

  /**
   * Get error count
   */
  getErrorCount(): number {
    return this.data.errors.length;
  }

  /**
   * Get warning count
   */
  getWarningCount(): number {
    return this.data.warnings.length;
  }

  /**
   * Get errors for specific field
   */
  getFieldErrors(field: string): string[] {
    return this.data.errors.filter(e => e.field === field).map(e => e.message);
  }

  /**
   * Get warnings for specific field
   */
  getFieldWarnings(field: string): string[] {
    return this.data.warnings.filter(w => w.field === field).map(w => w.message);
  }

  /**
   * Clone the entity
   */
  clone(): ValidationResultEntity {
    return new ValidationResultEntity({ ...this.data });
  }

  /**
   * Convert to plain object
   */
  toObject(): ValidationResultData {
    return { ...this.data };
  }

  /**
   * Convert error messages to string
   */
  errorsToString(): string {
    return this.data.errors.map(e => `${e.field}: ${e.message}`).join(', ');
  }

  /**
   * Convert warning messages to string
   */
  warningsToString(): string {
    return this.data.warnings.map(w => `${w.field}: ${w.message}`).join(', ');
  }
}
