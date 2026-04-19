/**
 * EventDispatcher Unit Tests
 * 
 * Comprehensive tests for EventDispatcher application service.
 * Tests cover dispatching, middleware, retry policies, and edge cases.
 */

import { EventDispatcher } from '../../application/services/EventDispatcher';
import { EventHandlerRegistry } from '../../application/services/EventHandlerRegistry';
import { EventBus } from '../../core/implementations/EventBus';
import { Event } from '../../domain/entities/Event';

describe('EventDispatcher', () => {
  let dispatcher: EventDispatcher;
  let registry: EventHandlerRegistry;
  let eventBus: EventBus;

  beforeEach(() => {
    registry = new EventHandlerRegistry();
    eventBus = new EventBus();
    dispatcher = new EventDispatcher(registry, eventBus);
  });

  describe('constructor', () => {
    it('should create dispatcher with registry and event bus', () => {
      expect(dispatcher).toBeDefined();
    });
  });

  describe('dispatch', () => {
    it('should dispatch event to registered handlers', async () => {
      const handler = jest.fn();
      registry.register('test.event', handler);

      const event = Event.create('test.event', { data: 'test' });
      const result = await dispatcher.dispatch(event);

      expect(result.success).toBe(true);
      expect(result.handlersExecuted).toBe(1);
      expect(result.handlersSucceeded).toBe(1);
      expect(result.handlersFailed).toBe(0);
      expect(handler).toHaveBeenCalledWith(event);
    });

    it('should dispatch to multiple handlers', async () => {
      const handler1 = jest.fn();
      const handler2 = jest.fn();
      const handler3 = jest.fn();
      registry.register('test.event', handler1);
      registry.register('test.event', handler2);
      registry.register('test.event', handler3);

      const event = Event.create('test.event', {});
      const result = await dispatcher.dispatch(event);

      expect(result.handlersExecuted).toBe(3);
      expect(result.handlersSucceeded).toBe(3);
      expect(handler1).toHaveBeenCalledWith(event);
      expect(handler2).toHaveBeenCalledWith(event);
      expect(handler3).toHaveBeenCalledWith(event);
    });

    it('should execute handlers in priority order', async () => {
      const order: number[] = [];
      const handler1 = jest.fn(() => { order.push(1); });
      const handler2 = jest.fn(() => { order.push(2); });
      const handler3 = jest.fn(() => { order.push(3); });

      registry.register('test.event', handler1, 1);
      registry.register('test.event', handler2, 3);
      registry.register('test.event', handler3, 2);

      const event = Event.create('test.event', {});
      await dispatcher.dispatch(event);

      expect(order).toEqual([2, 3, 1]);
    });

    it('should measure execution time', async () => {
      const handler = jest.fn();
      registry.register('test.event', handler);

      const event = Event.create('test.event', {});
      const result = await dispatcher.dispatch(event);

      expect(result.executionTime).toBeGreaterThanOrEqual(0);
    });

    it('should handle handler errors', async () => {
      const error = new Error('Handler error');
      const handler1 = jest.fn(() => { throw error; });
      const handler2 = jest.fn();
      registry.register('test.event', handler1);
      registry.register('test.event', handler2);

      const event = Event.create('test.event', {});
      const result = await dispatcher.dispatch(event);

      expect(result.success).toBe(false);
      expect(result.handlersExecuted).toBe(2);
      expect(result.handlersSucceeded).toBe(1);
      expect(result.handlersFailed).toBe(1);
      expect(result.errors).toHaveLength(1);
      expect(handler2).toHaveBeenCalled();
    });

    it('should return event ID in result', async () => {
      const handler = jest.fn();
      registry.register('test.event', handler);

      const event = Event.create('test.event', {});
      const result = await dispatcher.dispatch(event);

      expect(result.eventId).toBe(event.id.value);
    });

    it('should return event type in result', async () => {
      const handler = jest.fn();
      registry.register('test.event', handler);

      const event = Event.create('test.event', {});
      const result = await dispatcher.dispatch(event);

      expect(result.eventType).toBe('test.event');
    });

    it('should handle no registered handlers', async () => {
      const event = Event.create('test.event', {});
      const result = await dispatcher.dispatch(event);

      expect(result.success).toBe(true);
      expect(result.handlersExecuted).toBe(0);
      expect(result.handlersSucceeded).toBe(0);
    });

    it('should handle sync mode (default)', async () => {
      const order: number[] = [];
      const handler1 = jest.fn(() => { order.push(1); });
      const handler2 = jest.fn(() => { order.push(2); });
      registry.register('test.event', handler1);
      registry.register('test.event', handler2);

      const event = Event.create('test.event', {});
      await dispatcher.dispatch(event, { async: false });

      expect(order).toEqual([1, 2]);
    });
  });

  describe('dispatch with async option', () => {
    it('should execute handlers concurrently in async mode', async () => {
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

      registry.register('test.event', handler1);
      registry.register('test.event', handler2);
      registry.register('test.event', handler3);

      const event = Event.create('test.event', {});
      await dispatcher.dispatch(event, { async: true });

      expect(order.length).toBe(3);
    });

    it('should await all handlers in async mode', async () => {
      let completed = false;
      const handler = jest.fn(async () => {
        await new Promise(resolve => setTimeout(resolve, 10));
        completed = true;
      });
      registry.register('test.event', handler);

      const event = Event.create('test.event', {});
      await dispatcher.dispatch(event, { async: true });

      expect(completed).toBe(true);
    });
  });

  describe('dispatch with timeout option', () => {
    it('should timeout handler after specified time', async () => {
      const handler = jest.fn(async () => {
        await new Promise(resolve => setTimeout(resolve, 1000));
      });
      registry.register('test.event', handler);

      const event = Event.create('test.event', {});
      const result = await dispatcher.dispatch(event, { timeout: 50 });

      expect(result.success).toBe(false);
      expect(result.handlersFailed).toBe(1);
      expect(result.errors).toBeDefined();
    });

    it('should complete handler within timeout', async () => {
      const handler = jest.fn(async () => {
        await new Promise(resolve => setTimeout(resolve, 10));
      });
      registry.register('test.event', handler);

      const event = Event.create('test.event', {});
      const result = await dispatcher.dispatch(event, { timeout: 100 });

      expect(result.success).toBe(true);
    });
  });

  describe('dispatch with retry option', () => {
    it('should retry failed handlers', async () => {
      let attempts = 0;
      const handler = jest.fn(() => {
        attempts++;
        if (attempts < 3) {
          throw new Error('Not yet');
        }
      });
      registry.register('test.event', handler);

      const event = Event.create('test.event', {});
      const result = await dispatcher.dispatch(event, {
        retryOnFailure: true,
        maxRetries: 3,
      });

      expect(attempts).toBe(3);
      expect(result.success).toBe(true);
    });

    it('should not retry when retryOnFailure is false', async () => {
      let attempts = 0;
      const handler = jest.fn(() => {
        attempts++;
        throw new Error('Error');
      });
      registry.register('test.event', handler);

      const event = Event.create('test.event', {});
      await dispatcher.dispatch(event, {
        retryOnFailure: false,
        maxRetries: 3,
      });

      expect(attempts).toBe(1);
    });

    it('should respect maxRetries', async () => {
      let attempts = 0;
      const handler = jest.fn(() => {
        attempts++;
        throw new Error('Error');
      });
      registry.register('test.event', handler);

      const event = Event.create('test.event', {});
      await dispatcher.dispatch(event, {
        retryOnFailure: true,
        maxRetries: 2,
      });

      expect(attempts).toBe(2);
    });
  });

  describe('dispatchBatch', () => {
    it('should dispatch multiple events', async () => {
      const handler = jest.fn();
      registry.register('test.event', handler);

      const events = [
        Event.create('test.event', { id: 1 }),
        Event.create('test.event', { id: 2 }),
        Event.create('test.event', { id: 3 }),
      ];

      const results = await dispatcher.dispatchBatch(events);

      expect(results).toHaveLength(3);
      expect(results.every(r => r.success)).toBe(true);
      expect(handler).toHaveBeenCalledTimes(3);
    });

    it('should return results for all events', async () => {
      const handler = jest.fn();
      registry.register('test.event', handler);

      const events = [
        Event.create('test.event', { id: 1 }),
        Event.create('test.event', { id: 2 }),
      ];

      const results = await dispatcher.dispatchBatch(events);

      expect(results).toHaveLength(2);
      results.forEach((result, i) => {
        expect(result.eventId).toBe(events[i].id.value);
      });
    });

    it('should handle empty batch', async () => {
      const results = await dispatcher.dispatchBatch([]);
      expect(results).toEqual([]);
    });

    it('should handle partial failures in batch', async () => {
      const handler1 = jest.fn(() => { throw new Error('Error'); });
      const handler2 = jest.fn();
      registry.register('event1', handler1);
      registry.register('event2', handler2);

      const events = [
        Event.create('event1', {}),
        Event.create('event2', {}),
      ];

      const results = await dispatcher.dispatchBatch(events);

      expect(results[0].success).toBe(false);
      expect(results[1].success).toBe(true);
    });
  });

  describe('middleware', () => {
    it('should execute middleware before handlers', async () => {
      let middlewareExecuted = false;
      let handlerExecuted = false;

      const middleware = async (event: Event, next: () => Promise<void>) => {
        middlewareExecuted = true;
        await next();
      };

      const handler = jest.fn(() => {
        handlerExecuted = true;
      });

      dispatcher.addMiddleware(middleware);
      registry.register('test.event', handler);

      const event = Event.create('test.event', {});
      await dispatcher.dispatch(event);

      expect(middlewareExecuted).toBe(true);
      expect(handlerExecuted).toBe(true);
    });

    it('should execute middleware in order', async () => {
      const order: number[] = [];

      const middleware1 = async (event: Event, next: () => Promise<void>) => {
        order.push(1);
        await next();
      };

      const middleware2 = async (event: Event, next: () => Promise<void>) => {
        order.push(2);
        await next();
      };

      const middleware3 = async (event: Event, next: () => Promise<void>) => {
        order.push(3);
        await next();
      };

      dispatcher.addMiddleware(middleware1);
      dispatcher.addMiddleware(middleware2);
      dispatcher.addMiddleware(middleware3);

      registry.register('test.event', jest.fn());

      const event = Event.create('test.event', {});
      await dispatcher.dispatch(event);

      expect(order).toEqual([1, 2, 3]);
    });

    it('should allow middleware to block execution', async () => {
      const handler = jest.fn();
      const middleware = async (event: Event, next: () => Promise<void>) => {
        // Don't call next()
      };

      dispatcher.addMiddleware(middleware);
      registry.register('test.event', handler);

      const event = Event.create('test.event', {});
      await dispatcher.dispatch(event);

      expect(handler).not.toHaveBeenCalled();
    });

    it('should handle middleware errors', async () => {
      const handler = jest.fn();
      const middleware = async (event: Event, next: () => Promise<void>) => {
        throw new Error('Middleware error');
      };

      dispatcher.addMiddleware(middleware);
      registry.register('test.event', handler);

      const event = Event.create('test.event', {});
      const result = await dispatcher.dispatch(event);

      expect(result.success).toBe(false);
      expect(handler).not.toHaveBeenCalled();
    });

    it('should remove middleware', async () => {
      let executed = false;
      const middleware = async (event: Event, next: () => Promise<void>) => {
        executed = true;
        await next();
      };

      dispatcher.addMiddleware(middleware);
      dispatcher.removeMiddleware(middleware);

      registry.register('test.event', jest.fn());

      const event = Event.create('test.event', {});
      await dispatcher.dispatch(event);

      expect(executed).toBe(false);
    });
  });

  describe('edge cases', () => {
    it('should handle dispatching many events', async () => {
      const handler = jest.fn();
      registry.register('test.event', handler);

      const events = Array.from({ length: 100 }, (_, i) =>
        Event.create('test.event', { id: i })
      );

      const results = await dispatcher.dispatchBatch(events);

      expect(results).toHaveLength(100);
      expect(results.every(r => r.success)).toBe(true);
    });

    it('should handle event with complex payload', async () => {
      const handler = jest.fn();
      registry.register('test.event', handler);

      const complexPayload = {
        nested: { deep: { value: 42 } },
        array: [1, 2, 3],
      };
      const event = Event.create('test.event', complexPayload);

      await dispatcher.dispatch(event);

      expect(handler).toHaveBeenCalledWith(event);
    });

    it('should handle handler that throws non-Error', async () => {
      const handler = jest.fn(() => { throw 'string error'; });
      registry.register('test.event', handler);

      const event = Event.create('test.event', {});
      const result = await dispatcher.dispatch(event);

      expect(result.success).toBe(false);
      expect(result.errors).toBeDefined();
    });

    it('should handle mix of sync and async handlers', async () => {
      const syncHandler = jest.fn();
      const asyncHandler = jest.fn().mockResolvedValue(undefined);
      registry.register('test.event', syncHandler);
      registry.register('test.event', asyncHandler);

      const event = Event.create('test.event', {});
      const result = await dispatcher.dispatch(event);

      expect(result.success).toBe(true);
      expect(result.handlersSucceeded).toBe(2);
    });
  });
});
