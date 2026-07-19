import { SecretsError } from './SecretsError';

export interface MappedSecretsError {
  code: string;
  message: string;
  statusCode: number;
  retryable: boolean;
}

export class SecretsErrorMapper {
  private static readonly _retryableCodes: Set<string> = new Set(['EXECUTION_FAILED', 'TIMEOUT']);

  static map(error: Error | SecretsError): MappedSecretsError {
    if (error instanceof SecretsError) {
      return {
        code: error.code,
        message: error.message,
        statusCode: error.statusCode,
        retryable: this._retryableCodes.has(error.code),
      };
    }

    return {
      code: 'INTERNAL_ERROR',
      message: error.message || 'An unexpected secrets error occurred',
      statusCode: 500,
      retryable: false,
    };
  }

  static isRetryable(error: Error | SecretsError): boolean {
    return this.map(error).retryable;
  }

  static registerRetryableCode(code: string): void {
    this._retryableCodes.add(code);
  }
}
