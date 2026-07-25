/**
 * MultiTenancy Configuration Validator
 */

import { MultiTenancyDEFAULTS, MultiTenancyLIMITS, MultiTenancySTRATEGIES } from '../defaults/MultiTenancyDefaults';

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export class MultiTenancyConfigurationValidator {
  validate(config: Record<string, unknown>): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (typeof config.enabled !== 'boolean') {
      errors.push('enabled must be a boolean');
    }

    const timeout = config.timeout as number;
    if (
      typeof timeout !== 'number' ||
      timeout < MultiTenancyLIMITS.minTimeout ||
      timeout > MultiTenancyLIMITS.maxTimeout
    ) {
      errors.push('timeout must be between ' + MultiTenancyLIMITS.minTimeout + ' and ' + MultiTenancyLIMITS.maxTimeout);
    }

    const retries = config.retries as number;
    if (
      typeof retries !== 'number' ||
      retries < MultiTenancyLIMITS.minRetries ||
      retries > MultiTenancyLIMITS.maxRetries
    ) {
      errors.push('retries must be between ' + MultiTenancyLIMITS.minRetries + ' and ' + MultiTenancyLIMITS.maxRetries);
    }

    const strategy = config.strategy as string;
    if (typeof strategy === 'string' && (MultiTenancySTRATEGIES as readonly string[]).indexOf(strategy) < 0) {
      errors.push('strategy must be one of: ' + MultiTenancySTRATEGIES.join(', '));
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
      throw new Error('Invalid multi-tenancy configuration: ' + result.errors.join('; '));
    }
  }

  getDefaults(): typeof MultiTenancyDEFAULTS {
    return MultiTenancyDEFAULTS;
  }
}
