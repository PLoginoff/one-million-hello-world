/**
 * EventBus Unit Tests
 * 
 * Comprehensive tests for EventBus core implementation.
 * Tests cover subscription, publishing, async operations, and edge cases.
 */

import { EventBus } from '../../core/implementations/EventBus';
import { SubscriptionManager } from '../../core/implementations/SubscriptionManager';
import { ErrorHandler } from '../../core/implementations/ErrorHandler';
import { EventExecutor } from '../../core/implementations/EventExecutor';
import { Event } from '../../domain/entities/Event';

describe('EventBus', () => {
  let eventBus: EventBus;

  beforeEach(() => {
    eventBus = new EventBus();
  });

  describe('constructor', () => {
    it('should create with default components', () => {
      const bus = new EventBus();
      expect(bus).toBeDefined();
      expect(bus.getSubscriptionManager()).toBeInstanceOf(SubscriptionManager);
      expect(bus.getErrorHandler()).toBeInstanceOf(ErrorHandler);
      expect(bus.getExecutor()).toBeInstanceOf(EventExecutor);
    });

    it('should create with custom components', () => {
      const customManager = new SubscriptionManager();
      const customHandler = new ErrorHandler();
      const customExecutor = new EventExecutor(customHandler);

      const bus = new EventBus({
        subscriptionManager: customManager,
        errorHandler: customHandler,
        executor: customExecutor,
      });

      expect(bus.getSubscriptionManager()).toBe(customManager);
      expect(bus.getErrorHandler()).toBe(customHandler);
      expect(bus.getExecutor()).toBe(customExecutor);
    });
  });

  describe('subscribe', () => {
    it('should subscribe to event type', () => {
      const handler = jest.fn();
      const subscriptionId = eventBus.subscribe('test.event', handler);

      expect(subscriptionId).toBeDefined();
      expect(typeof subscriptionId).toBe('string');
      expect(eventBus.getSubscriptionCount()).toBe(1);
    });

    it('should call handler when event is published', () => {
      const handler = jest.fn();
      eventBus.subscribe('test.event', handler);

      const event = Event.create('test.event', { data: 'test' });
      eventBus.publish(event);

      expect(handler).toHaveBeenCalledWith(event);
      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('should return unique subscription IDs', () => {
      const handler = jest.fn();
      const id1 = eventBus.subscribe('test.event', handler);
      const id2 = eventBus.subscribe('test.event', handler);

      expect(id1).not.toBe(id2);
    });

    it('should handle multiple handlers for same event', () => {
      const handler1 = jest.fn();
      const handler2 = jest.fn();
      const handler3 = jest.fn();

      eventBus.subscribe('test.event', handler1);
      eventBus.subscribe('test.event', handler2);
      eventBus.subscribe('test.event', handler3);

      const event = Event.create('test.event', {});
      eventBus.publish(event);

      expect(handler1).toHaveBeenCalledTimes(1);
      expect(handler2).toHaveBeenCalledTimes(1);
      expect(handler3).toHaveBeenCalledTimes(1);
    });

    it('should not call handlers for different event types', () => {
      const handler = jest.fn();
      eventBus.subscribe('event1', handler);

      const event = Event.create('event2', {});
      eventBus.publish(event);

      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('once', () => {
    it('should subscribe handler that executes once', () => {
      const handler = jest.fn();
      eventBus.once('test.event', handler);

      const event = Event.create('test.event', {});
      eventBus.publish(event);
      eventBus.publish(event);

      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('should auto-unsubscribe after execution', () => {
      const handler = jest.fn();
      const subscriptionId = eventBus.once('test.event', handler);

      const event = Event.create('test.event', {});
      eventBus.publish(event);

      expect(eventBus.getSubscriptionCount()).toBe(0);
    });

    it('should return subscription ID', () => {
      const handler = jest.fn();
      const subscriptionId = eventBus.once('test.event', handler);

      expect(subscriptionId).toBeDefined();
    });
  });

  describe('unsubscribe', () => {
    it('should unsubscribe handler by ID', () => {
      const handler = jest.fn();
      const subscriptionId = eventBus.subscribe('test.event', handler);

      eventBus.unsubscribe(subscriptionId);

      const event = Event.create('test.event', {});
      eventBus.publish(event);

      expect(handler).not.toHaveBeenCalled();
      expect(eventBus.getSubscriptionCount()).toBe(0);
    });

    it('should handle unsubscribing non-existent ID', () => {
      expect(() => eventBus.unsubscribe('non-existent-id')).not.toThrow();
    });

    it('should only remove specific subscription', () => {
      const handler1 = jest.fn();
      const handler2 = jest.fn();
      const id1 = eventBus.subscribe('test.event', handler1);
      const id2 = eventBus.subscribe('test.event', handler2);

      eventBus.unsubscribe(id1);

      const event = Event.create('test.event', {});
      eventBus.publish(event);

      expect(handler1).not.toHaveBeenCalled();
      expect(handler2).toHaveBeenCalledTimes(1);
    });
  });

  describe('publish', () => {
    it('should publish event to subscribers', () => {
      const handler = jest.fn();
      eventBus.subscribe('test.event', handler);

      const event = Event.create('test.event', { data: 'test' });
      eventBus.publish(event);

      expect(handler).toHaveBeenCalledWith(event);
    });

    it('should publish to multiple subscribers', () => {
      const handler1 = jest.fn();
      const handler2 = jest.fn();
      eventBus.subscribe('test.event', handler1);
      eventBus.subscribe('test.event', handler2);

      const event = Event.create('test.event', {});
      eventBus.publish(event);

      expect(handler1).toHaveBeenCalledTimes(1);
      expect(handler2).toHaveBeenCalledTimes(1);
    });

    it('should handle handler errors gracefully', () => {
      const error = new Error('Handler error');
      const handler1 = jest.fn(() => { throw error; });
      const handler2 = jest.fn();
      eventBus.subscribe('test.event', handler1);
      eventBus.subscribe('test.event', handler2);

      const event = Event.create('test.event', {});
      expect(() => eventBus.publish(event)).not.toThrow();

      expect(handler2).toHaveBeenCalledTimes(1);
    });

    it('should record errors in error handler', () => {
      const handler = jest.fn(() => { throw new Error('Error'); });
      eventBus.subscribe('test.event', handler);

      const event = Event.create('test.event', {});
      eventBus.publish(event);

      expect(eventBus.getErrorHandler().getErrorCount()).toBe(1);
    });

    it('should handle no subscribers', () => {
      const event = Event.create('test.event', {});
      expect(() => eventBus.publish(event)).not.toThrow();
    });

    it('should execute handlers in order', () => {
      const order: number[] = [];
      const handler1 = jest.fn(() => { order.push(1); });
      const handler2 = jest.fn(() => { order.push(2); });
      const handler3 = jest.fn(() => { order.push(3); });

      eventBus.subscribe('test.event', handler1);
      eventBus.subscribe('test.event', handler2);
      eventBus.subscribe('test.event', handler3);

      const event = Event.create('test.event', {});
      eventBus.publish(event);

      expect(order).toEqual([1, 2, 3]);
    });
  });

  describe('publishAsync', () => {
    it('should publish event asynchronously', async () => {
      const handler = jest.fn().mockResolvedValue(undefined);
      eventBus.subscribe('test.event', handler);

      const event = Event.create('test.event', { data: 'test' });
      await eventBus.publishAsync(event);

      expect(handler).toHaveBeenCalledWith(event);
    });

    it('should await async handlers', async () => {
      let handlerExecuted = false;
      const handler = jest.fn(async () => {
        await new Promise(resolve => setTimeout(resolve, 10));
        handlerExecuted = true;
      });
      eventBus.subscribe('test.event', handler);

      const event = Event.create('test.event', {});
      await eventBus.publishAsync(event);

      expect(handlerExecuted).toBe(true);
    });

    it('should publish to multiple async subscribers', async () => {
      const handler1 = jest.fn().mockResolvedValue(undefined);
      const handler2 = jest.fn().mockResolvedValue(undefined);
      eventBus.subscribe('test.event', handler1);
      eventBus.subscribe('test.event', handler2);

      const event = Event.create('test.event', {});
      await eventBus.publishAsync(event);

      expect(handler1).toHaveBeenCalledTimes(1);
      expect(handler2).toHaveBeenCalledTimes(1);
    });

    it('should handle async handler errors', async () => {
      const error = new Error('Async error');
      const handler1 = jest.fn().mockRejectedValue(error);
      const handler2 = jest.fn().mockResolvedValue(undefined);
      eventBus.subscribe('test.event', handler1);
      eventBus.subscribe('test.event', handler2);

      const event = Event.create('test.event', {});
      await eventBus.publishAsync(event);

      expect(handler2).toHaveBeenCalledTimes(1);
      expect(eventBus.getErrorHandler().getErrorCount()).toBeGreaterThan(0);
    });

    it('should handle mix of sync and async handlers', async () => {
      const syncHandler = jest.fn();
      const asyncHandler = jest.fn().mockResolvedValue(undefined);
      eventBus.subscribe('test.event', syncHandler);
      eventBus.subscribe('test.event', asyncHandler);

      const event = Event.create('test.event', {});
      await eventBus.publishAsync(event);

      expect(syncHandler).toHaveBeenCalledTimes(1);
      expect(asyncHandler).toHaveBeenCalledTimes(1);
    });
  });

  describe('clear', () => {
    it('should clear all subscriptions', () => {
      eventBus.subscribe('event1', jest.fn());
      eventBus.subscribe('event2', jest.fn());
      eventBus.subscribe('event3', jest.fn());

      eventBus.clear();

      expect(eventBus.getSubscriptionCount()).toBe(0);
    });

    it('should handle clearing empty bus', () => {
      expect(() => eventBus.clear()).not.toThrow();
      expect(eventBus.getSubscriptionCount()).toBe(0);
    });
  });

  describe('getSubscriptionCount', () => {
    it('should return 0 for empty bus', () => {
      expect(eventBus.getSubscriptionCount()).toBe(0);
    });

    it('should return total subscription count', () => {
      eventBus.subscribe('event1', jest.fn());
      eventBus.subscribe('event2', jest.fn());
      eventBus.subscribe('event3', jest.fn());

      expect(eventBus.getSubscriptionCount()).toBe(3);
    });

    it('should update after unsubscribe', () => {
      const id = eventBus.subscribe('event1', jest.fn());
      expect(eventBus.getSubscriptionCount()).toBe(1);

      eventBus.unsubscribe(id);
      expect(eventBus.getSubscriptionCount()).toBe(0);
    });

    it('should update after once execution', () => {
      eventBus.once('event1', jest.fn());
      expect(eventBus.getSubscriptionCount()).toBe(1);

      const event = Event.create('event1', {});
      eventBus.publish(event);

      expect(eventBus.getSubscriptionCount()).toBe(0);
    });
  });

  describe('component access', () => {
    it('should provide access to subscription manager', () => {
      expect(eventBus.getSubscriptionManager()).toBeInstanceOf(SubscriptionManager);
    });

    it('should provide access to error handler', () => {
      expect(eventBus.getErrorHandler()).toBeInstanceOf(ErrorHandler);
    });

    it('should provide access to executor', () => {
      expect(eventBus.getExecutor()).toBeInstanceOf(EventExecutor);
    });
  });

  describe('edge cases', () => {
    it('should handle many subscriptions', () => {
      const handler = jest.fn();
      for (let i = 0; i < 1000; i++) {
        eventBus.subscribe(`event${i}`, handler);
      }

      expect(eventBus.getSubscriptionCount()).toBe(1000);
    });

    it('should handle publishing to many subscribers', () => {
      const handlers = Array.from({ length: 100 }, () => jest.fn());
      handlers.forEach(h => eventBus.subscribe('test.event', h));

      const event = Event.create('test.event', {});
      eventBus.publish(event);

      handlers.forEach(h => expect(h).toHaveBeenCalledTimes(1));
    });

    it('should handle async publishing to many subscribers', async () => {
      const handlers = Array.from({ length: 50 }, () => jest.fn().mockResolvedValue(undefined));
      handlers.forEach(h => eventBus.subscribe('test.event', h));

      const event = Event.create('test.event', {});
      await eventBus.publishAsync(event);

      handlers.forEach(h => expect(h).toHaveBeenCalledTimes(1));
    });

    it('should handle handler that throws non-Error', () => {
      const handler = jest.fn(() => { throw 'string error'; });
      eventBus.subscribe('test.event', handler);

      const event = Event.create('test.event', {});
      expect(() => eventBus.publish(event)).not.toThrow();
    });

    it('should handle event with complex payload', () => {
      const handler = jest.fn();
      eventBus.subscribe('test.event', handler);

      const complexPayload = {
        nested: { deep: { value: 42 } },
        array: [1, 2, 3],
        mixed: { str: 'test', num: 123, bool: true },
      };
      const event = Event.create('test.event', complexPayload);
      eventBus.publish(event);

      expect(handler).toHaveBeenCalledWith(event);
    });

    it('should handle rapid sequential publishes', () => {
      const handler = jest.fn();
      eventBus.subscribe('test.event', handler);

      for (let i = 0; i < 100; i++) {
        const event = Event.create('test.event', { index: i });
        eventBus.publish(event);
      }

      expect(handler).toHaveBeenCalledTimes(100);
    });
  });
});
