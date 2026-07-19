import { SnapshotError } from './SnapshotError';

export interface MappedSnapshotError {
  code: string;
  message: string;
  statusCode: number;
  retryable: boolean;
}

export class SnapshotErrorMapper {
  private static readonly _retryableCodes: Set<string> = new Set(['EXECUTION_FAILED', 'TIMEOUT']);

  static map(error: Error | SnapshotError): MappedSnapshotError {
    if (error instanceof SnapshotError) {
      return {
        code: error.code,
        message: error.message,
        statusCode: error.statusCode,
        retryable: this._retryableCodes.has(error.code),
      };
    }

    return {
      code: 'INTERNAL_ERROR',
      message: error.message || 'An unexpected snapshot error occurred',
      statusCode: 500,
      retryable: false,
    };
  }

  static isRetryable(error: Error | SnapshotError): boolean {
    return this.map(error).retryable;
  }

  static registerRetryableCode(code: string): void {
    this._retryableCodes.add(code);
  }
}
