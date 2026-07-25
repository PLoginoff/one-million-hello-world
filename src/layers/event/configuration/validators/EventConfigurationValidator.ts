/**
 * Event Configuration Validator
 */

import { EventDEFAULTS, EventLIMITS, EventSTRATEGIES } from '../defaults/EventDefaults';

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export class EventConfigurationValidator {
  validate(config: Record<string, unknown>): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (typeof config.enabled !== 'boolean') {
      errors.push('enabled must be a boolean');
    }

    const timeout = config.timeout as number;
    if (typeof timeout !== 'number' || timeout < EventLIMITS.minTimeout || timeout > EventLIMITS.maxTimeout) {
      errors.push('timeout must be between ' + EventLIMITS.minTimeout + ' and ' + EventLIMITS.maxTimeout);
    }

    const retries = config.retries as number;
    if (typeof retries !== 'number' || retries < EventLIMITS.minRetries || retries > EventLIMITS.maxRetries) {
      errors.push('retries must be between ' + EventLIMITS.minRetries + ' and ' + EventLIMITS.maxRetries);
    }

    const strategy = config.strategy as string;
    if (typeof strategy === 'string' && (EventSTRATEGIES as readonly string[]).indexOf(strategy) < 0) {
      errors.push('strategy must be one of: ' + EventSTRATEGIES.join(', '));
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
      throw new Error('Invalid event configuration: ' + result.errors.join('; '));
    }
  }

  getDefaults(): typeof EventDEFAULTS {
    return EventDEFAULTS;
  }
}
