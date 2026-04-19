/**
 * Validation Severity Value Object
 * 
 * Represents severity levels for validation issues.
 */

export enum ValidationSeverity {
  INFO = 'info',
  WARNING = 'warning',
  ERROR = 'error',
  CRITICAL = 'critical',
}

export class ValidationSeverityValueObject {
  readonly value: ValidationSeverity;

  private constructor(value: ValidationSeverity) {
    this.value = value;
  }

  /**
   * Create severity value object
   */
  static create(value: ValidationSeverity): ValidationSeverityValueObject {
    return new ValidationSeverityValueObject(value);
  }

  /**
   * Create info severity
   */
  static info(): ValidationSeverityValueObject {
    return new ValidationSeverityValueObject(ValidationSeverity.INFO);
  }

  /**
   * Create warning severity
   */
  static warning(): ValidationSeverityValueObject {
    return new ValidationSeverityValueObject(ValidationSeverity.WARNING);
  }

  /**
   * Create error severity
   */
  static error(): ValidationSeverityValueObject {
    return new ValidationSeverityValueObject(ValidationSeverity.ERROR);
  }

  /**
   * Create critical severity
   */
  static critical(): ValidationSeverityValueObject {
    return new ValidationSeverityValueObject(ValidationSeverity.CRITICAL);
  }

  /**
   * Check if severity is info
   */
  isInfo(): boolean {
    return this.value === ValidationSeverity.INFO;
  }

  /**
   * Check if severity is warning
   */
  isWarning(): boolean {
    return this.value === ValidationSeverity.WARNING;
  }

  /**
   * Check if severity is error
   */
  isError(): boolean {
    return this.value === ValidationSeverity.ERROR;
  }

  /**
   * Check if severity is critical
   */
  isCritical(): boolean {
    return this.value === ValidationSeverity.CRITICAL;
  }

  /**
   * Check if severity requires blocking (error or critical)
   */
  requiresBlocking(): boolean {
    return this.value === ValidationSeverity.ERROR || this.value === ValidationSeverity.CRITICAL;
  }

  /**
   * Compare severities (higher value = more severe)
   */
  compare(other: ValidationSeverityValueObject): number {
    const severityOrder = {
      [ValidationSeverity.INFO]: 0,
      [ValidationSeverity.WARNING]: 1,
      [ValidationSeverity.ERROR]: 2,
      [ValidationSeverity.CRITICAL]: 3,
    };
    return severityOrder[this.value] - severityOrder[other.value];
  }

  /**
   * Check if this severity is higher than other
   */
  isHigherThan(other: ValidationSeverityValueObject): boolean {
    return this.compare(other) > 0;
  }

  /**
   * Check if this severity is lower than other
   */
  isLowerThan(other: ValidationSeverityValueObject): boolean {
    return this.compare(other) < 0;
  }

  /**
   * Clone the value object
   */
  clone(): ValidationSeverityValueObject {
    return new ValidationSeverityValueObject(this.value);
  }

  /**
   * Convert to string
   */
  toString(): string {
    return this.value;
  }

  /**
   * Check if two severities are equal
   */
  equals(other: ValidationSeverityValueObject): boolean {
    return this.value === other.value;
  }
}
