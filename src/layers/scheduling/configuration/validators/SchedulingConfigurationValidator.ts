/**
 * Scheduling Configuration Validator
 */

import { SchedulingDEFAULTS, SchedulingLIMITS, SchedulingSTRATEGIES } from '../defaults/SchedulingDefaults';

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export class SchedulingConfigurationValidator {
  validate(config: Record<string, unknown>): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (typeof config.enabled !== 'boolean') {
      errors.push('enabled must be a boolean');
    }

    const timeout = config.timeout as number;
    if (typeof timeout !== 'number' || timeout < SchedulingLIMITS.minTimeout || timeout > SchedulingLIMITS.maxTimeout) {
      errors.push('timeout must be between ' + SchedulingLIMITS.minTimeout + ' and ' + SchedulingLIMITS.maxTimeout);
    }

    const retries = config.retries as number;
    if (typeof retries !== 'number' || retries < SchedulingLIMITS.minRetries || retries > SchedulingLIMITS.maxRetries) {
      errors.push('retries must be between ' + SchedulingLIMITS.minRetries + ' and ' + SchedulingLIMITS.maxRetries);
    }

    const strategy = config.strategy as string;
    if (typeof strategy === 'string' && (SchedulingSTRATEGIES as readonly string[]).indexOf(strategy) < 0) {
      errors.push('strategy must be one of: ' + SchedulingSTRATEGIES.join(', '));
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
      throw new Error('Invalid scheduling configuration: ' + result.errors.join('; '));
    }
  }

  getDefaults(): typeof SchedulingDEFAULTS {
    return SchedulingDEFAULTS;
  }
}
