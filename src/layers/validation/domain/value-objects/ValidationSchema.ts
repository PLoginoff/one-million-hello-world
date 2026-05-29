/**
 * Validation Schema Value Object
 *
 * Represents validation schema for complex data structures.
 * Immutable value object for managing validation schemas.
 */

export interface ValidationSchemaData {
  schemaId: string;
  name: string;
  description: string;
  rules: ValidationRuleData[];
  strictMode: boolean;
  stopOnFirstError: boolean;
}

export interface ValidationRuleData {
  ruleId: string;
  name: string;
  description: string;
  fieldType: 'string' | 'number' | 'boolean' | 'date' | 'email' | 'url' | 'uuid' | 'custom';
  constraints: any[];
  severity: 'error' | 'warning' | 'info';
  enabled: boolean;
}

export class ValidationSchema {
  readonly data: ValidationSchemaData;

  constructor(data: ValidationSchemaData) {
    this._validateSchema(data);
    this.data = { ...data, rules: [...data.rules] };
  }

  /**
   * Get schema ID
   */
  getSchemaId(): string {
    return this.data.schemaId;
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
   * Get rules
   */
  getRules(): ValidationRuleData[] {
    return [...this.data.rules];
  }

  /**
   * Get rule by ID
   */
  getRuleById(ruleId: string): ValidationRuleData | undefined {
    return this.data.rules.find((r) => r.ruleId === ruleId);
  }

  /**
   * Get enabled rules
   */
  getEnabledRules(): ValidationRuleData[] {
    return this.data.rules.filter((r) => r.enabled);
  }

  /**
   * Check if strict mode
   */
  isStrictMode(): boolean {
    return this.data.strictMode;
  }

  /**
   * Check if stop on first error
   */
  shouldStopOnFirstError(): boolean {
    return this.data.stopOnFirstError;
  }

  /**
   * Validate data against schema
   */
  validate(data: Record<string, unknown>): { isValid: boolean; errors: any[]; warnings: any[] } {
    const errors: any[] = [];
    const warnings: any[] = [];

    for (const rule of this.data.rules) {
      if (!rule.enabled) {
        continue;
      }

      const value = data[rule.name];
      const result = this._validateRule(rule, value);

      if (!result.isValid) {
        errors.push(...result.errors);
        if (this.data.stopOnFirstError) {
          break;
        }
      }

      warnings.push(...result.warnings);
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Add rule
   */
  addRule(rule: ValidationRuleData): ValidationSchema {
    return new ValidationSchema({
      ...this.data,
      rules: [...this.data.rules, rule],
    });
  }

  /**
   * Remove rule
   */
  removeRule(ruleId: string): ValidationSchema {
    return new ValidationSchema({
      ...this.data,
      rules: this.data.rules.filter((r) => r.ruleId !== ruleId),
    });
  }

  /**
   * Create a copy with updated values
   */
  withUpdates(updates: Partial<ValidationSchemaData>): ValidationSchema {
    return new ValidationSchema({ ...this.data, ...updates });
  }

  /**
   * Enable strict mode
   */
  enableStrictMode(): ValidationSchema {
    return this.withUpdates({ strictMode: true });
  }

  /**
   * Disable strict mode
   */
  disableStrictMode(): ValidationSchema {
    return this.withUpdates({ strictMode: false });
  }

  /**
   * Create a copy
   */
  clone(): ValidationSchema {
    return new ValidationSchema({ ...this.data, rules: [...this.data.rules] });
  }

  /**
   * Create empty schema
   */
  static createEmpty(schemaId: string, name: string): ValidationSchema {
    return new ValidationSchema({
      schemaId,
      name,
      description: '',
      rules: [],
      strictMode: false,
      stopOnFirstError: false,
    });
  }

  private _validateRule(rule: ValidationRuleData, value: unknown): { isValid: boolean; errors: any[]; warnings: any[] } {
    const errors: any[] = [];
    const warnings: any[] = [];

    for (const constraint of rule.constraints) {
      const result = this._validateConstraint(constraint, value);
      if (!result.isValid) {
        errors.push({
          field: rule.name,
          message: result.message || `Validation failed for ${constraint.type}`,
          code: `${constraint.type.toUpperCase()}_VALIDATION_FAILED`,
          severity: rule.severity,
        });
      }
    }

    return { isValid: errors.length === 0, errors, warnings };
  }

  private _validateConstraint(constraint: any, value: unknown): { isValid: boolean; message?: string } {
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
      default:
        return { isValid: true };
    }

    return { isValid: true };
  }

  private _validateSchema(data: ValidationSchemaData): void {
    if (!data.schemaId || data.schemaId.trim().length === 0) {
      throw new Error('Schema ID is required');
    }

    if (!data.name || data.name.trim().length === 0) {
      throw new Error('Schema name is required');
    }

    const ruleIds = data.rules.map((r) => r.ruleId);
    const uniqueIds = new Set(ruleIds);
    if (uniqueIds.size !== ruleIds.length) {
      throw new Error('Rule IDs must be unique');
    }
  }
}
