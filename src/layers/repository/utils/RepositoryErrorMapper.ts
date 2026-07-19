/**
 * Repository Error Mapper
 *
 * Maps internal repository errors to user-friendly error responses.
 */

import { RepositoryError } from './RepositoryError';
import { RepositoryResult } from '../types/repository-types';

export interface MappedRepositoryError {
  code: string;
  message: string;
  retryable: boolean;
  details?: Record<string, unknown>;
}

export class RepositoryErrorMapper {
  private static readonly _retryableCodes: Set<string> = new Set([
    'QUERY_FAILED',
    'CONNECTION_ERROR',
    'TIMEOUT',
    'DEADLOCK',
  ]);

  static map(error: Error | RepositoryError): MappedRepositoryError {
    if (error instanceof RepositoryError) {
      return {
        code: error.code,
        message: error.message,
        retryable: this._retryableCodes.has(error.code),
        details: error.repositoryId !== undefined ? { repositoryId: error.repositoryId } : undefined,
      };
    }

    return {
      code: 'INTERNAL_ERROR',
      message: error.message || 'An unexpected repository error occurred',
      retryable: false,
    };
  }

  static toRepositoryResult<T>(error: Error | RepositoryError): RepositoryResult<T> {
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

  static isRetryable(error: Error | RepositoryError): boolean {
    return this.map(error).retryable;
  }

  static registerRetryableCode(code: string): void {
    this._retryableCodes.add(code);
  }
}
