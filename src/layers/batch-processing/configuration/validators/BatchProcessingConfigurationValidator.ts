/**
 * BatchProcessing Configuration Validator
 */

import {
  BatchProcessingDEFAULTS,
  BatchProcessingLIMITS,
  BatchProcessingSTRATEGIES,
} from '../defaults/BatchProcessingDefaults';

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export class BatchProcessingConfigurationValidator {
  validate(config: Record<string, unknown>): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (typeof config.enabled !== 'boolean') {
      errors.push('enabled must be a boolean');
    }

    const timeout = config.timeout as number;
    if (
      typeof timeout !== 'number' ||
      timeout < BatchProcessingLIMITS.minTimeout ||
      timeout > BatchProcessingLIMITS.maxTimeout
    ) {
      errors.push(
        'timeout must be between ' + BatchProcessingLIMITS.minTimeout + ' and ' + BatchProcessingLIMITS.maxTimeout
      );
    }

    const retries = config.retries as number;
    if (
      typeof retries !== 'number' ||
      retries < BatchProcessingLIMITS.minRetries ||
      retries > BatchProcessingLIMITS.maxRetries
    ) {
      errors.push(
        'retries must be between ' + BatchProcessingLIMITS.minRetries + ' and ' + BatchProcessingLIMITS.maxRetries
      );
    }

    const strategy = config.strategy as string;
    if (typeof strategy === 'string' && (BatchProcessingSTRATEGIES as readonly string[]).indexOf(strategy) < 0) {
      errors.push('strategy must be one of: ' + BatchProcessingSTRATEGIES.join(', '));
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
      throw new Error('Invalid batch-processing configuration: ' + result.errors.join('; '));
    }
  }

  getDefaults(): typeof BatchProcessingDEFAULTS {
    return BatchProcessingDEFAULTS;
  }
}
