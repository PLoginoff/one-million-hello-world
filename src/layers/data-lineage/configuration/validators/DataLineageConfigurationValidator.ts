/**
 * DataLineage Configuration Validator
 */

import { DataLineageDEFAULTS, DataLineageLIMITS, DataLineageSTRATEGIES } from '../defaults/DataLineageDefaults';

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export class DataLineageConfigurationValidator {
  validate(config: Record<string, unknown>): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (typeof config.enabled !== 'boolean') {
      errors.push('enabled must be a boolean');
    }

    const timeout = config.timeout as number;
    if (
      typeof timeout !== 'number' ||
      timeout < DataLineageLIMITS.minTimeout ||
      timeout > DataLineageLIMITS.maxTimeout
    ) {
      errors.push('timeout must be between ' + DataLineageLIMITS.minTimeout + ' and ' + DataLineageLIMITS.maxTimeout);
    }

    const retries = config.retries as number;
    if (
      typeof retries !== 'number' ||
      retries < DataLineageLIMITS.minRetries ||
      retries > DataLineageLIMITS.maxRetries
    ) {
      errors.push('retries must be between ' + DataLineageLIMITS.minRetries + ' and ' + DataLineageLIMITS.maxRetries);
    }

    const strategy = config.strategy as string;
    if (typeof strategy === 'string' && (DataLineageSTRATEGIES as readonly string[]).indexOf(strategy) < 0) {
      errors.push('strategy must be one of: ' + DataLineageSTRATEGIES.join(', '));
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
      throw new Error('Invalid data-lineage configuration: ' + result.errors.join('; '));
    }
  }

  getDefaults(): typeof DataLineageDEFAULTS {
    return DataLineageDEFAULTS;
  }
}
