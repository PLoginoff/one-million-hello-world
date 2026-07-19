import { CdnIntegrationError } from './CdnIntegrationError';

export interface MappedCdnIntegrationError {
  code: string;
  message: string;
  statusCode: number;
  retryable: boolean;
}

export class CdnIntegrationErrorMapper {
  private static readonly _retryableCodes: Set<string> = new Set(['EXECUTION_FAILED', 'TIMEOUT']);

  static map(error: Error | CdnIntegrationError): MappedCdnIntegrationError {
    if (error instanceof CdnIntegrationError) {
      return {
        code: error.code,
        message: error.message,
        statusCode: error.statusCode,
        retryable: this._retryableCodes.has(error.code),
      };
    }
    return {
      code: 'INTERNAL_ERROR',
      message: error.message || 'An unexpected cdn-integration error occurred',
      statusCode: 500,
      retryable: false,
    };
  }

  static isRetryable(error: Error | CdnIntegrationError): boolean {
    return this.map(error).retryable;
  }
  static registerRetryableCode(code: string): void {
    this._retryableCodes.add(code);
  }
}
