import { ServiceMeshError } from './ServiceMeshError';

export interface MappedServiceMeshError {
  code: string;
  message: string;
  statusCode: number;
  retryable: boolean;
}

export class ServiceMeshErrorMapper {
  private static readonly _retryableCodes: Set<string> = new Set(['EXECUTION_FAILED', 'TIMEOUT']);

  static map(error: Error | ServiceMeshError): MappedServiceMeshError {
    if (error instanceof ServiceMeshError) {
      return {
        code: error.code,
        message: error.message,
        statusCode: error.statusCode,
        retryable: this._retryableCodes.has(error.code),
      };
    }

    return {
      code: 'INTERNAL_ERROR',
      message: error.message || 'An unexpected service-mesh error occurred',
      statusCode: 500,
      retryable: false,
    };
  }

  static isRetryable(error: Error | ServiceMeshError): boolean {
    return this.map(error).retryable;
  }

  static registerRetryableCode(code: string): void {
    this._retryableCodes.add(code);
  }
}
