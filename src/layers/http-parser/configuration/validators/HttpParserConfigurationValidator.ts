/**
 * HttpParser Configuration Validator
 */

import { HttpParserDEFAULTS, HttpParserLIMITS, HttpParserSTRATEGIES } from '../defaults/HttpParserDefaults';

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export class HttpParserConfigurationValidator {
  validate(config: Record<string, unknown>): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (typeof config.enabled !== 'boolean') {
      errors.push('enabled must be a boolean');
    }

    const timeout = config.timeout as number;
    if (typeof timeout !== 'number' || timeout < HttpParserLIMITS.minTimeout || timeout > HttpParserLIMITS.maxTimeout) {
      errors.push('timeout must be between ' + HttpParserLIMITS.minTimeout + ' and ' + HttpParserLIMITS.maxTimeout);
    }

    const retries = config.retries as number;
    if (typeof retries !== 'number' || retries < HttpParserLIMITS.minRetries || retries > HttpParserLIMITS.maxRetries) {
      errors.push('retries must be between ' + HttpParserLIMITS.minRetries + ' and ' + HttpParserLIMITS.maxRetries);
    }

    const strategy = config.strategy as string;
    if (typeof strategy === 'string' && (HttpParserSTRATEGIES as readonly string[]).indexOf(strategy) < 0) {
      errors.push('strategy must be one of: ' + HttpParserSTRATEGIES.join(', '));
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
      throw new Error('Invalid http-parser configuration: ' + result.errors.join('; '));
    }
  }

  getDefaults(): typeof HttpParserDEFAULTS {
    return HttpParserDEFAULTS;
  }
}
