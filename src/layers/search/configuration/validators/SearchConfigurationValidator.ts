/**
 * Search Configuration Validator
 */

import { SearchDEFAULTS, SearchLIMITS, SearchSTRATEGIES } from '../defaults/SearchDefaults';

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export class SearchConfigurationValidator {
  validate(config: Record<string, unknown>): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (typeof config.enabled !== 'boolean') {
      errors.push('enabled must be a boolean');
    }

    const timeout = config.timeout as number;
    if (typeof timeout !== 'number' || timeout < SearchLIMITS.minTimeout || timeout > SearchLIMITS.maxTimeout) {
      errors.push('timeout must be between ' + SearchLIMITS.minTimeout + ' and ' + SearchLIMITS.maxTimeout);
    }

    const retries = config.retries as number;
    if (typeof retries !== 'number' || retries < SearchLIMITS.minRetries || retries > SearchLIMITS.maxRetries) {
      errors.push('retries must be between ' + SearchLIMITS.minRetries + ' and ' + SearchLIMITS.maxRetries);
    }

    const strategy = config.strategy as string;
    if (typeof strategy === 'string' && (SearchSTRATEGIES as readonly string[]).indexOf(strategy) < 0) {
      errors.push('strategy must be one of: ' + SearchSTRATEGIES.join(', '));
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
      throw new Error('Invalid search configuration: ' + result.errors.join('; '));
    }
  }

  getDefaults(): typeof SearchDEFAULTS {
    return SearchDEFAULTS;
  }
}
