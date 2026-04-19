/**
 * Validation Rule Entity
 * 
 * Represents a validation rule with metadata.
 */

export interface ValidationRuleData {
  id: string;
  name: string;
  type: string;
  required: boolean;
  pattern?: string;
  minLength?: number;
  maxLength?: number;
  min?: number;
  max?: number;
  customValidator?: (value: any) => boolean;
  errorMessage?: string;
  createdAt: number;
}

export class ValidationRuleEntity {
  readonly data: ValidationRuleData;

  private constructor(data: ValidationRuleData) {
    this.data = { ...data };
  }

  /**
   * Create validation rule entity
   */
  static create(data: ValidationRuleData): ValidationRuleEntity {
    return new ValidationRuleEntity(data);
  }

  /**
   * Create simple string validation rule
   */
  static createStringRule(
    id: string,
    name: string,
    required: boolean = false,
    minLength?: number,
    maxLength?: number
  ): ValidationRuleEntity {
    return new ValidationRuleEntity({
      id,
      name,
      type: 'string',
      required,
      minLength,
      maxLength,
      createdAt: Date.now(),
    });
  }

  /**
   * Create number validation rule
   */
  static createNumberRule(
    id: string,
    name: string,
    required: boolean = false,
    min?: number,
    max?: number
  ): ValidationRuleEntity {
    return new ValidationRuleEntity({
      id,
      name,
      type: 'number',
      required,
      min,
      max,
      createdAt: Date.now(),
    });
  }

  /**
   * Create pattern validation rule
   */
  static createPatternRule(
    id: string,
    name: string,
    pattern: string,
    required: boolean = false
  ): ValidationRuleEntity {
    return new ValidationRuleEntity({
      id,
      name,
      type: 'pattern',
      required,
      pattern,
      createdAt: Date.now(),
    });
  }

  /**
   * Create custom validation rule
   */
  static createCustomRule(
    id: string,
    name: string,
    validator: (value: any) => boolean,
    required: boolean = false,
    errorMessage?: string
  ): ValidationRuleEntity {
    return new ValidationRuleEntity({
      id,
      name,
      type: 'custom',
      required,
      customValidator: validator,
      errorMessage,
      createdAt: Date.now(),
    });
  }

  /**
   * Validate value against rule
   */
  validate(value: any): { valid: boolean; error?: string } {
    if (value === undefined || value === null) {
      if (this.data.required) {
        return { valid: false, error: this.data.errorMessage || `${this.data.name} is required` };
      }
      return { valid: true };
    }

    if (this.data.type === 'string' && typeof value !== 'string') {
      return { valid: false, error: this.data.errorMessage || `${this.data.name} must be a string` };
    }

    if (this.data.type === 'number' && typeof value !== 'number') {
      return { valid: false, error: this.data.errorMessage || `${this.data.name} must be a number` };
    }

    if (this.data.minLength !== undefined && typeof value === 'string' && value.length < this.data.minLength) {
      return { valid: false, error: this.data.errorMessage || `${this.data.name} must be at least ${this.data.minLength} characters` };
    }

    if (this.data.maxLength !== undefined && typeof value === 'string' && value.length > this.data.maxLength) {
      return { valid: false, error: this.data.errorMessage || `${this.data.name} must not exceed ${this.data.maxLength} characters` };
    }

    if (this.data.min !== undefined && typeof value === 'number' && value < this.data.min) {
      return { valid: false, error: this.data.errorMessage || `${this.data.name} must be at least ${this.data.min}` };
    }

    if (this.data.max !== undefined && typeof value === 'number' && value > this.data.max) {
      return { valid: false, error: this.data.errorMessage || `${this.data.name} must not exceed ${this.data.max}` };
    }

    if (this.data.pattern && typeof value === 'string') {
      const regex = new RegExp(this.data.pattern);
      if (!regex.test(value)) {
        return { valid: false, error: this.data.errorMessage || `${this.data.name} does not match required pattern` };
      }
    }

    if (this.data.customValidator) {
      if (!this.data.customValidator(value)) {
        return { valid: false, error: this.data.errorMessage || `${this.data.name} is invalid` };
      }
    }

    return { valid: true };
  }

  /**
   * Clone the entity
   */
  clone(): ValidationRuleEntity {
    return new ValidationRuleEntity({ ...this.data });
  }

  /**
   * Convert to plain object
   */
  toObject(): ValidationRuleData {
    return { ...this.data };
  }

  /**
   * Check if two rules are equal
   */
  equals(other: ValidationRuleEntity): boolean {
    return this.data.id === other.data.id;
  }
}
