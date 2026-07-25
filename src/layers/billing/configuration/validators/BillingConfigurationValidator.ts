/**
 * Billing Configuration Validator
 */

import { BillingDEFAULTS, BillingLIMITS, BillingSTRATEGIES } from '../defaults/BillingDefaults';

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export class BillingConfigurationValidator {
  validate(config: Record<string, unknown>): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (typeof config.enabled !== 'boolean') {
      errors.push('enabled must be a boolean');
    }

    const timeout = config.timeout as number;
    if (typeof timeout !== 'number' || timeout < BillingLIMITS.minTimeout || timeout > BillingLIMITS.maxTimeout) {
      errors.push('timeout must be between ' + BillingLIMITS.minTimeout + ' and ' + BillingLIMITS.maxTimeout);
    }

    const retries = config.retries as number;
    if (typeof retries !== 'number' || retries < BillingLIMITS.minRetries || retries > BillingLIMITS.maxRetries) {
      errors.push('retries must be between ' + BillingLIMITS.minRetries + ' and ' + BillingLIMITS.maxRetries);
    }

    const strategy = config.strategy as string;
    if (typeof strategy === 'string' && (BillingSTRATEGIES as readonly string[]).indexOf(strategy) < 0) {
      errors.push('strategy must be one of: ' + BillingSTRATEGIES.join(', '));
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
      throw new Error('Invalid billing configuration: ' + result.errors.join('; '));
    }
  }

  getDefaults(): typeof BillingDEFAULTS {
    return BillingDEFAULTS;
  }
}
