/**
 * Network Configuration Validator
 */

import { NetworkDEFAULTS, NetworkLIMITS, NetworkSTRATEGIES } from '../defaults/NetworkDefaults';

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export class NetworkConfigurationValidator {
  validate(config: Record<string, unknown>): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (typeof config.enabled !== 'boolean') {
      errors.push('enabled must be a boolean');
    }

    const timeout = config.timeout as number;
    if (typeof timeout !== 'number' || timeout < NetworkLIMITS.minTimeout || timeout > NetworkLIMITS.maxTimeout) {
      errors.push('timeout must be between ' + NetworkLIMITS.minTimeout + ' and ' + NetworkLIMITS.maxTimeout);
    }

    const retries = config.retries as number;
    if (typeof retries !== 'number' || retries < NetworkLIMITS.minRetries || retries > NetworkLIMITS.maxRetries) {
      errors.push('retries must be between ' + NetworkLIMITS.minRetries + ' and ' + NetworkLIMITS.maxRetries);
    }

    const strategy = config.strategy as string;
    if (typeof strategy === 'string' && (NetworkSTRATEGIES as readonly string[]).indexOf(strategy) < 0) {
      errors.push('strategy must be one of: ' + NetworkSTRATEGIES.join(', '));
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
      throw new Error('Invalid network configuration: ' + result.errors.join('; '));
    }
  }

  getDefaults(): typeof NetworkDEFAULTS {
    return NetworkDEFAULTS;
  }
}
