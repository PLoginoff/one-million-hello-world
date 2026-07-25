/**
 * SecretsRotation Configuration Validator
 */

import {
  SecretsRotationDEFAULTS,
  SecretsRotationLIMITS,
  SecretsRotationSTRATEGIES,
} from '../defaults/SecretsRotationDefaults';

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export class SecretsRotationConfigurationValidator {
  validate(config: Record<string, unknown>): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (typeof config.enabled !== 'boolean') {
      errors.push('enabled must be a boolean');
    }

    const timeout = config.timeout as number;
    if (
      typeof timeout !== 'number' ||
      timeout < SecretsRotationLIMITS.minTimeout ||
      timeout > SecretsRotationLIMITS.maxTimeout
    ) {
      errors.push(
        'timeout must be between ' + SecretsRotationLIMITS.minTimeout + ' and ' + SecretsRotationLIMITS.maxTimeout
      );
    }

    const retries = config.retries as number;
    if (
      typeof retries !== 'number' ||
      retries < SecretsRotationLIMITS.minRetries ||
      retries > SecretsRotationLIMITS.maxRetries
    ) {
      errors.push(
        'retries must be between ' + SecretsRotationLIMITS.minRetries + ' and ' + SecretsRotationLIMITS.maxRetries
      );
    }

    const strategy = config.strategy as string;
    if (typeof strategy === 'string' && (SecretsRotationSTRATEGIES as readonly string[]).indexOf(strategy) < 0) {
      errors.push('strategy must be one of: ' + SecretsRotationSTRATEGIES.join(', '));
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
      throw new Error('Invalid secrets-rotation configuration: ' + result.errors.join('; '));
    }
  }

  getDefaults(): typeof SecretsRotationDEFAULTS {
    return SecretsRotationDEFAULTS;
  }
}
