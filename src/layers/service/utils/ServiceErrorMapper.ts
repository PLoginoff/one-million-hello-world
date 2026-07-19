/**
 * Service Error Mapper
 *
 * Maps internal service errors to user-friendly error responses.
 */

import { ServiceError } from './ServiceError';
import { ServiceResult } from '../types/service-types';

export interface MappedServiceError {
  code: string;
  message: string;
  retryable: boolean;
  details?: Record<string, unknown>;
}

export class ServiceErrorMapper {
  private static readonly _retryableCodes: Set<string> = new Set([
    'SERVICE_EXECUTION_FAILED',
    'SERVICE_TIMEOUT',
    'SERVICE_UNAVAILABLE',
  ]);

  static map(error: Error | ServiceError): MappedServiceError {
    if (error instanceof ServiceError) {
      return {
        code: error.code,
        message: error.message,
        retryable: this._retryableCodes.has(error.code),
        details: error.serviceId !== undefined ? { serviceId: error.serviceId } : undefined,
      };
    }

    return {
      code: 'INTERNAL_ERROR',
      message: error.message || 'An unexpected error occurred',
      retryable: false,
    };
  }

  static toServiceResult<T>(error: Error | ServiceError): ServiceResult<T> {
    const mapped = this.map(error);
    return {
      success: false,
      error: {
        code: mapped.code,
        message: mapped.message,
        details: mapped.details,
      },
    };
  }

  static isRetryable(error: Error | ServiceError): boolean {
    return this.map(error).retryable;
  }

  static registerRetryableCode(code: string): void {
    this._retryableCodes.add(code);
  }
}
