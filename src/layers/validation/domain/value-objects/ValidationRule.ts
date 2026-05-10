/**
 * Validation Rule Value Object
 *
 * Represents validation rules for data validation.
 * Immutable value object for managing validation rules.
 */

export interface ValidationRuleData {
  ruleId: string;
  name: string;
  description: string;
  fieldType: FieldType;
  constraints: ValidationConstraint[];
  severity: RuleSeverity;
  enabled: boolean;
}

export type FieldType = 'string' | 'number' | 'boolean' | 'date' | 'email' | 'url' | 'uuid' | 'custom';

export interface ValidationConstraint {
  type: ConstraintType;
  value?: unknown;
  message?: string;
}

export type ConstraintType = 'required' | 'min' | 'max' | 'minLength' | 'maxLength' | 'pattern' | 'custom' | 'enum';

export type RuleSeverity = 'error' | 'warning' | 'info';

export interface RuleValidationError {
  field: string;
  message: string;
  code: string;
  severity: 'error' | 'critical';
}

export interface RuleValidationWarning {
  field: string;
  message: string;
  code: string;
  severity: 'warning' | 'info';
}

export class ValidationRule {
  readonly data: ValidationRuleData;

  constructor(data: ValidationRuleData) {
    this._validateRule(data);
    this.data = { ...data, constraints: [...data.constraints] };
  }

  /**
   * Get rule ID
   */
  getRuleId(): string {
    return this.data.ruleId;
  }

  /**
   * Get name
   */
  getName(): string {
    return this.data.name;
  }

  /**
   * Get description
   */
  getDescription(): string {
    return this.data.description;
  }

  /**
   * Get field type
   */
  getFieldType(): FieldType {
    return this.data.fieldType;
  }

  /**
   * Get constraints
   */
  getConstraints(): ValidationConstraint[] {
    return [...this.data.constraints];
  }

  /**
   * Get severity
   */
  getSeverity(): RuleSeverity {
    return this.data.severity;
  }

  /**
   * Check if enabled
   */
  isEnabled(): boolean {
    return this.data.enabled;
  }

  /**
   * Get constraint by type
   */
  getConstraintByType(type: ConstraintType): ValidationConstraint | undefined {
    return this.data.constraints.find((c) => c.type === type);
  }

  /**
   * Check if has constraint
   */
  hasConstraint(type: ConstraintType): boolean {
    return this.data.constraints.some((c) => c.type === type);
  }

  /**
   * Check if required
   */
  isRequired(): boolean {
    return this.hasConstraint('required');
  }

  /**
   * Validate value against rule
   */
  validate(value: unknown): { isValid: boolean; errors: RuleValidationError[]; warnings: RuleValidationWarning[] } {
    const errors: RuleValidationError[] = [];
    const warnings: RuleValidationWarning[] = [];

    if (!this.data.enabled) {
      return { isValid: true, errors, warnings };
    }

    for (const constraint of this.data.constraints) {
      const result = this._validateConstraint(constraint, value);
      if (!result.isValid) {
        const error: RuleValidationError = {
          field: this.data.name,
          message: result.message || `Validation failed for ${constraint.type}`,
          code: `${constraint.type.toUpperCase()}_VALIDATION_FAILED`,
          severity: this.data.severity === 'error' || this.data.severity === 'warning' ? 'error' : 'critical',
        };
        errors.push(error);
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Create a copy with updated values
   */
  withUpdates(updates: Partial<ValidationRuleData>): ValidationRule {
    return new ValidationRule({ ...this.data, ...updates });
  }

  /**
   * Enable rule
   */
  enable(): ValidationRule {
    return this.withUpdates({ enabled: true });
  }

  /**
   * Disable rule
   */
  disable(): ValidationRule {
    return this.withUpdates({ enabled: false });
  }

  /**
   * Create a copy
   */
  clone(): ValidationRule {
    return new ValidationRule({ ...this.data, constraints: [...this.data.constraints] });
  }

  /**
   * Create required rule
   */
  static createRequired(fieldName: string): ValidationRule {
    return new ValidationRule({
      ruleId: `required-${fieldName}`,
      name: fieldName,
      description: 'Required field validation',
      fieldType: 'string',
      constraints: [{ type: 'required' }],
      severity: 'error',
      enabled: true,
    });
  }

  /**
   * Create email rule
   */
  static createEmail(fieldName: string): ValidationRule {
    return new ValidationRule({
      ruleId: `email-${fieldName}`,
      name: fieldName,
      description: 'Email validation',
      fieldType: 'email',
      constraints: [{ type: 'pattern', value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/ }],
      severity: 'error',
      enabled: true,
    });
  }

  private _validateConstraint(constraint: ValidationConstraint, value: unknown): { isValid: boolean; message?: string } {
    switch (constraint.type) {
      case 'required':
        if (value === null || value === undefined || value === '') {
          return { isValid: false, message: constraint.message || 'Field is required' };
        }
        break;
      case 'min':
        if (typeof value === 'number' && typeof constraint.value === 'number' && value < constraint.value) {
          return { isValid: false, message: constraint.message || `Value must be at least ${constraint.value}` };
        }
        break;
      case 'max':
        if (typeof value === 'number' && typeof constraint.value === 'number' && value > constraint.value) {
          return { isValid: false, message: constraint.message || `Value must be at most ${constraint.value}` };
        }
        break;
      case 'minLength':
        if (typeof value === 'string' && typeof constraint.value === 'number' && value.length < constraint.value) {
          return { isValid: false, message: constraint.message || `Length must be at least ${constraint.value}` };
        }
        break;
      case 'maxLength':
        if (typeof value === 'string' && typeof constraint.value === 'number' && value.length > constraint.value) {
          return { isValid: false, message: constraint.message || `Length must be at most ${constraint.value}` };
        }
        break;
      case 'pattern':
        if (typeof value === 'string' && constraint.value instanceof RegExp && !constraint.value.test(value)) {
          return { isValid: false, message: constraint.message || 'Value does not match pattern' };
        }
        break;
      default:
        return { isValid: true };
    }

    return { isValid: true };
  }

  private _validateRule(data: ValidationRuleData): void {
    if (!data.ruleId || data.ruleId.trim().length === 0) {
      throw new Error('Rule ID is required');
    }

    if (!data.name || data.name.trim().length === 0) {
      throw new Error('Rule name is required');
    }

    if (data.constraints.length === 0) {
      throw new Error('At least one constraint is required');
    }
  }
}
