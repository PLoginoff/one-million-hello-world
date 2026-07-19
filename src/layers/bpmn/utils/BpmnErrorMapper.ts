import { BpmnError } from './BpmnError';

export interface MappedBpmnError {
  code: string;
  message: string;
  statusCode: number;
  retryable: boolean;
}

export class BpmnErrorMapper {
  private static readonly _retryableCodes: Set<string> = new Set(['EXECUTION_FAILED', 'TIMEOUT']);

  static map(error: Error | BpmnError): MappedBpmnError {
    if (error instanceof BpmnError) {
      return {
        code: error.code,
        message: error.message,
        statusCode: error.statusCode,
        retryable: this._retryableCodes.has(error.code),
      };
    }

    return {
      code: 'INTERNAL_ERROR',
      message: error.message || 'An unexpected bpmn error occurred',
      statusCode: 500,
      retryable: false,
    };
  }

  static isRetryable(error: Error | BpmnError): boolean {
    return this.map(error).retryable;
  }

  static registerRetryableCode(code: string): void {
    this._retryableCodes.add(code);
  }
}
