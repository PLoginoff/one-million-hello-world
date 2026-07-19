export class WorkflowEngineError extends Error {
  readonly code: string;
  readonly statusCode: number;

  constructor(code: string, message: string, statusCode: number = 500) {
    super(message);
    this.name = 'WorkflowEngineError';
    this.code = code;
    this.statusCode = statusCode;
    if (typeof Error.captureStackTrace === 'function') {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  static executionFailed(message: string = 'WorkflowEngine execution failed'): WorkflowEngineError {
    return new WorkflowEngineError('EXECUTION_FAILED', message, 500);
  }

  static configurationError(message: string = 'Invalid workflow-engine configuration'): WorkflowEngineError {
    return new WorkflowEngineError('CONFIGURATION_ERROR', message, 400);
  }

  static notFound(message: string = 'WorkflowEngine resource not found'): WorkflowEngineError {
    return new WorkflowEngineError('NOT_FOUND', message, 404);
  }

  toJSON(): { name: string; code: string; message: string; statusCode: number; stack?: string } {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      statusCode: this.statusCode,
      stack: this.stack,
    };
  }
}
