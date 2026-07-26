/**
 * ChaosEngineeringValidationService
 *
 * Service for validating chaos-engineering data.
 */

export interface ValidationIssue {
  field: string;
  message: string;
  severity: 'error' | 'warning';
  code: string;
}

export interface ValidationReport {
  valid: boolean;
  issues: ValidationIssue[];
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
}

export class ChaosEngineeringValidationService {
  private _rules: Array<{ field: string; validate: (value: unknown) => ValidationIssue | null }>;

  constructor() {
    this._rules = [];
  }

  addRule(field: string, validate: (value: unknown) => ValidationIssue | null): void {
    this._rules.push({ field: field, validate: validate });
  }

  addRequiredRule(field: string): void {
    this.addRule(field, function (value: unknown) {
      if (value === null || value === undefined || value === '') {
        return { field: field, message: field + ' is required', severity: 'error', code: 'REQUIRED' };
      }
      return null;
    });
  }

  addTypeRule(field: string, expectedType: string): void {
    this.addRule(field, function (value: unknown) {
      if (value === null || value === undefined) return null;
      const actualType = Array.isArray(value) ? 'array' : typeof value;
      if (actualType !== expectedType) {
        return {
          field: field,
          message: field + ' must be ' + expectedType + ', got ' + actualType,
          severity: 'error',
          code: 'TYPE_MISMATCH',
        };
      }
      return null;
    });
  }

  addRangeRule(field: string, min: number, max: number): void {
    this.addRule(field, function (value: unknown) {
      if (typeof value !== 'number') return null;
      if (value < min || value > max) {
        return {
          field: field,
          message: field + ' must be between ' + min + ' and ' + max,
          severity: 'error',
          code: 'OUT_OF_RANGE',
        };
      }
      return null;
    });
  }

  addLengthRule(field: string, minLength: number, maxLength: number): void {
    this.addRule(field, function (value: unknown) {
      if (typeof value !== 'string') return null;
      if (value.length < minLength || value.length > maxLength) {
        return {
          field: field,
          message: field + ' length must be between ' + minLength + ' and ' + maxLength,
          severity: 'error',
          code: 'LENGTH_INVALID',
        };
      }
      return null;
    });
  }

  validate(data: Record<string, unknown>): ValidationReport {
    const issues: ValidationIssue[] = [];
    for (let i = 0; i < this._rules.length; i++) {
      const rule = this._rules[i];
      const value = data[rule.field];
      const issue = rule.validate(value);
      if (issue) issues.push(issue);
    }
    const errors = issues.filter(function (i) {
      return i.severity === 'error';
    });
    const warnings = issues.filter(function (i) {
      return i.severity === 'warning';
    });
    return { valid: errors.length === 0, issues: issues, errors: errors, warnings: warnings };
  }

  validateOrThrow(data: Record<string, unknown>): void {
    const report = this.validate(data);
    if (!report.valid) {
      const messages = report.errors.map(function (e) {
        return e.field + ': ' + e.message;
      });
      throw new Error('Validation failed: ' + messages.join('; '));
    }
  }

  getRuleCount(): number {
    return this._rules.length;
  }

  clearRules(): void {
    this._rules = [];
  }
}
