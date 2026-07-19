import { ConfigurationError } from './ConfigurationError';

export interface MappedConfigurationError {
  code: string;
  message: string;
  statusCode: number;
  retryable: boolean;
}

export class ConfigurationErrorMapper {
  private static readonly _retryableCodes: Set<string> = new Set(['EXECUTION_FAILED', 'TIMEOUT']);

  static map(error: Error | ConfigurationError): MappedConfigurationError {
    if (error instanceof ConfigurationError) {
      return {
        code: error.code,
        message: error.message,
        statusCode: error.statusCode,
        retryable: this._retryableCodes.has(error.code),
      };
    }

    return {
      code: 'INTERNAL_ERROR',
      message: error.message || 'An unexpected configuration error occurred',
      statusCode: 500,
      retryable: false,
    };
  }

  static isRetryable(error: Error | ConfigurationError): boolean {
    return this.map(error).retryable;
  }

  static registerRetryableCode(code: string): void {
    this._retryableCodes.add(code);
  }
}
