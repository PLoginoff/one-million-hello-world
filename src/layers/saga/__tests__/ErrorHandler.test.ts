/**
 * Error Handler Unit Tests
 * 
 * Tests for ErrorHandler implementation.
 * Uses AAA pattern (Arrange, Act, Assert).
 */

import { ErrorHandler } from '../implementations/ErrorHandler';
import { Logger } from '../implementations/Logger';
import { ErrorContext, ErrorSeverity } from '../interfaces/IErrorHandler';

describe('ErrorHandler', () => {
  let handler: ErrorHandler;
  let logger: Logger;

  beforeEach(() => {
    logger = new Logger();
    handler = new ErrorHandler(logger);
  });

  describe('constructor', () => {
    it('should initialize with logger', () => {
      expect(handler).toBeDefined();
    });
  });

  describe('handle', () => {
    it('should handle error with context', () => {
      const error = new Error('Test error');
      const context: ErrorContext = {
        stepName: 'step1',
        stepIndex: 0,
        operation: 'execution',
      };

      const handled = handler.handle(error, context);

      expect(handled.originalError).toBe(error);
      expect(handled.severity).toBeDefined();
      expect(handled.message).toContain('Test error');
      expect(handled.context).toBe(context);
      expect(handled.timestamp).toBeDefined();
      expect(handled.shouldCompensate).toBeDefined();
    });

    it('should handle compensation error', () => {
      const error = new Error('Compensation error');
      const context: ErrorContext = {
        stepName: 'step1',
        stepIndex: 0,
        operation: 'compensation',
      };

      const handled = handler.handle(error, context);

      expect(handled.severity).toBe(ErrorSeverity.HIGH);
      expect(handled.shouldCompensate).toBe(false);
    });

    it('should handle execution error', () => {
      const error = new Error('Execution error');
      const context: ErrorContext = {
        stepName: 'step1',
        stepIndex: 0,
        operation: 'execution',
      };

      const handled = handler.handle(error, context);

      expect(handled.shouldCompensate).toBe(true);
    });
  });

  describe('shouldTriggerCompensation', () => {
    it('should return true for execution errors', () => {
      const error = new Error('Test error');
      const context: ErrorContext = {
        operation: 'execution',
      };

      const result = handler.shouldTriggerCompensation(error, context);
      expect(result).toBe(true);
    });

    it('should return false for compensation errors', () => {
      const error = new Error('Test error');
      const context: ErrorContext = {
        operation: 'compensation',
      };

      const result = handler.shouldTriggerCompensation(error, context);
      expect(result).toBe(false);
    });

    it('should return false for validation errors', () => {
      class ValidationError extends Error {
        constructor(message: string) {
          super(message);
          this.name = 'ValidationError';
        }
      }

      const error = new ValidationError('Invalid step');
      const context: ErrorContext = {
        operation: 'execution',
      };

      const result = handler.shouldTriggerCompensation(error, context);
      expect(result).toBe(false);
    });
  });

  describe('shouldContinueExecution', () => {
    it('should return true for low severity errors', () => {
      class ValidationError extends Error {
        constructor(message: string) {
          super(message);
          this.name = 'ValidationError';
        }
      }

      const error = new ValidationError('Invalid');
      const context: ErrorContext = {
        operation: 'execution',
      };

      const result = handler.shouldContinueExecution(error, context);
      expect(result).toBe(true);
    });

    it('should return false for medium severity errors', () => {
      class TimeoutError extends Error {
        constructor(message: string) {
          super(message);
          this.name = 'TimeoutError';
        }
      }

      const error = new TimeoutError('Timeout');
      const context: ErrorContext = {
        operation: 'execution',
      };

      const result = handler.shouldContinueExecution(error, context);
      expect(result).toBe(false);
    });

    it('should return false for high severity errors', () => {
      class DatabaseError extends Error {
        constructor(message: string) {
          super(message);
          this.name = 'DatabaseError';
        }
      }

      const error = new DatabaseError('DB error');
      const context: ErrorContext = {
        operation: 'execution',
      };

      const result = handler.shouldContinueExecution(error, context);
      expect(result).toBe(false);
    });

    it('should return false for critical errors', () => {
      class CriticalError extends Error {
        constructor(message: string) {
          super(message);
          this.name = 'CriticalError';
        }
      }

      const error = new CriticalError('Critical');
      const context: ErrorContext = {
        operation: 'execution',
      };

      const result = handler.shouldContinueExecution(error, context);
      expect(result).toBe(false);
    });
  });

  describe('formatErrorMessage', () => {
    it('should format error message with step name', () => {
      const error = new Error('Test error');
      const context: ErrorContext = {
        stepName: 'step1',
        stepIndex: 0,
        operation: 'execution',
      };

      const message = handler.formatErrorMessage(error, context);
      expect(message).toContain('execution');
      expect(message).toContain('step1');
      expect(message).toContain('Test error');
    });

    it('should format error message with step index', () => {
      const error = new Error('Test error');
      const context: ErrorContext = {
        stepName: 'step1',
        stepIndex: 5,
        operation: 'execution',
      };

      const message = handler.formatErrorMessage(error, context);
      expect(message).toContain('(index 5)');
    });

    it('should format error message without step name', () => {
      const error = new Error('Test error');
      const context: ErrorContext = {
        operation: 'execution',
      };

      const message = handler.formatErrorMessage(error, context);
      expect(message).toContain('execution');
      expect(message).toContain('Test error');
    });
  });

  describe('getErrorSeverity', () => {
    it('should return LOW for ValidationError', () => {
      class ValidationError extends Error {
        constructor(message: string) {
          super(message);
          this.name = 'ValidationError';
        }
      }

      const error = new ValidationError('Invalid');
      const context: ErrorContext = {
        operation: 'execution',
      };

      const severity = handler.getErrorSeverity(error, context);
      expect(severity).toBe(ErrorSeverity.LOW);
    });

    it('should return MEDIUM for TimeoutError', () => {
      class TimeoutError extends Error {
        constructor(message: string) {
          super(message);
          this.name = 'TimeoutError';
        }
      }

      const error = new TimeoutError('Timeout');
      const context: ErrorContext = {
        operation: 'execution',
      };

      const severity = handler.getErrorSeverity(error, context);
      expect(severity).toBe(ErrorSeverity.MEDIUM);
    });

    it('should return MEDIUM for NetworkError', () => {
      class NetworkError extends Error {
        constructor(message: string) {
          super(message);
          this.name = 'NetworkError';
        }
      }

      const error = new NetworkError('Network');
      const context: ErrorContext = {
        operation: 'execution',
      };

      const severity = handler.getErrorSeverity(error, context);
      expect(severity).toBe(ErrorSeverity.MEDIUM);
    });

    it('should return HIGH for DatabaseError', () => {
      class DatabaseError extends Error {
        constructor(message: string) {
          super(message);
          this.name = 'DatabaseError';
        }
      }

      const error = new DatabaseError('DB error');
      const context: ErrorContext = {
        operation: 'execution',
      };

      const severity = handler.getErrorSeverity(error, context);
      expect(severity).toBe(ErrorSeverity.HIGH);
    });

    it('should return CRITICAL for CriticalError', () => {
      class CriticalError extends Error {
        constructor(message: string) {
          super(message);
          this.name = 'CriticalError';
        }
      }

      const error = new CriticalError('Critical');
      const context: ErrorContext = {
        operation: 'execution',
      };

      const severity = handler.getErrorSeverity(error, context);
      expect(severity).toBe(ErrorSeverity.CRITICAL);
    });

    it('should return HIGH for compensation operation', () => {
      const error = new Error('Unknown error');
      const context: ErrorContext = {
        operation: 'compensation',
      };

      const severity = handler.getErrorSeverity(error, context);
      expect(severity).toBe(ErrorSeverity.HIGH);
    });

    it('should return MEDIUM for unknown errors in execution', () => {
      const error = new Error('Unknown error');
      const context: ErrorContext = {
        operation: 'execution',
      };

      const severity = handler.getErrorSeverity(error, context);
      expect(severity).toBe(ErrorSeverity.MEDIUM);
    });
  });

  describe('error types with partial matches', () => {
    it('should match error name containing pattern', () => {
      class MyValidationError extends Error {
        constructor(message: string) {
          super(message);
          this.name = 'MyValidationError';
        }
      }

      const error = new MyValidationError('Invalid');
      const context: ErrorContext = {
        operation: 'execution',
      };

      const severity = handler.getErrorSeverity(error, context);
      expect(severity).toBe(ErrorSeverity.LOW);
    });
  });
});
