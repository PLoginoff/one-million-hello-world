import { WebsocketError } from './WebsocketError';

export interface MappedWebsocketError {
  code: string;
  message: string;
  statusCode: number;
  retryable: boolean;
}

export class WebsocketErrorMapper {
  private static readonly _retryableCodes: Set<string> = new Set(['EXECUTION_FAILED', 'TIMEOUT']);

  static map(error: Error | WebsocketError): MappedWebsocketError {
    if (error instanceof WebsocketError) {
      return {
        code: error.code,
        message: error.message,
        statusCode: error.statusCode,
        retryable: this._retryableCodes.has(error.code),
      };
    }

    return {
      code: 'INTERNAL_ERROR',
      message: error.message || 'An unexpected websocket error occurred',
      statusCode: 500,
      retryable: false,
    };
  }

  static isRetryable(error: Error | WebsocketError): boolean {
    return this.map(error).retryable;
  }

  static registerRetryableCode(code: string): void {
    this._retryableCodes.add(code);
  }
}
