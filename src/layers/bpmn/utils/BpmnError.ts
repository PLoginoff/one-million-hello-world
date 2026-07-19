export class BpmnError extends Error {
  readonly code: string;
  readonly statusCode: number;

  constructor(code: string, message: string, statusCode: number = 500) {
    super(message);
    this.name = 'BpmnError';
    this.code = code;
    this.statusCode = statusCode;
    if (typeof Error.captureStackTrace === 'function') {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  static executionFailed(message: string = 'Bpmn execution failed'): BpmnError {
    return new BpmnError('EXECUTION_FAILED', message, 500);
  }

  static configurationError(message: string = 'Invalid bpmn configuration'): BpmnError {
    return new BpmnError('CONFIGURATION_ERROR', message, 400);
  }

  static notFound(message: string = 'Bpmn resource not found'): BpmnError {
    return new BpmnError('NOT_FOUND', message, 404);
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
