import { IdentityProviderError } from './IdentityProviderError';

export interface MappedIdentityProviderError {
  code: string;
  message: string;
  statusCode: number;
  retryable: boolean;
}

export class IdentityProviderErrorMapper {
  private static readonly _retryableCodes: Set<string> = new Set(['EXECUTION_FAILED', 'TIMEOUT']);

  static map(error: Error | IdentityProviderError): MappedIdentityProviderError {
    if (error instanceof IdentityProviderError) {
      return {
        code: error.code,
        message: error.message,
        statusCode: error.statusCode,
        retryable: this._retryableCodes.has(error.code),
      };
    }

    return {
      code: 'INTERNAL_ERROR',
      message: error.message || 'An unexpected identity-provider error occurred',
      statusCode: 500,
      retryable: false,
    };
  }

  static isRetryable(error: Error | IdentityProviderError): boolean {
    return this.map(error).retryable;
  }

  static registerRetryableCode(code: string): void {
    this._retryableCodes.add(code);
  }
}
