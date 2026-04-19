/**
 * EventExecutor Unit Tests
 * 
 * Comprehensive tests for EventExecutor core implementation.
 * Tests cover synchronous and asynchronous execution, error handling, and batch operations.
 */

import { EventExecutor } from '../../core/implementations/EventExecutor';
import { ErrorHandler } from '../../core/implementations/ErrorHandler';
import { Event } from '../../domain/entities/Event';
import { ExecutionResult } from '../../core/interfaces';

describe('EventExecutor', () => {
  let executor: EventExecutor;
  let errorHandler: ErrorHandler;

  beforeEach(() => {
    errorHandler = new ErrorHandler();
    executor = new EventExecutor(errorHandler);
  });

  describe('constructor', () => {
    it('should create executor with error handler', () => {
      expect(executor).toBeDefined();
    });
  });

  describe('execute', () => {
    it('should execute handler successfully', () => {
      const handler = jest.fn();
      const event = Event.create('test.event', { data: 'test' });

      const result = executor.execute(event, handler);

      expect(result.success).toBe(true);
      expect(result.handlerExecuted).toBe(true);
      expect(result.error).toBeUndefined();
      expect(result.executionTime).toBeGreaterThanOrEqual(0);
      expect(handler).toHaveBeenCalledWith(event);
    });

    it('should measure execution time', () => {
      const handler = jest.fn(() => {
        // Simulate some work
        for (let i = 0; i < 1000; i++) {}
      });
      const event = Event.create('test.event', {});

      const result = executor.execute(event, handler);

      expect(result.executionTime).toBeGreaterThan(0);
    });

    it('should handle handler errors', () => {
      const error = new Error('Handler error');
      const handler = jest.fn(() => {
        throw error;
      });
      const event = Event.create('test.event', {});

      const result = executor.execute(event, handler);

      expect(result.success).toBe(false);
      expect(result.handlerExecuted).toBe(true);
      expect(result.error).toBe(error);
      expect(errorHandler.getErrorCount()).toBe(1);
    });

    it('should pass event data to handler', () => {
      const handler = jest.fn();
      const event = Event.create('test.event', { userId: '123', action: 'login' });

      executor.execute(event, handler);

      expect(handler).toHaveBeenCalledWith(event);
      expect(handler.mock.calls[0][0].payload.data).toEqual({ userId: '123', action: 'login' });
    });

    it('should handle async handlers synchronously', async () => {
      const handler = jest.fn(async () => {
        await new Promise(resolve => setTimeout(resolve, 10));
      });
      const event = Event.create('test.event', {});

      const result = executor.execute(event, handler);

      expect(result.success).toBe(true);
    });

    it('should handle handlers returning promises', () => {
      const handler = jest.fn(() => Promise.resolve());
      const event = Event.create('test.event', {});

      const result = executor.execute(event, handler);

      expect(result.success).toBe(true);
    });

    it('should handle handlers throwing non-Error objects', () => {
      const handler = jest.fn(() => {
        throw 'string error';
      });
      const event = Event.create('test.event', {});

      const result = executor.execute(event, handler);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should handle handlers throwing null', () => {
      const handler = jest.fn(() => {
        throw null;
      });
      const event = Event.create('test.event', {});

      const result = executor.execute(event, handler);

      expect(result.success).toBe(false);
    });
  });

  describe('executeAsync', () => {
    it('should execute async handler successfully', async () => {
      const handler = jest.fn().mockResolvedValue(undefined);
      const event = Event.create('test.event', { data: 'test' });

      const result = await executor.executeAsync(event, handler);

      expect(result.success).toBe(true);
      expect(result.handlerExecuted).toBe(true);
      expect(result.error).toBeUndefined();
      expect(handler).toHaveBeenCalledWith(event);
    });

    it('should measure async execution time', async () => {
      const handler = jest.fn(async () => {
        await new Promise(resolve => setTimeout(resolve, 10));
      });
      const event = Event.create('test.event', {});

      const result = await executor.executeAsync(event, handler);

      expect(result.executionTime).toBeGreaterThanOrEqual(10);
    });

    it('should handle async handler errors', async () => {
      const error = new Error('Async handler error');
      const handler = jest.fn().mockRejectedValue(error);
      const event = Event.create('test.event', {});

      const result = await executor.executeAsync(event, handler);

      expect(result.success).toBe(false);
      expect(result.handlerExecuted).toBe(true);
      expect(result.error).toBe(error);
      expect(errorHandler.getErrorCount()).toBe(1);
    });

    it('should handle sync handlers in async context', async () => {
      const handler = jest.fn();
      const event = Event.create('test.event', {});

      const result = await executor.executeAsync(event, handler);

      expect(result.success).toBe(true);
      expect(handler).toHaveBeenCalledWith(event);
    });

    it('should handle handlers that return non-promises', async () => {
      const handler = jest.fn(() => 'return value');
      const event = Event.create('test.event', {});

      const result = await executor.executeAsync(event, handler);

      expect(result.success).toBe(true);
    });
  });

  describe('executeBatch', () => {
    it('should execute all handlers in batch', () => {
      const handler1 = jest.fn();
      const handler2 = jest.fn();
      const handler3 = jest.fn();
      const event = Event.create('test.event', {});

      const results = executor.executeBatch(event, [handler1, handler2, handler3]);

      expect(results).toHaveLength(3);
      expect(results.every(r => r.success)).toBe(true);
      expect(handler1).toHaveBeenCalledWith(event);
      expect(handler2).toHaveBeenCalledWith(event);
      expect(handler3).toHaveBeenCalledWith(event);
    });

    it('should return results for all handlers', () => {
      const handlers = [jest.fn(), jest.fn(), jest.fn()];
      const event = Event.create('test.event', {});

      const results = executor.executeBatch(event, handlers);

      expect(results).toHaveLength(3);
      results.forEach((result, i) => {
        expect(result.handlerExecuted).toBe(true);
      });
    });

    it('should handle partial failures in batch', () => {
      const handler1 = jest.fn();
      const handler2 = jest.fn(() => { throw new Error('Error 2'); });
      const handler3 = jest.fn();
      const event = Event.create('test.event', {});

      const results = executor.executeBatch(event, [handler1, handler2, handler3]);

      expect(results).toHaveLength(3);
      expect(results[0].success).toBe(true);
      expect(results[1].success).toBe(false);
      expect(results[2].success).toBe(true);
    });

    it('should handle empty batch', () => {
      const event = Event.create('test.event', {});
      const results = executor.executeBatch(event, []);

      expect(results).toEqual([]);
    });

    it('should handle single handler batch', () => {
      const handler = jest.fn();
      const event = Event.create('test.event', {});

      const results = executor.executeBatch(event, [handler]);

      expect(results).toHaveLength(1);
      expect(results[0].success).toBe(true);
    });

    it('should execute handlers in order', () => {
      const order: number[] = [];
      const handler1 = jest.fn(() => { order.push(1); });
      const handler2 = jest.fn(() => { order.push(2); });
      const handler3 = jest.fn(() => { order.push(3); });
      const event = Event.create('test.event', {});

      executor.executeBatch(event, [handler1, handler2, handler3]);

      expect(order).toEqual([1, 2, 3]);
    });

    it('should continue execution after error', () => {
      const handler1 = jest.fn();
      const handler2 = jest.fn(() => { throw new Error('Error'); });
      const handler3 = jest.fn();
      const event = Event.create('test.event', {});

      const results = executor.executeBatch(event, [handler1, handler2, handler3]);

      expect(handler1).toHaveBeenCalled();
      expect(handler2).toHaveBeenCalled();
      expect(handler3).toHaveBeenCalled();
    });
  });

  describe('executeBatchAsync', () => {
    it('should execute all async handlers in batch', async () => {
      const handler1 = jest.fn().mockResolvedValue(undefined);
      const handler2 = jest.fn().mockResolvedValue(undefined);
      const handler3 = jest.fn().mockResolvedValue(undefined);
      const event = Event.create('test.event', {});

      const results = await executor.executeBatchAsync(event, [handler1, handler2, handler3]);

      expect(results).toHaveLength(3);
      expect(results.every(r => r.success)).toBe(true);
    });

    it('should execute handlers concurrently', async () => {
      const order: number[] = [];
      const handler1 = jest.fn(async () => {
        order.push(1);
        await new Promise(resolve => setTimeout(resolve, 50));
      });
      const handler2 = jest.fn(async () => {
        order.push(2);
        await new Promise(resolve => setTimeout(resolve, 30));
      });
      const handler3 = jest.fn(async () => {
        order.push(3);
        await new Promise(resolve => setTimeout(resolve, 10));
      });
      const event = Event.create('test.event', {});

      await executor.executeBatchAsync(event, [handler1, handler2, handler3]);

      expect(order.length).toBe(3);
    });

    it('should handle partial failures in async batch', async () => {
      const handler1 = jest.fn().mockResolvedValue(undefined);
      const handler2 = jest.fn().mockRejectedValue(new Error('Error'));
      const handler3 = jest.fn().mockResolvedValue(undefined);
      const event = Event.create('test.event', {});

      const results = await executor.executeBatchAsync(event, [handler1, handler2, handler3]);

      expect(results).toHaveLength(3);
      expect(results[0].success).toBe(true);
      expect(results[1].success).toBe(false);
      expect(results[2].success).toBe(true);
    });

    it('should handle empty async batch', async () => {
      const event = Event.create('test.event', {});
      const results = await executor.executeBatchAsync(event, []);

      expect(results).toEqual([]);
    });

    it('should handle mix of sync and async handlers', async () => {
      const handler1 = jest.fn();
      const handler2 = jest.fn().mockResolvedValue(undefined);
      const handler3 = jest.fn();
      const event = Event.create('test.event', {});

      const results = await executor.executeBatchAsync(event, [handler1, handler2, handler3]);

      expect(results.every(r => r.success)).toBe(true);
    });
  });

  describe('error handling integration', () => {
    it('should report errors to error handler', () => {
      const error = new Error('Test error');
      const handler = jest.fn(() => { throw error; });
      const event = Event.create('test.event', {});

      executor.execute(event, handler);

      const errors = errorHandler.getErrors();
      expect(errors).toHaveLength(1);
      expect(errors[0].error).toBe(error);
      expect(errors[0].eventType).toBe('test.event');
    });

    it('should include event data in error context', () => {
      const handler = jest.fn(() => { throw new Error('Error'); });
      const event = Event.create('test.event', { userId: '123' });

      executor.execute(event, handler);

      const errors = errorHandler.getErrors();
      expect(errors[0].eventData).toEqual({ userId: '123' });
    });

    it('should include subscription ID in error context', () => {
      const handler = jest.fn(() => { throw new Error('Error'); });
      const event = Event.create('test.event', {});

      executor.execute(event, handler);

      const errors = errorHandler.getErrors();
      expect(errors[0].subscriptionId).toBe('unknown');
    });

    it('should include timestamp in error context', () => {
      const handler = jest.fn(() => { throw new Error('Error'); });
      const event = Event.create('test.event', {});

      const before = Date.now();
      executor.execute(event, handler);
      const after = Date.now();

      const errors = errorHandler.getErrors();
      const errorTime = errors[0].timestamp.getTime();
      expect(errorTime).toBeGreaterThanOrEqual(before);
      expect(errorTime).toBeLessThanOrEqual(after);
    });
  });

  describe('edge cases', () => {
    it('should handle very fast handlers', () => {
      const handler = jest.fn(() => {});
      const event = Event.create('test.event', {});

      const result = executor.execute(event, handler);

      expect(result.executionTime).toBeGreaterThanOrEqual(0);
    });

    it('should handle very slow handlers', () => {
      const handler = jest.fn(() => {
        for (let i = 0; i < 1000000; i++) {}
      });
      const event = Event.create('test.event', {});

      const result = executor.execute(event, handler);

      expect(result.executionTime).toBeGreaterThan(0);
    });

    it('should handle handlers that modify event', () => {
      const handler = jest.fn((event) => {
        (event as any).modified = true;
      });
      const event = Event.create('test.event', {});

      executor.execute(event, handler);

      expect(handler).toHaveBeenCalled();
    });

    it('should handle many handlers in batch', () => {
      const handlers = Array.from({ length: 1000 }, () => jest.fn());
      const event = Event.create('test.event', {});

      const results = executor.executeBatch(event, handlers);

      expect(results).toHaveLength(1000);
    });

    it('should handle many async handlers in batch', async () => {
      const handlers = Array.from({ length: 100 }, () => jest.fn().mockResolvedValue(undefined));
      const event = Event.create('test.event', {});

      const results = await executor.executeBatchAsync(event, handlers);

      expect(results).toHaveLength(100);
    });
  });
});
