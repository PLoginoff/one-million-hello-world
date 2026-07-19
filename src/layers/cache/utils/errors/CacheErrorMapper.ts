/**
 * Cache Error Mapper
 */

import { CacheError, CacheKeyError, CacheConfigError } from './CacheError';

export interface MappedCacheError {
  name: string;
  message: string;
  severity: 'warning' | 'error' | 'critical';
  retryable: boolean;
}

export class CacheErrorMapper {
  static map(error: Error | CacheError): MappedCacheError {
    if (error instanceof CacheKeyError) {
      return {
        name: error.name,
        message: error.message,
        severity: 'warning',
        retryable: true,
      };
    }

    if (error instanceof CacheConfigError) {
      return {
        name: error.name,
        message: error.message,
        severity: 'critical',
        retryable: false,
      };
    }

    if (error instanceof CacheError) {
      return {
        name: error.name,
        message: error.message,
        severity: 'error',
        retryable: true,
      };
    }

    return {
      name: 'InternalError',
      message: error.message || 'An unexpected cache error occurred',
      severity: 'error',
      retryable: false,
    };
  }

  static isRetryable(error: Error | CacheError): boolean {
    return this.map(error).retryable;
  }
}
