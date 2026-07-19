import { ServiceDiscoveryError } from './ServiceDiscoveryError';

export interface MappedServiceDiscoveryError {
  code: string;
  message: string;
  statusCode: number;
  retryable: boolean;
}

export class ServiceDiscoveryErrorMapper {
  private static readonly _retryableCodes: Set<string> = new Set(['EXECUTION_FAILED', 'TIMEOUT']);

  static map(error: Error | ServiceDiscoveryError): MappedServiceDiscoveryError {
    if (error instanceof ServiceDiscoveryError) {
      return {
        code: error.code,
        message: error.message,
        statusCode: error.statusCode,
        retryable: this._retryableCodes.has(error.code),
      };
    }

    return {
      code: 'INTERNAL_ERROR',
      message: error.message || 'An unexpected service-discovery error occurred',
      statusCode: 500,
      retryable: false,
    };
  }

  static isRetryable(error: Error | ServiceDiscoveryError): boolean {
    return this.map(error).retryable;
  }

  static registerRetryableCode(code: string): void {
    this._retryableCodes.add(code);
  }
}
