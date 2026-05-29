/**
 * Validation Result Entity
 *
 * Represents a validation result with metadata.
 * Immutable entity that stores validation result data with performance metrics.
 */

import { ValidationMetadata } from '../value-objects/ValidationMetadata';

export interface ValidationError {
  field: string;
  message: string;
  code: string;
  severity: 'error' | 'critical';
}

export interface ValidationWarning {
  field: string;
  message: string;
  code: string;
  severity: 'warning' | 'info';
}

export class ValidationResultEntity {
  readonly validationId: string;
  readonly ruleId: string;
  readonly metadata: ValidationMetadata;
  readonly data: unknown;
  readonly isValid: boolean;
  readonly errors: ValidationError[];
  readonly warnings: ValidationWarning[];

  constructor(
    validationId: string,
    ruleId: string,
    isValid: boolean,
    errors: ValidationError[],
    warnings: ValidationWarning[],
    data?: unknown,
    metadata?: ValidationMetadata,
  ) {
    this.validationId = validationId;
    this.ruleId = ruleId;
    this.isValid = isValid;
    this.errors = errors;
    this.warnings = warnings;
    this.data = data;
    this.metadata = metadata || this._createDefaultMetadata();
  }

  /**
   * Check if validation is valid
   */
  isValidResult(): boolean {
    return this.isValid;
  }

  /**
   * Check if validation is invalid
   */
  isInvalid(): boolean {
    return !this.isValid;
  }

  /**
   * Get error count
   */
  getErrorCount(): number {
    return this.errors.length;
  }

  /**
   * Get warning count
   */
  getWarningCount(): number {
    return this.warnings.length;
  }

  /**
   * Get validation duration
   */
  getDuration(): number {
    return this.metadata.getDuration();
  }

  /**
   * Get validation timestamp
   */
  getTimestamp(): number {
    return this.metadata.getTimestamp();
  }

  /**
   * Create a copy with updated validity
   */
  withValidity(isValid: boolean, errors?: ValidationError[], warnings?: ValidationWarning[]): ValidationResultEntity {
    return new ValidationResultEntity(
      this.validationId,
      this.ruleId,
      isValid,
      errors || this.errors,
      warnings || this.warnings,
      this.data,
      this.metadata,
    );
  }

  /**
   * Create a copy with updated metadata
   */
  withMetadata(updates: Partial<import('./../value-objects/ValidationMetadata').ValidationMetadataData>): ValidationResultEntity {
    return new ValidationResultEntity(
      this.validationId,
      this.ruleId,
      this.isValid,
      this.errors,
      this.warnings,
      this.data,
      this.metadata.update(updates),
    );
  }

  /**
   * Create a copy
   */
  clone(): ValidationResultEntity {
    return new ValidationResultEntity(
      this.validationId,
      this.ruleId,
      this.isValid,
      [...this.errors],
      [...this.warnings],
      this.data,
      this.metadata.clone(),
    );
  }

  private _createDefaultMetadata(): ValidationMetadata {
    return new ValidationMetadata({
      timestamp: Date.now(),
      duration: 0,
    });
  }
}

export interface ValidationError {
  field: string;
  message: string;
  code: string;
  severity: 'error' | 'critical';
}

export interface ValidationWarning {
  field: string;
  message: string;
  code: string;
  severity: 'warning' | 'info';
}
