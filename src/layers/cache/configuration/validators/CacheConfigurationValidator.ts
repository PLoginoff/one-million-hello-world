/**
 * Cache Configuration Validator
 */

import { CacheDEFAULTS, CacheLIMITS, CacheSTRATEGIES } from '../defaults/CacheDefaults';

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export class CacheConfigurationValidator {
  validate(config: Record<string, unknown>): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (typeof config.enabled !== 'boolean') {
      errors.push('enabled must be a boolean');
    }

    const timeout = config.timeout as number;
    if (typeof timeout !== 'number' || timeout < CacheLIMITS.minTimeout || timeout > CacheLIMITS.maxTimeout) {
      errors.push('timeout must be between ' + CacheLIMITS.minTimeout + ' and ' + CacheLIMITS.maxTimeout);
    }

    const retries = config.retries as number;
    if (typeof retries !== 'number' || retries < CacheLIMITS.minRetries || retries > CacheLIMITS.maxRetries) {
      errors.push('retries must be between ' + CacheLIMITS.minRetries + ' and ' + CacheLIMITS.maxRetries);
    }

    const strategy = config.strategy as string;
    if (typeof strategy === 'string' && (CacheSTRATEGIES as readonly string[]).indexOf(strategy) < 0) {
      errors.push('strategy must be one of: ' + CacheSTRATEGIES.join(', '));
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
      throw new Error('Invalid cache configuration: ' + result.errors.join('; '));
    }
  }

  getDefaults(): typeof CacheDEFAULTS {
    return CacheDEFAULTS;
  }
}
