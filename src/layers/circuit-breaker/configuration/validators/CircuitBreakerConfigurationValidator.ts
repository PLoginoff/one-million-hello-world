/**
 * CircuitBreaker Configuration Validator
 */

import {
  CircuitBreakerDEFAULTS,
  CircuitBreakerLIMITS,
  CircuitBreakerSTRATEGIES,
} from '../defaults/CircuitBreakerDefaults';

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export class CircuitBreakerConfigurationValidator {
  validate(config: Record<string, unknown>): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (typeof config.enabled !== 'boolean') {
      errors.push('enabled must be a boolean');
    }

    const timeout = config.timeout as number;
    if (
      typeof timeout !== 'number' ||
      timeout < CircuitBreakerLIMITS.minTimeout ||
      timeout > CircuitBreakerLIMITS.maxTimeout
    ) {
      errors.push(
        'timeout must be between ' + CircuitBreakerLIMITS.minTimeout + ' and ' + CircuitBreakerLIMITS.maxTimeout
      );
    }

    const retries = config.retries as number;
    if (
      typeof retries !== 'number' ||
      retries < CircuitBreakerLIMITS.minRetries ||
      retries > CircuitBreakerLIMITS.maxRetries
    ) {
      errors.push(
        'retries must be between ' + CircuitBreakerLIMITS.minRetries + ' and ' + CircuitBreakerLIMITS.maxRetries
      );
    }

    const strategy = config.strategy as string;
    if (typeof strategy === 'string' && (CircuitBreakerSTRATEGIES as readonly string[]).indexOf(strategy) < 0) {
      errors.push('strategy must be one of: ' + CircuitBreakerSTRATEGIES.join(', '));
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
      throw new Error('Invalid circuit-breaker configuration: ' + result.errors.join('; '));
    }
  }

  getDefaults(): typeof CircuitBreakerDEFAULTS {
    return CircuitBreakerDEFAULTS;
  }
}
