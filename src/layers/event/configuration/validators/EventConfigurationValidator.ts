/**
 * Event Configuration Validator
 */

import { DEFAULT_EVENT_BUS_CONFIG, EVENT_CONFIG_LIMITS, VALID_STRATEGY_NAMES } from '../defaults/EventDefaults';

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export class EventConfigurationValidator {
  validate(config: Record<string, unknown>): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (typeof config.enabled !== 'boolean') {
      errors.push('enabled must be a boolean');
    }

    const timeout = config.timeout as number;
    if (typeof timeout !== 'number' || timeout < EVENT_CONFIG_LIMITS.minTimeout || timeout > EVENT_CONFIG_LIMITS.maxTimeout) {
      errors.push('timeout must be between ' + EVENT_CONFIG_LIMITS.minTimeout + ' and ' + EVENT_CONFIG_LIMITS.maxTimeout);
    }

    const retries = config.retries as number;
    if (typeof retries !== 'number' || retries < EVENT_CONFIG_LIMITS.minRetries || retries > EVENT_CONFIG_LIMITS.maxRetries) {
      errors.push('retries must be between ' + EVENT_CONFIG_LIMITS.minRetries + ' and ' + EVENT_CONFIG_LIMITS.maxRetries);
    }

    const strategy = config.strategy as string;
    if (typeof strategy === 'string' && VALID_STRATEGY_NAMES.indexOf(strategy) < 0) {
      errors.push('strategy must be one of: ' + VALID_STRATEGY_NAMES.join(', '));
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
      throw new Error('Invalid event configuration: ' + result.errors.join('; '));
    }
  }

  getDefaults() {
    return DEFAULT_EVENT_BUS_CONFIG;
  }
}
