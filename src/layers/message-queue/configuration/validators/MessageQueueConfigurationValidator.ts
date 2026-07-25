/**
 * MessageQueue Configuration Validator
 */

import { MessageQueueDEFAULTS, MessageQueueLIMITS, MessageQueueSTRATEGIES } from '../defaults/MessageQueueDefaults';

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export class MessageQueueConfigurationValidator {
  validate(config: Record<string, unknown>): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (typeof config.enabled !== 'boolean') {
      errors.push('enabled must be a boolean');
    }

    const timeout = config.timeout as number;
    if (
      typeof timeout !== 'number' ||
      timeout < MessageQueueLIMITS.minTimeout ||
      timeout > MessageQueueLIMITS.maxTimeout
    ) {
      errors.push('timeout must be between ' + MessageQueueLIMITS.minTimeout + ' and ' + MessageQueueLIMITS.maxTimeout);
    }

    const retries = config.retries as number;
    if (
      typeof retries !== 'number' ||
      retries < MessageQueueLIMITS.minRetries ||
      retries > MessageQueueLIMITS.maxRetries
    ) {
      errors.push('retries must be between ' + MessageQueueLIMITS.minRetries + ' and ' + MessageQueueLIMITS.maxRetries);
    }

    const strategy = config.strategy as string;
    if (typeof strategy === 'string' && (MessageQueueSTRATEGIES as readonly string[]).indexOf(strategy) < 0) {
      errors.push('strategy must be one of: ' + MessageQueueSTRATEGIES.join(', '));
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
      throw new Error('Invalid message-queue configuration: ' + result.errors.join('; '));
    }
  }

  getDefaults(): typeof MessageQueueDEFAULTS {
    return MessageQueueDEFAULTS;
  }
}
