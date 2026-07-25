/**
 * Onboarding Configuration Validator
 */

import { OnboardingDEFAULTS, OnboardingLIMITS, OnboardingSTRATEGIES } from '../defaults/OnboardingDefaults';

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export class OnboardingConfigurationValidator {
  validate(config: Record<string, unknown>): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (typeof config.enabled !== 'boolean') {
      errors.push('enabled must be a boolean');
    }

    const timeout = config.timeout as number;
    if (typeof timeout !== 'number' || timeout < OnboardingLIMITS.minTimeout || timeout > OnboardingLIMITS.maxTimeout) {
      errors.push('timeout must be between ' + OnboardingLIMITS.minTimeout + ' and ' + OnboardingLIMITS.maxTimeout);
    }

    const retries = config.retries as number;
    if (typeof retries !== 'number' || retries < OnboardingLIMITS.minRetries || retries > OnboardingLIMITS.maxRetries) {
      errors.push('retries must be between ' + OnboardingLIMITS.minRetries + ' and ' + OnboardingLIMITS.maxRetries);
    }

    const strategy = config.strategy as string;
    if (typeof strategy === 'string' && (OnboardingSTRATEGIES as readonly string[]).indexOf(strategy) < 0) {
      errors.push('strategy must be one of: ' + OnboardingSTRATEGIES.join(', '));
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
      throw new Error('Invalid onboarding configuration: ' + result.errors.join('; '));
    }
  }

  getDefaults(): typeof OnboardingDEFAULTS {
    return OnboardingDEFAULTS;
  }
}
