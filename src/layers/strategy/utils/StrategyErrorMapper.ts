import { StrategyError } from './StrategyError';

export interface MappedStrategyError {
  code: string;
  message: string;
  statusCode: number;
  retryable: boolean;
}

export class StrategyErrorMapper {
  private static readonly _retryableCodes: Set<string> = new Set(['EXECUTION_FAILED', 'TIMEOUT']);

  static map(error: Error | StrategyError): MappedStrategyError {
    if (error instanceof StrategyError) {
      return {
        code: error.code,
        message: error.message,
        statusCode: error.statusCode,
        retryable: this._retryableCodes.has(error.code),
      };
    }

    return {
      code: 'INTERNAL_ERROR',
      message: error.message || 'An unexpected strategy error occurred',
      statusCode: 500,
      retryable: false,
    };
  }

  static isRetryable(error: Error | StrategyError): boolean {
    return this.map(error).retryable;
  }

  static registerRetryableCode(code: string): void {
    this._retryableCodes.add(code);
  }
}
