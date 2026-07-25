/**
 * Validation Configuration Validator
 */

import { ValidationDEFAULTS, ValidationLIMITS, ValidationSTRATEGIES } from '../defaults/ValidationDefaults';

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export class ValidationConfigurationValidator {
  validate(config: Record<string, unknown>): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (typeof config.enabled !== 'boolean') {
      errors.push('enabled must be a boolean');
    }

    const timeout = config.timeout as number;
    if (typeof timeout !== 'number' || timeout < ValidationLIMITS.minTimeout || timeout > ValidationLIMITS.maxTimeout) {
      errors.push('timeout must be between ' + ValidationLIMITS.minTimeout + ' and ' + ValidationLIMITS.maxTimeout);
    }

    const retries = config.retries as number;
    if (typeof retries !== 'number' || retries < ValidationLIMITS.minRetries || retries > ValidationLIMITS.maxRetries) {
      errors.push('retries must be between ' + ValidationLIMITS.minRetries + ' and ' + ValidationLIMITS.maxRetries);
    }

    const strategy = config.strategy as string;
    if (typeof strategy === 'string' && (ValidationSTRATEGIES as readonly string[]).indexOf(strategy) < 0) {
      errors.push('strategy must be one of: ' + ValidationSTRATEGIES.join(', '));
    }

    const logLevel = config.logLevel as string;
    if (typeof logLevel === 'string' && !['debug', 'info', 'warn', 'error'].includes(logLevel)) {
      warnings.push('logLevel should be one of: debug, info, warn, error');
    }

    return { valid: errors.length === 0, errors: errors, warnings: warnings };
  }

  validateOrThrow(config: Record<string, unknown>): void {
    const result = this.validate(config);
    if (!result.valid) {
      throw new Error('Invalid validation configuration: ' + result.errors.join('; '));
    }
  }

  getDefaults(): typeof ValidationDEFAULTS {
    return ValidationDEFAULTS;
  }
}
