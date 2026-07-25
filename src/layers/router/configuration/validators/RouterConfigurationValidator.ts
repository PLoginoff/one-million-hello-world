/**
 * Router Configuration Validator
 */

import { RouterDEFAULTS, RouterLIMITS, RouterSTRATEGIES } from '../defaults/RouterDefaults';

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export class RouterConfigurationValidator {
  validate(config: Record<string, unknown>): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (typeof config.enabled !== 'boolean') {
      errors.push('enabled must be a boolean');
    }

    const timeout = config.timeout as number;
    if (typeof timeout !== 'number' || timeout < RouterLIMITS.minTimeout || timeout > RouterLIMITS.maxTimeout) {
      errors.push('timeout must be between ' + RouterLIMITS.minTimeout + ' and ' + RouterLIMITS.maxTimeout);
    }

    const retries = config.retries as number;
    if (typeof retries !== 'number' || retries < RouterLIMITS.minRetries || retries > RouterLIMITS.maxRetries) {
      errors.push('retries must be between ' + RouterLIMITS.minRetries + ' and ' + RouterLIMITS.maxRetries);
    }

    const strategy = config.strategy as string;
    if (typeof strategy === 'string' && (RouterSTRATEGIES as readonly string[]).indexOf(strategy) < 0) {
      errors.push('strategy must be one of: ' + RouterSTRATEGIES.join(', '));
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
      throw new Error('Invalid router configuration: ' + result.errors.join('; '));
    }
  }

  getDefaults(): typeof RouterDEFAULTS {
    return RouterDEFAULTS;
  }
}
