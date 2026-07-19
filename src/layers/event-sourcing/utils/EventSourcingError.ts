export class EventSourcingError extends Error {
  readonly code: string;
  readonly statusCode: number;

  constructor(code: string, message: string, statusCode: number = 500) {
    super(message);
    this.name = 'EventSourcingError';
    this.code = code;
    this.statusCode = statusCode;
    if (typeof Error.captureStackTrace === 'function') {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  static executionFailed(message: string = 'EventSourcing execution failed'): EventSourcingError {
    return new EventSourcingError('EXECUTION_FAILED', message, 500);
  }

  static configurationError(message: string = 'Invalid event-sourcing configuration'): EventSourcingError {
    return new EventSourcingError('CONFIGURATION_ERROR', message, 400);
  }

  static notFound(message: string = 'EventSourcing resource not found'): EventSourcingError {
    return new EventSourcingError('NOT_FOUND', message, 404);
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
