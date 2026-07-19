import { ApiGatewayError } from './ApiGatewayError';

export interface MappedApiGatewayError {
  code: string;
  message: string;
  statusCode: number;
  retryable: boolean;
}

export class ApiGatewayErrorMapper {
  private static readonly _retryableCodes: Set<string> = new Set(['EXECUTION_FAILED', 'TIMEOUT']);

  static map(error: Error | ApiGatewayError): MappedApiGatewayError {
    if (error instanceof ApiGatewayError) {
      return {
        code: error.code,
        message: error.message,
        statusCode: error.statusCode,
        retryable: this._retryableCodes.has(error.code),
      };
    }

    return {
      code: 'INTERNAL_ERROR',
      message: error.message || 'An unexpected api-gateway error occurred',
      statusCode: 500,
      retryable: false,
    };
  }

  static isRetryable(error: Error | ApiGatewayError): boolean {
    return this.map(error).retryable;
  }

  static registerRetryableCode(code: string): void {
    this._retryableCodes.add(code);
  }
}
