/**
 * Security Error Mapper
 */

import { SecurityError } from './SecurityError';

export interface MappedSecurityError {
  code: string;
  message: string;
  statusCode: number;
  retryable: boolean;
}

export class SecurityErrorMapper {
  private static readonly _retryableCodes: Set<string> = new Set(['RATE_LIMITED', 'SERVICE_UNAVAILABLE']);

  static map(error: Error | SecurityError): MappedSecurityError {
    if (error instanceof SecurityError) {
      return {
        code: error.code,
        message: error.message,
        statusCode: error.statusCode,
        retryable: this._retryableCodes.has(error.code),
      };
    }

    return {
      code: 'INTERNAL_ERROR',
      message: error.message || 'An unexpected security error occurred',
      statusCode: 500,
      retryable: false,
    };
  }

  static isRetryable(error: Error | SecurityError): boolean {
    return this.map(error).retryable;
  }

  static registerRetryableCode(code: string): void {
    this._retryableCodes.add(code);
  }
}
