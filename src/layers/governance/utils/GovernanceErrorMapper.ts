import { GovernanceError } from './GovernanceError';

export interface MappedGovernanceError {
  code: string;
  message: string;
  statusCode: number;
  retryable: boolean;
}

export class GovernanceErrorMapper {
  private static readonly _retryableCodes: Set<string> = new Set(['EXECUTION_FAILED', 'TIMEOUT']);

  static map(error: Error | GovernanceError): MappedGovernanceError {
    if (error instanceof GovernanceError) {
      return {
        code: error.code,
        message: error.message,
        statusCode: error.statusCode,
        retryable: this._retryableCodes.has(error.code),
      };
    }
    return {
      code: 'INTERNAL_ERROR',
      message: error.message || 'An unexpected governance error occurred',
      statusCode: 500,
      retryable: false,
    };
  }

  static isRetryable(error: Error | GovernanceError): boolean {
    return this.map(error).retryable;
  }
  static registerRetryableCode(code: string): void {
    this._retryableCodes.add(code);
  }
}
