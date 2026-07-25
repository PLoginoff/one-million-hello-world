/**
 * Domain Configuration Validator
 */

import { DomainDEFAULTS, DomainLIMITS, DomainSTRATEGIES } from '../defaults/DomainDefaults';

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export class DomainConfigurationValidator {
  validate(config: Record<string, unknown>): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (typeof config.enabled !== 'boolean') {
      errors.push('enabled must be a boolean');
    }

    const timeout = config.timeout as number;
    if (typeof timeout !== 'number' || timeout < DomainLIMITS.minTimeout || timeout > DomainLIMITS.maxTimeout) {
      errors.push('timeout must be between ' + DomainLIMITS.minTimeout + ' and ' + DomainLIMITS.maxTimeout);
    }

    const retries = config.retries as number;
    if (typeof retries !== 'number' || retries < DomainLIMITS.minRetries || retries > DomainLIMITS.maxRetries) {
      errors.push('retries must be between ' + DomainLIMITS.minRetries + ' and ' + DomainLIMITS.maxRetries);
    }

    const strategy = config.strategy as string;
    if (typeof strategy === 'string' && (DomainSTRATEGIES as readonly string[]).indexOf(strategy) < 0) {
      errors.push('strategy must be one of: ' + DomainSTRATEGIES.join(', '));
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
      throw new Error('Invalid domain configuration: ' + result.errors.join('; '));
    }
  }

  getDefaults(): typeof DomainDEFAULTS {
    return DomainDEFAULTS;
  }
}
