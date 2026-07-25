/**
 * Proxy Configuration Validator
 */

import { ProxyDEFAULTS, ProxyLIMITS, ProxySTRATEGIES } from '../defaults/ProxyDefaults';

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export class ProxyConfigurationValidator {
  validate(config: Record<string, unknown>): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (typeof config.enabled !== 'boolean') {
      errors.push('enabled must be a boolean');
    }

    const timeout = config.timeout as number;
    if (typeof timeout !== 'number' || timeout < ProxyLIMITS.minTimeout || timeout > ProxyLIMITS.maxTimeout) {
      errors.push('timeout must be between ' + ProxyLIMITS.minTimeout + ' and ' + ProxyLIMITS.maxTimeout);
    }

    const retries = config.retries as number;
    if (typeof retries !== 'number' || retries < ProxyLIMITS.minRetries || retries > ProxyLIMITS.maxRetries) {
      errors.push('retries must be between ' + ProxyLIMITS.minRetries + ' and ' + ProxyLIMITS.maxRetries);
    }

    const strategy = config.strategy as string;
    if (typeof strategy === 'string' && (ProxySTRATEGIES as readonly string[]).indexOf(strategy) < 0) {
      errors.push('strategy must be one of: ' + ProxySTRATEGIES.join(', '));
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
      throw new Error('Invalid proxy configuration: ' + result.errors.join('; '));
    }
  }

  getDefaults(): typeof ProxyDEFAULTS {
    return ProxyDEFAULTS;
  }
}
