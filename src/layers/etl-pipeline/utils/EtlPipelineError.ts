export class EtlPipelineError extends Error {
  readonly code: string;
  readonly statusCode: number;

  constructor(code: string, message: string, statusCode: number = 500) {
    super(message);
    this.name = 'EtlPipelineError';
    this.code = code;
    this.statusCode = statusCode;
    if (typeof Error.captureStackTrace === 'function') {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  static executionFailed(message: string = 'EtlPipeline execution failed'): EtlPipelineError {
    return new EtlPipelineError('EXECUTION_FAILED', message, 500);
  }

  static configurationError(message: string = 'Invalid etl-pipeline configuration'): EtlPipelineError {
    return new EtlPipelineError('CONFIGURATION_ERROR', message, 400);
  }

  static notFound(message: string = 'EtlPipeline resource not found'): EtlPipelineError {
    return new EtlPipelineError('NOT_FOUND', message, 404);
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
