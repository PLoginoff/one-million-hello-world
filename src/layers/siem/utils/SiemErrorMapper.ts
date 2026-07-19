import { SiemError } from './SiemError';

export interface MappedSiemError {
  code: string;
  message: string;
  statusCode: number;
  retryable: boolean;
}

export class SiemErrorMapper {
  private static readonly _retryableCodes: Set<string> = new Set(['EXECUTION_FAILED', 'TIMEOUT']);

  static map(error: Error | SiemError): MappedSiemError {
    if (error instanceof SiemError) {
      return {
        code: error.code,
        message: error.message,
        statusCode: error.statusCode,
        retryable: this._retryableCodes.has(error.code),
      };
    }

    return {
      code: 'INTERNAL_ERROR',
      message: error.message || 'An unexpected siem error occurred',
      statusCode: 500,
      retryable: false,
    };
  }

  static isRetryable(error: Error | SiemError): boolean {
    return this.map(error).retryable;
  }

  static registerRetryableCode(code: string): void {
    this._retryableCodes.add(code);
  }
}
