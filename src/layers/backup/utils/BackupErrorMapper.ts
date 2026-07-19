import { BackupError } from './BackupError';

export interface MappedBackupError {
  code: string;
  message: string;
  statusCode: number;
  retryable: boolean;
}

export class BackupErrorMapper {
  private static readonly _retryableCodes: Set<string> = new Set(['EXECUTION_FAILED', 'TIMEOUT']);

  static map(error: Error | BackupError): MappedBackupError {
    if (error instanceof BackupError) {
      return {
        code: error.code,
        message: error.message,
        statusCode: error.statusCode,
        retryable: this._retryableCodes.has(error.code),
      };
    }

    return {
      code: 'INTERNAL_ERROR',
      message: error.message || 'An unexpected backup error occurred',
      statusCode: 500,
      retryable: false,
    };
  }

  static isRetryable(error: Error | BackupError): boolean {
    return this.map(error).retryable;
  }

  static registerRetryableCode(code: string): void {
    this._retryableCodes.add(code);
  }
}
