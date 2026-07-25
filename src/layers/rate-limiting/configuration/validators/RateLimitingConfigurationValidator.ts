/**
 * RateLimiting Configuration Validator
 */

import { RateLimitingDEFAULTS, RateLimitingLIMITS, RateLimitingSTRATEGIES } from '../defaults/RateLimitingDefaults';

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export class RateLimitingConfigurationValidator {
  validate(config: Record<string, unknown>): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (typeof config.enabled !== 'boolean') {
      errors.push('enabled must be a boolean');
    }

    const timeout = config.timeout as number;
    if (
      typeof timeout !== 'number' ||
      timeout < RateLimitingLIMITS.minTimeout ||
      timeout > RateLimitingLIMITS.maxTimeout
    ) {
      errors.push('timeout must be between ' + RateLimitingLIMITS.minTimeout + ' and ' + RateLimitingLIMITS.maxTimeout);
    }

    const retries = config.retries as number;
    if (
      typeof retries !== 'number' ||
      retries < RateLimitingLIMITS.minRetries ||
      retries > RateLimitingLIMITS.maxRetries
    ) {
      errors.push('retries must be between ' + RateLimitingLIMITS.minRetries + ' and ' + RateLimitingLIMITS.maxRetries);
    }

    const strategy = config.strategy as string;
    if (typeof strategy === 'string' && (RateLimitingSTRATEGIES as readonly string[]).indexOf(strategy) < 0) {
      errors.push('strategy must be one of: ' + RateLimitingSTRATEGIES.join(', '));
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
      throw new Error('Invalid rate-limiting configuration: ' + result.errors.join('; '));
    }
  }

  getDefaults(): typeof RateLimitingDEFAULTS {
    return RateLimitingDEFAULTS;
  }
}
