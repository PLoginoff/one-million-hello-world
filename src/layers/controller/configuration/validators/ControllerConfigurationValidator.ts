/**
 * Controller Configuration Validator
 */

import { ControllerDEFAULTS, ControllerLIMITS, ControllerSTRATEGIES } from '../defaults/ControllerDefaults';

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export class ControllerConfigurationValidator {
  validate(config: Record<string, unknown>): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (typeof config.enabled !== 'boolean') {
      errors.push('enabled must be a boolean');
    }

    const timeout = config.timeout as number;
    if (typeof timeout !== 'number' || timeout < ControllerLIMITS.minTimeout || timeout > ControllerLIMITS.maxTimeout) {
      errors.push('timeout must be between ' + ControllerLIMITS.minTimeout + ' and ' + ControllerLIMITS.maxTimeout);
    }

    const retries = config.retries as number;
    if (typeof retries !== 'number' || retries < ControllerLIMITS.minRetries || retries > ControllerLIMITS.maxRetries) {
      errors.push('retries must be between ' + ControllerLIMITS.minRetries + ' and ' + ControllerLIMITS.maxRetries);
    }

    const strategy = config.strategy as string;
    if (typeof strategy === 'string' && (ControllerSTRATEGIES as readonly string[]).indexOf(strategy) < 0) {
      errors.push('strategy must be one of: ' + ControllerSTRATEGIES.join(', '));
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
      throw new Error('Invalid controller configuration: ' + result.errors.join('; '));
    }
  }

  getDefaults(): typeof ControllerDEFAULTS {
    return ControllerDEFAULTS;
  }
}
