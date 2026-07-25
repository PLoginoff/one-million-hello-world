/**
 * ApiVersioning Configuration Validator
 */

import { ApiVersioningDEFAULTS, ApiVersioningLIMITS, ApiVersioningSTRATEGIES } from '../defaults/ApiVersioningDefaults';

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export class ApiVersioningConfigurationValidator {
  validate(config: Record<string, unknown>): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (typeof config.enabled !== 'boolean') {
      errors.push('enabled must be a boolean');
    }

    const timeout = config.timeout as number;
    if (
      typeof timeout !== 'number' ||
      timeout < ApiVersioningLIMITS.minTimeout ||
      timeout > ApiVersioningLIMITS.maxTimeout
    ) {
      errors.push(
        'timeout must be between ' + ApiVersioningLIMITS.minTimeout + ' and ' + ApiVersioningLIMITS.maxTimeout
      );
    }

    const retries = config.retries as number;
    if (
      typeof retries !== 'number' ||
      retries < ApiVersioningLIMITS.minRetries ||
      retries > ApiVersioningLIMITS.maxRetries
    ) {
      errors.push(
        'retries must be between ' + ApiVersioningLIMITS.minRetries + ' and ' + ApiVersioningLIMITS.maxRetries
      );
    }

    const strategy = config.strategy as string;
    if (typeof strategy === 'string' && (ApiVersioningSTRATEGIES as readonly string[]).indexOf(strategy) < 0) {
      errors.push('strategy must be one of: ' + ApiVersioningSTRATEGIES.join(', '));
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
      throw new Error('Invalid api-versioning configuration: ' + result.errors.join('; '));
    }
  }

  getDefaults(): typeof ApiVersioningDEFAULTS {
    return ApiVersioningDEFAULTS;
  }
}
