/**
 * Transport Configuration Validator
 */

import { TransportDEFAULTS, TransportLIMITS, TransportSTRATEGIES } from '../defaults/TransportDefaults';

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export class TransportConfigurationValidator {
  validate(config: Record<string, unknown>): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (typeof config.enabled !== 'boolean') {
      errors.push('enabled must be a boolean');
    }

    const timeout = config.timeout as number;
    if (typeof timeout !== 'number' || timeout < TransportLIMITS.minTimeout || timeout > TransportLIMITS.maxTimeout) {
      errors.push('timeout must be between ' + TransportLIMITS.minTimeout + ' and ' + TransportLIMITS.maxTimeout);
    }

    const retries = config.retries as number;
    if (typeof retries !== 'number' || retries < TransportLIMITS.minRetries || retries > TransportLIMITS.maxRetries) {
      errors.push('retries must be between ' + TransportLIMITS.minRetries + ' and ' + TransportLIMITS.maxRetries);
    }

    const strategy = config.strategy as string;
    if (typeof strategy === 'string' && (TransportSTRATEGIES as readonly string[]).indexOf(strategy) < 0) {
      errors.push('strategy must be one of: ' + TransportSTRATEGIES.join(', '));
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
      throw new Error('Invalid transport configuration: ' + result.errors.join('; '));
    }
  }

  getDefaults(): typeof TransportDEFAULTS {
    return TransportDEFAULTS;
  }
}
