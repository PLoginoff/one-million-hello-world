/**
 * Validation Engine Implementation
 * 
 * Concrete implementation of IValidationEngine.
 * Handles data validation and business rules.
 */

import { IValidationEngine } from '../interfaces/IValidationEngine';
import {
  ValidationRule,
  ValidationResult,
  ValidationContext,
  ValidationConfig,
  ValidationStats,
  SchemaDefinition,
  FieldDefinition,
  ValidationSeverity,
  FieldType,
} from '../types/validation-types';

export class ValidationEngine implements IValidationEngine {
  private _rules: ValidationRule[];
  private _customValidators: Map<string, (value: unknown) => boolean>;
  private _config: ValidationConfig;
  private _stats: ValidationStats;

  constructor(config?: Partial<ValidationConfig>) {
    this._rules = [];
    this._customValidators = new Map();
    this._config = {
      enabled: true,
      failFast: false,
      enableWarnings: true,
      customValidators: new Map(),
      ...config,
    };
    this._stats = {
      totalValidations: 0,
      successfulValidations: 0,
      failedValidations: 0,
      averageExecutionTime: 0,
      ruleExecutionCounts: new Map(),
    };
  }

  validate(entity: Record<string, unknown>, rules: ValidationRule[]): ValidationResult {
    const startTime = Date.now();
    this._stats.totalValidations++;

    if (!this._config.enabled) {
      return { valid: true, errors: [], warnings: [] };
    }

    const errors: Array<{ code: string; message: string; field: string; value: unknown; rule: string; severity: ValidationSeverity }> = [];
    const warnings: Array<{ code: string; message: string; field: string; value: unknown; rule: string }> = [];

    for (const rule of rules) {
      const context = this.createContext(rule.field, entity);
      const result = this.validateField(entity[rule.field], rule, context);

      if (!result.valid) {
        if (rule.severity === ValidationSeverity.ERROR) {
          errors.push(...result.errors);
          if (this._config.failFast) {
            break;
          }
        } else if (this._config.enableWarnings) {
          warnings.push(...result.warnings);
        }
      }
    }

    const executionTime = Date.now() - startTime;
    this._updateAverageExecutionTime(executionTime);

    if (errors.length === 0) {
      this._stats.successfulValidations++;
    } else {
      this._stats.failedValidations++;
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  validateField(value: unknown, rule: ValidationRule, context?: ValidationContext): ValidationResult {
    const errors: Array<{ code: string; message: string; field: string; value: unknown; rule: string; severity: ValidationSeverity }> = [];
    const warnings: Array<{ code: string; message: string; field: string; value: unknown; rule: string }> = [];

    try {
      const result = rule.validator(value, context || this.createContext(rule.field, {}));

      if (!result) {
        if (rule.severity === ValidationSeverity.ERROR) {
          errors.push({
            code: 'VALIDATION_FAILED',
            message: rule.errorMessage,
            field: rule.field,
            value,
            rule: rule.name,
            severity: rule.severity,
          });
        } else {
          warnings.push({
            code: 'VALIDATION_WARNING',
            message: rule.errorMessage,
            field: rule.field,
            value,
            rule: rule.name,
          });
        }
      }

      this._incrementRuleExecutionCount(rule.name);
    } catch (error) {
      errors.push({
        code: 'VALIDATION_ERROR',
        message: error instanceof Error ? error.message : 'Unknown validation error',
        field: rule.field,
        value,
        rule: rule.name,
        severity: ValidationSeverity.ERROR,
      });
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  validateSchema(entity: Record<string, unknown>, schema: SchemaDefinition): ValidationResult {
    const allRules = [...schema.globalRules];

    for (const field of schema.fields) {
      allRules.push(...field.rules);
    }

    return this.validate(entity, allRules);
  }

  registerValidator(name: string, validator: (value: unknown) => boolean): void {
    this._customValidators.set(name, validator);
    this._config.customValidators.set(name, validator);
  }

  registerValidatorFunction(name: string, validator: (value: unknown, context: ValidationContext) => ValidationResult): void {
    this._customValidators.set(name, (value: unknown) => {
      const result = validator(value, this.createContext(name, {}));
      return result.valid;
    });
  }

  unregisterValidator(name: string): void {
    this._customValidators.delete(name);
    this._config.customValidators.delete(name);
  }

  getValidator(name: string): ((value: unknown) => boolean) | undefined {
    return this._customValidators.get(name);
  }

  addRule(rule: ValidationRule): void {
    this._rules.push(rule);
  }

  removeRule(ruleName: string): void {
    this._rules = this._rules.filter((r) => r.name !== ruleName);
  }

  getRules(): ValidationRule[] {
    return [...this._rules];
  }

  getRulesForField(field: string): ValidationRule[] {
    return this._rules.filter((r) => r.field === field);
  }

  setConfig(config: Partial<ValidationConfig>): void {
    this._config = { ...this._config, ...config };
  }

  getConfig(): ValidationConfig {
    return { ...this._config };
  }

  getStats(): ValidationStats {
    return {
      totalValidations: this._stats.totalValidations,
      successfulValidations: this._stats.successfulValidations,
      failedValidations: this._stats.failedValidations,
      averageExecutionTime: this._stats.averageExecutionTime,
      ruleExecutionCounts: new Map(this._stats.ruleExecutionCounts),
    };
  }

  resetStats(): void {
    this._stats = {
      totalValidations: 0,
      successfulValidations: 0,
      failedValidations: 0,
      averageExecutionTime: 0,
      ruleExecutionCounts: new Map(),
    };
  }

  createContext(fieldName: string, entity: Record<string, unknown>, metadata?: Record<string, unknown>): ValidationContext {
    return {
      fieldName,
      entity,
      metadata: metadata || {},
      rules: this._rules,
    };
  }

  validateRequired(entity: Record<string, unknown>, requiredFields: string[]): ValidationResult {
    const errors: Array<{ code: string; message: string; field: string; value: unknown; rule: string; severity: ValidationSeverity }> = [];

    for (const field of requiredFields) {
      if (entity[field] === undefined || entity[field] === null) {
        errors.push({
          code: 'REQUIRED_FIELD_MISSING',
          message: `Field '${field}' is required`,
          field,
          value: entity[field],
          rule: 'required',
          severity: ValidationSeverity.ERROR,
        });
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings: [],
    };
  }

  validateTypes(entity: Record<string, unknown>, fieldTypes: Map<string, string>): ValidationResult {
    const errors: Array<{ code: string; message: string; field: string; value: unknown; rule: string; severity: ValidationSeverity }> = [];

    for (const [field, expectedType] of fieldTypes) {
      const value = entity[field];

      if (value !== undefined && value !== null) {
        const actualType = typeof value;

        if (actualType !== expectedType) {
          errors.push({
            code: 'TYPE_MISMATCH',
            message: `Field '${field}' should be ${expectedType} but is ${actualType}`,
            field,
            value,
            rule: 'type',
            severity: ValidationSeverity.ERROR,
          });
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings: [],
    };
  }

  clearRules(): void {
    this._rules = [];
  }

  clearValidators(): void {
    this._customValidators.clear();
    this._config.customValidators.clear();
  }

  reset(): void {
    this.clearRules();
    this.clearValidators();
    this.resetStats();
    this._config = {
      enabled: true,
      failFast: false,
      enableWarnings: true,
      customValidators: new Map(),
    };
  }

  private _incrementRuleExecutionCount(ruleName: string): void {
    const count = this._stats.ruleExecutionCounts.get(ruleName) || 0;
    this._stats.ruleExecutionCounts.set(ruleName, count + 1);
  }

  private _updateAverageExecutionTime(duration: number): void {
    const total = this._stats.totalValidations;
    if (total > 0) {
      this._stats.averageExecutionTime =
        (this._stats.averageExecutionTime * (total - 1) + duration) / total;
    }
  }
}
