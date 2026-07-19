import { EtlPipelineError } from './EtlPipelineError';

export interface MappedEtlPipelineError {
  code: string;
  message: string;
  statusCode: number;
  retryable: boolean;
}

export class EtlPipelineErrorMapper {
  private static readonly _retryableCodes: Set<string> = new Set(['EXECUTION_FAILED', 'TIMEOUT']);

  static map(error: Error | EtlPipelineError): MappedEtlPipelineError {
    if (error instanceof EtlPipelineError) {
      return {
        code: error.code,
        message: error.message,
        statusCode: error.statusCode,
        retryable: this._retryableCodes.has(error.code),
      };
    }

    return {
      code: 'INTERNAL_ERROR',
      message: error.message || 'An unexpected etl-pipeline error occurred',
      statusCode: 500,
      retryable: false,
    };
  }

  static isRetryable(error: Error | EtlPipelineError): boolean {
    return this.map(error).retryable;
  }

  static registerRetryableCode(code: string): void {
    this._retryableCodes.add(code);
  }
}
