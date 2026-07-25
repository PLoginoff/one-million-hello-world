/**
 * DataTransformation Configuration Validator
 */

import {
  DataTransformationDEFAULTS,
  DataTransformationLIMITS,
  DataTransformationSTRATEGIES,
} from '../defaults/DataTransformationDefaults';

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export class DataTransformationConfigurationValidator {
  validate(config: Record<string, unknown>): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (typeof config.enabled !== 'boolean') {
      errors.push('enabled must be a boolean');
    }

    const timeout = config.timeout as number;
    if (
      typeof timeout !== 'number' ||
      timeout < DataTransformationLIMITS.minTimeout ||
      timeout > DataTransformationLIMITS.maxTimeout
    ) {
      errors.push(
        'timeout must be between ' + DataTransformationLIMITS.minTimeout + ' and ' + DataTransformationLIMITS.maxTimeout
      );
    }

    const retries = config.retries as number;
    if (
      typeof retries !== 'number' ||
      retries < DataTransformationLIMITS.minRetries ||
      retries > DataTransformationLIMITS.maxRetries
    ) {
      errors.push(
        'retries must be between ' + DataTransformationLIMITS.minRetries + ' and ' + DataTransformationLIMITS.maxRetries
      );
    }

    const strategy = config.strategy as string;
    if (typeof strategy === 'string' && (DataTransformationSTRATEGIES as readonly string[]).indexOf(strategy) < 0) {
      errors.push('strategy must be one of: ' + DataTransformationSTRATEGIES.join(', '));
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
      throw new Error('Invalid data-transformation configuration: ' + result.errors.join('; '));
    }
  }

  getDefaults(): typeof DataTransformationDEFAULTS {
    return DataTransformationDEFAULTS;
  }
}
