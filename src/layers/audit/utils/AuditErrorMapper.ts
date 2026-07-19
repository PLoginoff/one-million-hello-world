import { AuditError } from './AuditError';

export interface MappedAuditError {
  code: string;
  message: string;
  statusCode: number;
  retryable: boolean;
}

export class AuditErrorMapper {
  private static readonly _retryableCodes: Set<string> = new Set(['EXECUTION_FAILED', 'TIMEOUT']);

  static map(error: Error | AuditError): MappedAuditError {
    if (error instanceof AuditError) {
      return {
        code: error.code,
        message: error.message,
        statusCode: error.statusCode,
        retryable: this._retryableCodes.has(error.code),
      };
    }

    return {
      code: 'INTERNAL_ERROR',
      message: error.message || 'An unexpected audit error occurred',
      statusCode: 500,
      retryable: false,
    };
  }

  static isRetryable(error: Error | AuditError): boolean {
    return this.map(error).retryable;
  }

  static registerRetryableCode(code: string): void {
    this._retryableCodes.add(code);
  }
}
