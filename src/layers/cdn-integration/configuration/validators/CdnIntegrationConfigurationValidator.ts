/**
 * CdnIntegration Configuration Validator
 */

import {
  CdnIntegrationDEFAULTS,
  CdnIntegrationLIMITS,
  CdnIntegrationSTRATEGIES,
} from '../defaults/CdnIntegrationDefaults';

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export class CdnIntegrationConfigurationValidator {
  validate(config: Record<string, unknown>): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (typeof config.enabled !== 'boolean') {
      errors.push('enabled must be a boolean');
    }

    const timeout = config.timeout as number;
    if (
      typeof timeout !== 'number' ||
      timeout < CdnIntegrationLIMITS.minTimeout ||
      timeout > CdnIntegrationLIMITS.maxTimeout
    ) {
      errors.push(
        'timeout must be between ' + CdnIntegrationLIMITS.minTimeout + ' and ' + CdnIntegrationLIMITS.maxTimeout
      );
    }

    const retries = config.retries as number;
    if (
      typeof retries !== 'number' ||
      retries < CdnIntegrationLIMITS.minRetries ||
      retries > CdnIntegrationLIMITS.maxRetries
    ) {
      errors.push(
        'retries must be between ' + CdnIntegrationLIMITS.minRetries + ' and ' + CdnIntegrationLIMITS.maxRetries
      );
    }

    const strategy = config.strategy as string;
    if (typeof strategy === 'string' && (CdnIntegrationSTRATEGIES as readonly string[]).indexOf(strategy) < 0) {
      errors.push('strategy must be one of: ' + CdnIntegrationSTRATEGIES.join(', '));
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
      throw new Error('Invalid cdn-integration configuration: ' + result.errors.join('; '));
    }
  }

  getDefaults(): typeof CdnIntegrationDEFAULTS {
    return CdnIntegrationDEFAULTS;
  }
}
