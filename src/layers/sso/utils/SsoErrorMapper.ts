import { SsoError } from './SsoError';

export interface MappedSsoError {
  code: string;
  message: string;
  statusCode: number;
  retryable: boolean;
}

export class SsoErrorMapper {
  private static readonly _retryableCodes: Set<string> = new Set(['EXECUTION_FAILED', 'TIMEOUT']);

  static map(error: Error | SsoError): MappedSsoError {
    if (error instanceof SsoError) {
      return {
        code: error.code,
        message: error.message,
        statusCode: error.statusCode,
        retryable: this._retryableCodes.has(error.code),
      };
    }

    return {
      code: 'INTERNAL_ERROR',
      message: error.message || 'An unexpected sso error occurred',
      statusCode: 500,
      retryable: false,
    };
  }

  static isRetryable(error: Error | SsoError): boolean {
    return this.map(error).retryable;
  }

  static registerRetryableCode(code: string): void {
    this._retryableCodes.add(code);
  }
}
