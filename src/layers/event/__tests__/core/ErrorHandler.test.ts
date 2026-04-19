/**
 * ErrorHandler Unit Tests
 * 
 * Comprehensive tests for ErrorHandler core implementation.
 * Tests cover error handling, strategies, tracking, and edge cases.
 */

import { ErrorHandler } from '../../core/implementations/ErrorHandler';
import { ErrorHandlingStrategy, ErrorContext } from '../../core/interfaces';

describe('ErrorHandler', () => {
  let handler: ErrorHandler;

  beforeEach(() => {
    handler = new ErrorHandler();
  });

  describe('constructor', () => {
    it('should create with default max errors', () => {
      const errorHandler = new ErrorHandler();
      expect(errorHandler.getErrorCount()).toBe(0);
    });

    it('should create with custom max errors', () => {
      const errorHandler = new ErrorHandler(100);
      expect(errorHandler.getErrorCount()).toBe(0);
    });

    it('should set default strategy to log', () => {
      expect(handler.getStrategy()).toBe('log');
    });
  });

  describe('handle', () => {
    it('should add error to error list', () => {
      const context: ErrorContext = {
        eventType: 'test.event',
        subscriptionId: 'sub-1',
        error: new Error('Test error'),
        timestamp: new Date(),
      };

      handler.handle(context);

      expect(handler.getErrorCount()).toBe(1);
    });

    it('should store error context', () => {
      const error = new Error('Test error');
      const context: ErrorContext = {
        eventType: 'test.event',
        subscriptionId: 'sub-1',
        error,
        timestamp: new Date(),
        eventData: { test: 'data' },
      };

      handler.handle(context);

      const errors = handler.getErrors();
      expect(errors).toHaveLength(1);
      expect(errors[0].eventType).toBe('test.event');
      expect(errors[0].subscriptionId).toBe('sub-1');
      expect(errors[0].error).toBe(error);
      expect(errors[0].eventData).toEqual({ test: 'data' });
    });

    it('should log error when strategy is log', () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      const context: ErrorContext = {
        eventType: 'test.event',
        subscriptionId: 'sub-1',
        error: new Error('Test error'),
        timestamp: new Date(),
      };

      handler.handle(context);

      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('should ignore error when strategy is ignore', () => {
      handler.setStrategy('ignore');
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      const context: ErrorContext = {
        eventType: 'test.event',
        subscriptionId: 'sub-1',
        error: new Error('Test error'),
        timestamp: new Date(),
      };

      handler.handle(context);

      expect(consoleSpy).not.toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('should log error when strategy is retry', () => {
      handler.setStrategy('retry');
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      const context: ErrorContext = {
        eventType: 'test.event',
        subscriptionId: 'sub-1',
        error: new Error('Test error'),
        timestamp: new Date(),
      };

      handler.handle(context);

      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('should log error when strategy is circuit-breaker', () => {
      handler.setStrategy('circuit-breaker');
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      const context: ErrorContext = {
        eventType: 'test.event',
        subscriptionId: 'sub-1',
        error: new Error('Test error'),
        timestamp: new Date(),
      };

      handler.handle(context);

      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('should respect max errors limit', () => {
      const errorHandler = new ErrorHandler(5);
      const context: ErrorContext = {
        eventType: 'test.event',
        subscriptionId: 'sub-1',
        error: new Error('Test error'),
        timestamp: new Date(),
      };

      for (let i = 0; i < 10; i++) {
        errorHandler.handle(context);
      }

      expect(errorHandler.getErrorCount()).toBe(5);
    });

    it('should remove oldest errors when limit reached', () => {
      const errorHandler = new ErrorHandler(3);
      const context: ErrorContext = {
        eventType: 'test.event',
        subscriptionId: 'sub-1',
        error: new Error('Test error'),
        timestamp: new Date(),
      };

      errorHandler.handle({ ...context, eventType: 'event1' });
      errorHandler.handle({ ...context, eventType: 'event2' });
      errorHandler.handle({ ...context, eventType: 'event3' });
      errorHandler.handle({ ...context, eventType: 'event4' });

      const errors = errorHandler.getErrors();
      expect(errors).toHaveLength(3);
      expect(errors[0].eventType).toBe('event2');
      expect(errors[1].eventType).toBe('event3');
      expect(errors[2].eventType).toBe('event4');
    });
  });

  describe('setStrategy', () => {
    it('should change strategy', () => {
      handler.setStrategy('ignore');
      expect(handler.getStrategy()).toBe('ignore');
    });

    it('should accept all valid strategies', () => {
      const strategies: ErrorHandlingStrategy[] = ['ignore', 'log', 'retry', 'circuit-breaker'];

      for (const strategy of strategies) {
        handler.setStrategy(strategy);
        expect(handler.getStrategy()).toBe(strategy);
      }
    });
  });

  describe('getStrategy', () => {
    it('should return current strategy', () => {
      handler.setStrategy('retry');
      expect(handler.getStrategy()).toBe('retry');
    });
  });

  describe('getErrorCount', () => {
    it('should return 0 when no errors', () => {
      expect(handler.getErrorCount()).toBe(0);
    });

    it('should return number of errors', () => {
      const context: ErrorContext = {
        eventType: 'test.event',
        subscriptionId: 'sub-1',
        error: new Error('Test error'),
        timestamp: new Date(),
      };

      handler.handle(context);
      handler.handle(context);
      handler.handle(context);

      expect(handler.getErrorCount()).toBe(3);
    });
  });

  describe('getErrors', () => {
    it('should return copy of errors', () => {
      const context: ErrorContext = {
        eventType: 'test.event',
        subscriptionId: 'sub-1',
        error: new Error('Test error'),
        timestamp: new Date(),
      };

      handler.handle(context);
      const errors = handler.getErrors();
      errors.push({} as any);

      expect(handler.getErrorCount()).toBe(1);
    });

    it('should return empty array when no errors', () => {
      expect(handler.getErrors()).toEqual([]);
    });

    it('should return all errors', () => {
      const context: ErrorContext = {
        eventType: 'test.event',
        subscriptionId: 'sub-1',
        error: new Error('Test error'),
        timestamp: new Date(),
      };

      handler.handle({ ...context, eventType: 'event1' });
      handler.handle({ ...context, eventType: 'event2' });
      handler.handle({ ...context, eventType: 'event3' });

      const errors = handler.getErrors();
      expect(errors).toHaveLength(3);
    });
  });

  describe('getErrorsByEventType', () => {
    it('should return errors for specific event type', () => {
      const context: ErrorContext = {
        eventType: 'test.event',
        subscriptionId: 'sub-1',
        error: new Error('Test error'),
        timestamp: new Date(),
      };

      handler.handle({ ...context, eventType: 'event1' });
      handler.handle({ ...context, eventType: 'event1' });
      handler.handle({ ...context, eventType: 'event2' });

      const errors = handler.getErrorsByEventType('event1');
      expect(errors).toHaveLength(2);
      expect(errors.every(e => e.eventType === 'event1')).toBe(true);
    });

    it('should return empty array for event type with no errors', () => {
      const errors = handler.getErrorsByEventType('non-existent.event');
      expect(errors).toEqual([]);
    });

    it('should return copy of errors', () => {
      const context: ErrorContext = {
        eventType: 'test.event',
        subscriptionId: 'sub-1',
        error: new Error('Test error'),
        timestamp: new Date(),
      };

      handler.handle(context);
      const errors = handler.getErrorsByEventType('test.event');
      errors.push({} as any);

      expect(handler.getErrorCount()).toBe(1);
    });
  });

  describe('getErrorsBySubscription', () => {
    it('should return errors for specific subscription', () => {
      const context: ErrorContext = {
        eventType: 'test.event',
        subscriptionId: 'sub-1',
        error: new Error('Test error'),
        timestamp: new Date(),
      };

      handler.handle({ ...context, subscriptionId: 'sub-1' });
      handler.handle({ ...context, subscriptionId: 'sub-1' });
      handler.handle({ ...context, subscriptionId: 'sub-2' });

      const errors = handler.getErrorsBySubscription('sub-1');
      expect(errors).toHaveLength(2);
      expect(errors.every(e => e.subscriptionId === 'sub-1')).toBe(true);
    });

    it('should return empty array for subscription with no errors', () => {
      const errors = handler.getErrorsBySubscription('non-existent-sub');
      expect(errors).toEqual([]);
    });
  });

  describe('getRecentErrors', () => {
    it('should return recent errors with default limit', () => {
      const context: ErrorContext = {
        eventType: 'test.event',
        subscriptionId: 'sub-1',
        error: new Error('Test error'),
        timestamp: new Date(),
      };

      for (let i = 0; i < 20; i++) {
        handler.handle({ ...context, eventType: `event${i}` });
      }

      const recent = handler.getRecentErrors();
      expect(recent).toHaveLength(10);
    });

    it('should return recent errors with custom limit', () => {
      const context: ErrorContext = {
        eventType: 'test.event',
        subscriptionId: 'sub-1',
        error: new Error('Test error'),
        timestamp: new Date(),
      };

      for (let i = 0; i < 20; i++) {
        handler.handle({ ...context, eventType: `event${i}` });
      }

      const recent = handler.getRecentErrors(5);
      expect(recent).toHaveLength(5);
    });

    it('should return all errors if less than limit', () => {
      const context: ErrorContext = {
        eventType: 'test.event',
        subscriptionId: 'sub-1',
        error: new Error('Test error'),
        timestamp: new Date(),
      };

      handler.handle(context);
      handler.handle(context);
      handler.handle(context);

      const recent = handler.getRecentErrors(10);
      expect(recent).toHaveLength(3);
    });

    it('should return empty array when no errors', () => {
      const recent = handler.getRecentErrors();
      expect(recent).toEqual([]);
    });

    it('should return most recent errors', () => {
      const context: ErrorContext = {
        eventType: 'test.event',
        subscriptionId: 'sub-1',
        error: new Error('Test error'),
        timestamp: new Date(),
      };

      for (let i = 0; i < 15; i++) {
        handler.handle({ ...context, eventType: `event${i}` });
      }

      const recent = handler.getRecentErrors(5);
      expect(recent[0].eventType).toBe('event10');
      expect(recent[4].eventType).toBe('event14');
    });
  });

  describe('clearErrors', () => {
    it('should clear all errors', () => {
      const context: ErrorContext = {
        eventType: 'test.event',
        subscriptionId: 'sub-1',
        error: new Error('Test error'),
        timestamp: new Date(),
      };

      handler.handle(context);
      handler.handle(context);
      handler.handle(context);

      handler.clearErrors();

      expect(handler.getErrorCount()).toBe(0);
      expect(handler.getErrors()).toEqual([]);
    });

    it('should handle clearing empty error list', () => {
      expect(() => handler.clearErrors()).not.toThrow();
      expect(handler.getErrorCount()).toBe(0);
    });
  });

  describe('edge cases', () => {
    it('should handle many errors', () => {
      const context: ErrorContext = {
        eventType: 'test.event',
        subscriptionId: 'sub-1',
        error: new Error('Test error'),
        timestamp: new Date(),
      };

      for (let i = 0; i < 10000; i++) {
        handler.handle({ ...context, eventType: `event${i}` });
      }

      expect(handler.getErrorCount()).toBeGreaterThan(0);
    });

    it('should handle errors with complex data', () => {
      const context: ErrorContext = {
        eventType: 'test.event',
        subscriptionId: 'sub-1',
        error: new Error('Test error'),
        timestamp: new Date(),
        eventData: {
          nested: { deep: { value: 42 } },
          array: [1, 2, 3],
        },
      };

      handler.handle(context);

      const errors = handler.getErrors();
      expect(errors[0].eventData).toEqual(context.eventData);
    });

    it('should handle errors without event data', () => {
      const context: ErrorContext = {
        eventType: 'test.event',
        subscriptionId: 'sub-1',
        error: new Error('Test error'),
        timestamp: new Date(),
      };

      handler.handle(context);

      const errors = handler.getErrors();
      expect(errors[0].eventData).toBeUndefined();
    });
  });
});
