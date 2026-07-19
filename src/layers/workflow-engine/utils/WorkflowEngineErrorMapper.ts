import { WorkflowEngineError } from './WorkflowEngineError';

export interface MappedWorkflowEngineError {
  code: string;
  message: string;
  statusCode: number;
  retryable: boolean;
}

export class WorkflowEngineErrorMapper {
  private static readonly _retryableCodes: Set<string> = new Set(['EXECUTION_FAILED', 'TIMEOUT']);

  static map(error: Error | WorkflowEngineError): MappedWorkflowEngineError {
    if (error instanceof WorkflowEngineError) {
      return {
        code: error.code,
        message: error.message,
        statusCode: error.statusCode,
        retryable: this._retryableCodes.has(error.code),
      };
    }

    return {
      code: 'INTERNAL_ERROR',
      message: error.message || 'An unexpected workflow-engine error occurred',
      statusCode: 500,
      retryable: false,
    };
  }

  static isRetryable(error: Error | WorkflowEngineError): boolean {
    return this.map(error).retryable;
  }

  static registerRetryableCode(code: string): void {
    this._retryableCodes.add(code);
  }
}
