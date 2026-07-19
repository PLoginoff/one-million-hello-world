import { GraphqlError } from './GraphqlError';

export interface MappedGraphqlError {
  code: string;
  message: string;
  statusCode: number;
  retryable: boolean;
}

export class GraphqlErrorMapper {
  private static readonly _retryableCodes: Set<string> = new Set(['EXECUTION_FAILED', 'TIMEOUT']);

  static map(error: Error | GraphqlError): MappedGraphqlError {
    if (error instanceof GraphqlError) {
      return {
        code: error.code,
        message: error.message,
        statusCode: error.statusCode,
        retryable: this._retryableCodes.has(error.code),
      };
    }

    return {
      code: 'INTERNAL_ERROR',
      message: error.message || 'An unexpected graphql error occurred',
      statusCode: 500,
      retryable: false,
    };
  }

  static isRetryable(error: Error | GraphqlError): boolean {
    return this.map(error).retryable;
  }

  static registerRetryableCode(code: string): void {
    this._retryableCodes.add(code);
  }
}
