import { PolicyEngineError } from './PolicyEngineError';

export interface MappedPolicyEngineError {
  code: string;
  message: string;
  statusCode: number;
  retryable: boolean;
}

export class PolicyEngineErrorMapper {
  private static readonly _retryableCodes: Set<string> = new Set(['EXECUTION_FAILED', 'TIMEOUT']);

  static map(error: Error | PolicyEngineError): MappedPolicyEngineError {
    if (error instanceof PolicyEngineError) {
      return {
        code: error.code,
        message: error.message,
        statusCode: error.statusCode,
        retryable: this._retryableCodes.has(error.code),
      };
    }

    return {
      code: 'INTERNAL_ERROR',
      message: error.message || 'An unexpected policy-engine error occurred',
      statusCode: 500,
      retryable: false,
    };
  }

  static isRetryable(error: Error | PolicyEngineError): boolean {
    return this.map(error).retryable;
  }

  static registerRetryableCode(code: string): void {
    this._retryableCodes.add(code);
  }
}
