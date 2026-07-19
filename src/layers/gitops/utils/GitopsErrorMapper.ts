import { GitopsError } from './GitopsError';

export interface MappedGitopsError {
  code: string;
  message: string;
  statusCode: number;
  retryable: boolean;
}

export class GitopsErrorMapper {
  private static readonly _retryableCodes: Set<string> = new Set(['EXECUTION_FAILED', 'TIMEOUT']);

  static map(error: Error | GitopsError): MappedGitopsError {
    if (error instanceof GitopsError) {
      return {
        code: error.code,
        message: error.message,
        statusCode: error.statusCode,
        retryable: this._retryableCodes.has(error.code),
      };
    }

    return {
      code: 'INTERNAL_ERROR',
      message: error.message || 'An unexpected gitops error occurred',
      statusCode: 500,
      retryable: false,
    };
  }

  static isRetryable(error: Error | GitopsError): boolean {
    return this.map(error).retryable;
  }

  static registerRetryableCode(code: string): void {
    this._retryableCodes.add(code);
  }
}
