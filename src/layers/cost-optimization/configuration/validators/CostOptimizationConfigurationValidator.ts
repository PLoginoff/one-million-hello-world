/**
 * CostOptimization Configuration Validator
 */

import {
  CostOptimizationDEFAULTS,
  CostOptimizationLIMITS,
  CostOptimizationSTRATEGIES,
} from '../defaults/CostOptimizationDefaults';

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export class CostOptimizationConfigurationValidator {
  validate(config: Record<string, unknown>): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (typeof config.enabled !== 'boolean') {
      errors.push('enabled must be a boolean');
    }

    const timeout = config.timeout as number;
    if (
      typeof timeout !== 'number' ||
      timeout < CostOptimizationLIMITS.minTimeout ||
      timeout > CostOptimizationLIMITS.maxTimeout
    ) {
      errors.push(
        'timeout must be between ' + CostOptimizationLIMITS.minTimeout + ' and ' + CostOptimizationLIMITS.maxTimeout
      );
    }

    const retries = config.retries as number;
    if (
      typeof retries !== 'number' ||
      retries < CostOptimizationLIMITS.minRetries ||
      retries > CostOptimizationLIMITS.maxRetries
    ) {
      errors.push(
        'retries must be between ' + CostOptimizationLIMITS.minRetries + ' and ' + CostOptimizationLIMITS.maxRetries
      );
    }

    const strategy = config.strategy as string;
    if (typeof strategy === 'string' && (CostOptimizationSTRATEGIES as readonly string[]).indexOf(strategy) < 0) {
      errors.push('strategy must be one of: ' + CostOptimizationSTRATEGIES.join(', '));
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
      throw new Error('Invalid cost-optimization configuration: ' + result.errors.join('; '));
    }
  }

  getDefaults(): typeof CostOptimizationDEFAULTS {
    return CostOptimizationDEFAULTS;
  }
}
