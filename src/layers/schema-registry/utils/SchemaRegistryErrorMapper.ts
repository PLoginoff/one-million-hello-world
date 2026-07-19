import { SchemaRegistryError } from './SchemaRegistryError';

export interface MappedSchemaRegistryError {
  code: string;
  message: string;
  statusCode: number;
  retryable: boolean;
}

export class SchemaRegistryErrorMapper {
  private static readonly _retryableCodes: Set<string> = new Set(['EXECUTION_FAILED', 'TIMEOUT']);

  static map(error: Error | SchemaRegistryError): MappedSchemaRegistryError {
    if (error instanceof SchemaRegistryError) {
      return {
        code: error.code,
        message: error.message,
        statusCode: error.statusCode,
        retryable: this._retryableCodes.has(error.code),
      };
    }

    return {
      code: 'INTERNAL_ERROR',
      message: error.message || 'An unexpected schema-registry error occurred',
      statusCode: 500,
      retryable: false,
    };
  }

  static isRetryable(error: Error | SchemaRegistryError): boolean {
    return this.map(error).retryable;
  }

  static registerRetryableCode(code: string): void {
    this._retryableCodes.add(code);
  }
}
