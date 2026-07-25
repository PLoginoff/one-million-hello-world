/**
 * Service Configuration Validator
 */

import { ServiceDEFAULTS, ServiceLIMITS, ServiceSTRATEGIES } from '../defaults/ServiceDefaults';

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export class ServiceConfigurationValidator {
  validate(config: Record<string, unknown>): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (typeof config.enabled !== 'boolean') {
      errors.push('enabled must be a boolean');
    }

    const timeout = config.timeout as number;
    if (typeof timeout !== 'number' || timeout < ServiceLIMITS.minTimeout || timeout > ServiceLIMITS.maxTimeout) {
      errors.push('timeout must be between ' + ServiceLIMITS.minTimeout + ' and ' + ServiceLIMITS.maxTimeout);
    }

    const retries = config.retries as number;
    if (typeof retries !== 'number' || retries < ServiceLIMITS.minRetries || retries > ServiceLIMITS.maxRetries) {
      errors.push('retries must be between ' + ServiceLIMITS.minRetries + ' and ' + ServiceLIMITS.maxRetries);
    }

    const strategy = config.strategy as string;
    if (typeof strategy === 'string' && (ServiceSTRATEGIES as readonly string[]).indexOf(strategy) < 0) {
      errors.push('strategy must be one of: ' + ServiceSTRATEGIES.join(', '));
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
      throw new Error('Invalid service configuration: ' + result.errors.join('; '));
    }
  }

  getDefaults(): typeof ServiceDEFAULTS {
    return ServiceDEFAULTS;
  }
}
