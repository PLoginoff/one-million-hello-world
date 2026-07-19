import { ProxyError } from './ProxyError';

export interface MappedProxyError {
  code: string;
  message: string;
  statusCode: number;
  retryable: boolean;
}

export class ProxyErrorMapper {
  private static readonly _retryableCodes: Set<string> = new Set(['EXECUTION_FAILED', 'TIMEOUT']);

  static map(error: Error | ProxyError): MappedProxyError {
    if (error instanceof ProxyError) {
      return {
        code: error.code,
        message: error.message,
        statusCode: error.statusCode,
        retryable: this._retryableCodes.has(error.code),
      };
    }

    return {
      code: 'INTERNAL_ERROR',
      message: error.message || 'An unexpected proxy error occurred',
      statusCode: 500,
      retryable: false,
    };
  }

  static isRetryable(error: Error | ProxyError): boolean {
    return this.map(error).retryable;
  }

  static registerRetryableCode(code: string): void {
    this._retryableCodes.add(code);
  }
}
