import { DataWarehouseError } from './DataWarehouseError';

export interface MappedDataWarehouseError {
  code: string;
  message: string;
  statusCode: number;
  retryable: boolean;
}

export class DataWarehouseErrorMapper {
  private static readonly _retryableCodes: Set<string> = new Set(['EXECUTION_FAILED', 'TIMEOUT']);

  static map(error: Error | DataWarehouseError): MappedDataWarehouseError {
    if (error instanceof DataWarehouseError) {
      return {
        code: error.code,
        message: error.message,
        statusCode: error.statusCode,
        retryable: this._retryableCodes.has(error.code),
      };
    }

    return {
      code: 'INTERNAL_ERROR',
      message: error.message || 'An unexpected data-warehouse error occurred',
      statusCode: 500,
      retryable: false,
    };
  }

  static isRetryable(error: Error | DataWarehouseError): boolean {
    return this.map(error).retryable;
  }

  static registerRetryableCode(code: string): void {
    this._retryableCodes.add(code);
  }
}
