/**
 * MlFeatureStore Configuration Validator
 */

import {
  MlFeatureStoreDEFAULTS,
  MlFeatureStoreLIMITS,
  MlFeatureStoreSTRATEGIES,
} from '../defaults/MlFeatureStoreDefaults';

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export class MlFeatureStoreConfigurationValidator {
  validate(config: Record<string, unknown>): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (typeof config.enabled !== 'boolean') {
      errors.push('enabled must be a boolean');
    }

    const timeout = config.timeout as number;
    if (
      typeof timeout !== 'number' ||
      timeout < MlFeatureStoreLIMITS.minTimeout ||
      timeout > MlFeatureStoreLIMITS.maxTimeout
    ) {
      errors.push(
        'timeout must be between ' + MlFeatureStoreLIMITS.minTimeout + ' and ' + MlFeatureStoreLIMITS.maxTimeout
      );
    }

    const retries = config.retries as number;
    if (
      typeof retries !== 'number' ||
      retries < MlFeatureStoreLIMITS.minRetries ||
      retries > MlFeatureStoreLIMITS.maxRetries
    ) {
      errors.push(
        'retries must be between ' + MlFeatureStoreLIMITS.minRetries + ' and ' + MlFeatureStoreLIMITS.maxRetries
      );
    }

    const strategy = config.strategy as string;
    if (typeof strategy === 'string' && (MlFeatureStoreSTRATEGIES as readonly string[]).indexOf(strategy) < 0) {
      errors.push('strategy must be one of: ' + MlFeatureStoreSTRATEGIES.join(', '));
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
      throw new Error('Invalid ml-feature-store configuration: ' + result.errors.join('; '));
    }
  }

  getDefaults(): typeof MlFeatureStoreDEFAULTS {
    return MlFeatureStoreDEFAULTS;
  }
}
