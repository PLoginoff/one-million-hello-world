/**
 * Middleware Error Mapper
 */

import { MiddlewareError } from './MiddlewareError';

export interface MappedMiddlewareError {
  code: string;
  message: string;
  retryable: boolean;
  middlewareId?: string;
  originalError?: string;
}

export class MiddlewareErrorMapper {
  private static readonly _retryableCodes: Set<string> = new Set(['TIMEOUT', 'EXECUTION_FAILED']);

  static map(error: Error | MiddlewareError): MappedMiddlewareError {
    if (error instanceof MiddlewareError) {
      return {
        code: error.code,
        message: error.message,
        retryable: this._retryableCodes.has(error.code),
        middlewareId: error.middlewareId,
        originalError: error.originalError?.message,
      };
    }

    return {
      code: 'INTERNAL_ERROR',
      message: error.message || 'An unexpected middleware error occurred',
      retryable: false,
    };
  }

  static isRetryable(error: Error | MiddlewareError): boolean {
    return this.map(error).retryable;
  }

  static registerRetryableCode(code: string): void {
    this._retryableCodes.add(code);
  }
}
