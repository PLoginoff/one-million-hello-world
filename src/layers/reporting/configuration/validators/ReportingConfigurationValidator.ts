/**
 * Reporting Configuration Validator
 */

import { ReportingDEFAULTS, ReportingLIMITS, ReportingSTRATEGIES } from '../defaults/ReportingDefaults';

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export class ReportingConfigurationValidator {
  validate(config: Record<string, unknown>): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (typeof config.enabled !== 'boolean') {
      errors.push('enabled must be a boolean');
    }

    const timeout = config.timeout as number;
    if (typeof timeout !== 'number' || timeout < ReportingLIMITS.minTimeout || timeout > ReportingLIMITS.maxTimeout) {
      errors.push('timeout must be between ' + ReportingLIMITS.minTimeout + ' and ' + ReportingLIMITS.maxTimeout);
    }

    const retries = config.retries as number;
    if (typeof retries !== 'number' || retries < ReportingLIMITS.minRetries || retries > ReportingLIMITS.maxRetries) {
      errors.push('retries must be between ' + ReportingLIMITS.minRetries + ' and ' + ReportingLIMITS.maxRetries);
    }

    const strategy = config.strategy as string;
    if (typeof strategy === 'string' && (ReportingSTRATEGIES as readonly string[]).indexOf(strategy) < 0) {
      errors.push('strategy must be one of: ' + ReportingSTRATEGIES.join(', '));
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
      throw new Error('Invalid reporting configuration: ' + result.errors.join('; '));
    }
  }

  getDefaults(): typeof ReportingDEFAULTS {
    return ReportingDEFAULTS;
  }
}
