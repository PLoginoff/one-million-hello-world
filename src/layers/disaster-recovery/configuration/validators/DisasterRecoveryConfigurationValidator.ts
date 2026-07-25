/**
 * DisasterRecovery Configuration Validator
 */

import {
  DisasterRecoveryDEFAULTS,
  DisasterRecoveryLIMITS,
  DisasterRecoverySTRATEGIES,
} from '../defaults/DisasterRecoveryDefaults';

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export class DisasterRecoveryConfigurationValidator {
  validate(config: Record<string, unknown>): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (typeof config.enabled !== 'boolean') {
      errors.push('enabled must be a boolean');
    }

    const timeout = config.timeout as number;
    if (
      typeof timeout !== 'number' ||
      timeout < DisasterRecoveryLIMITS.minTimeout ||
      timeout > DisasterRecoveryLIMITS.maxTimeout
    ) {
      errors.push(
        'timeout must be between ' + DisasterRecoveryLIMITS.minTimeout + ' and ' + DisasterRecoveryLIMITS.maxTimeout
      );
    }

    const retries = config.retries as number;
    if (
      typeof retries !== 'number' ||
      retries < DisasterRecoveryLIMITS.minRetries ||
      retries > DisasterRecoveryLIMITS.maxRetries
    ) {
      errors.push(
        'retries must be between ' + DisasterRecoveryLIMITS.minRetries + ' and ' + DisasterRecoveryLIMITS.maxRetries
      );
    }

    const strategy = config.strategy as string;
    if (typeof strategy === 'string' && (DisasterRecoverySTRATEGIES as readonly string[]).indexOf(strategy) < 0) {
      errors.push('strategy must be one of: ' + DisasterRecoverySTRATEGIES.join(', '));
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
      throw new Error('Invalid disaster-recovery configuration: ' + result.errors.join('; '));
    }
  }

  getDefaults(): typeof DisasterRecoveryDEFAULTS {
    return DisasterRecoveryDEFAULTS;
  }
}
