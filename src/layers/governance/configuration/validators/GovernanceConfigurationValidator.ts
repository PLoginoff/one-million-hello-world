/**
 * Governance Configuration Validator
 */

import { GovernanceDEFAULTS, GovernanceLIMITS, GovernanceSTRATEGIES } from '../defaults/GovernanceDefaults';

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export class GovernanceConfigurationValidator {
  validate(config: Record<string, unknown>): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (typeof config.enabled !== 'boolean') {
      errors.push('enabled must be a boolean');
    }

    const timeout = config.timeout as number;
    if (typeof timeout !== 'number' || timeout < GovernanceLIMITS.minTimeout || timeout > GovernanceLIMITS.maxTimeout) {
      errors.push('timeout must be between ' + GovernanceLIMITS.minTimeout + ' and ' + GovernanceLIMITS.maxTimeout);
    }

    const retries = config.retries as number;
    if (typeof retries !== 'number' || retries < GovernanceLIMITS.minRetries || retries > GovernanceLIMITS.maxRetries) {
      errors.push('retries must be between ' + GovernanceLIMITS.minRetries + ' and ' + GovernanceLIMITS.maxRetries);
    }

    const strategy = config.strategy as string;
    if (typeof strategy === 'string' && (GovernanceSTRATEGIES as readonly string[]).indexOf(strategy) < 0) {
      errors.push('strategy must be one of: ' + GovernanceSTRATEGIES.join(', '));
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
      throw new Error('Invalid governance configuration: ' + result.errors.join('; '));
    }
  }

  getDefaults(): typeof GovernanceDEFAULTS {
    return GovernanceDEFAULTS;
  }
}
