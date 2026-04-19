/**
 * ConfigValidator - Configuration
 * 
 * Validates event bus configuration.
 * Ensures configuration values are within acceptable ranges.
 */

import { EventBusConfig, EventBusConfigOptions } from './EventBusConfig';

export interface ValidationError {
  field: string;
  message: string;
  value: unknown;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationError[];
}

export class ConfigValidator {
  private _rules: ValidationRule[];

  constructor() {
    this._rules = [];
    this._addDefaultRules();
  }

  validate(config: EventBusConfig | EventBusConfigOptions): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationError[] = [];

    for (const rule of this._rules) {
      const result = rule.validate(config);
      if (!result.valid) {
        if (rule.severity === 'error') {
          errors.push({
            field: rule.field,
            message: result.message || rule.defaultMessage,
            value: (config as any)[rule.field],
          });
        } else {
          warnings.push({
            field: rule.field,
            message: result.message || rule.defaultMessage,
            value: (config as any)[rule.field],
          });
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  addRule(rule: ValidationRule): void {
    this._rules.push(rule);
  }

  removeRule(fieldName: string): boolean {
    const index = this._rules.findIndex(r => r.field === fieldName);
    if (index !== -1) {
      this._rules.splice(index, 1);
      return true;
    }
    return false;
  }

  private _addDefaultRules(): void {
    this._rules.push({
      field: 'maxQueueSize',
      severity: 'error',
      validate: (config) => {
        const value = (config as any).maxQueueSize;
        return value > 0 && value <= 100000;
      },
      defaultMessage: 'maxQueueSize must be between 1 and 100000',
    });

    this._rules.push({
      field: 'maxSubscriptions',
      severity: 'error',
      validate: (config) => {
        const value = (config as any).maxSubscriptions;
        return value > 0 && value <= 1000000;
      },
      defaultMessage: 'maxSubscriptions must be between 1 and 1000000',
    });

    this._rules.push({
      field: 'timeout',
      severity: 'error',
      validate: (config) => {
        const value = (config as any).timeout;
        return value > 0 && value <= 60000;
      },
      defaultMessage: 'timeout must be between 1 and 60000ms',
    });

    this._rules.push({
      field: 'maxRetries',
      severity: 'error',
      validate: (config) => {
        const value = (config as any).maxRetries;
        return value >= 0 && value <= 10;
      },
      defaultMessage: 'maxRetries must be between 0 and 10',
    });

    this._rules.push({
      field: 'logLevel',
      severity: 'error',
      validate: (config) => {
        const value = (config as any).logLevel;
        const validLevels = ['debug', 'info', 'warn', 'error'];
        return validLevels.includes(value);
      },
      defaultMessage: 'logLevel must be one of: debug, info, warn, error',
    });

    this._rules.push({
      field: 'serializationFormat',
      severity: 'error',
      validate: (config) => {
        const value = (config as any).serializationFormat;
        const validFormats = ['json', 'protobuf', 'msgpack'];
        return validFormats.includes(value);
      },
      defaultMessage: 'serializationFormat must be one of: json, protobuf, msgpack',
    });
  }
}

interface ValidationRule {
  field: string;
  severity: 'error' | 'warning';
  validate: (config: EventBusConfig | EventBusConfigOptions) => boolean;
  defaultMessage: string;
}

interface RuleResult {
  valid: boolean;
  message?: string;
}
