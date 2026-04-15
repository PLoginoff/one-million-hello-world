/**
 * Event Bus Unit Tests
 * 
 * Tests for EventBus implementation.
 * Uses AAA pattern (Arrange, Act, Assert).
 */

import { EventBus } from '../implementations/EventBus';

describe('EventBus', () => {
  let eventBus: EventBus;

  beforeEach(() => {
    eventBus = new EventBus();
  });

  describe('getConfig', () => {
    it('should return default configuration', () => {
      const config = eventBus.getConfig();

      expect(config).toBeDefined();
      expect(config.enableAsync).toBe(true);
      expect(config.enablePersistence).toBe(false);
    });
  });

  describe('setConfig', () => {
    it('should update configuration', () => {
      const newConfig = {
        enableAsync: false,
        enablePersistence: true,
        maxQueueSize: 500,
      };

      eventBus.setConfig(newConfig);
      const config = eventBus.getConfig();

      expect(config.enableAsync).toBe(false);
      expect(config.enablePersistence).toBe(true);
    });
  });

  describe('subscribe and publish', () => {
    it('should subscribe and publish event', () => {
      const handler = jest.fn();
      eventBus.subscribe('test-event', handler);
      eventBus.publish('test-event', 'data');

      expect(handler).toHaveBeenCalledWith('data');
    });

    it('should call multiple handlers', () => {
      const handler1 = jest.fn();
      const handler2 = jest.fn();

      eventBus.subscribe('test-event', handler1);
      eventBus.subscribe('test-event', handler2);
      eventBus.publish('test-event', 'data');

      expect(handler1).toHaveBeenCalledWith('data');
      expect(handler2).toHaveBeenCalledWith('data');
    });
  });

  describe('once', () => {
    it('should subscribe once and auto-unsubscribe', () => {
      const handler = jest.fn();
      eventBus.once('test-event', handler);

      eventBus.publish('test-event', 'data1');
      eventBus.publish('test-event', 'data2');

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith('data1');
    });
  });

  describe('unsubscribe', () => {
    it('should unsubscribe handler', () => {
      const handler = jest.fn();
      const subId = eventBus.subscribe('test-event', handler);
      eventBus.unsubscribe(subId);
      eventBus.publish('test-event', 'data');

      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('publishAsync', () => {
    it('should publish event asynchronously', async () => {
      const handler = jest.fn().mockResolvedValue(undefined);
      eventBus.subscribe('test-event', handler);

      await eventBus.publishAsync('test-event', 'data');

      expect(handler).toHaveBeenCalledWith('data');
    });
  });

  describe('getStats', () => {
    it('should track statistics', () => {
      const handler = jest.fn();
      eventBus.subscribe('test-event', handler);
      eventBus.publish('test-event', 'data');

      const stats = eventBus.getStats();

      expect(stats.publishedCount).toBe(1);
      expect(stats.handledCount).toBe(1);
      expect(stats.subscriptionCount).toBe(1);
    });

    it('should track errors', () => {
      const handler = jest.fn(() => {
        throw new Error('Handler error');
      });
      eventBus.subscribe('test-event', handler);
      eventBus.publish('test-event', 'data');

      const stats = eventBus.getStats();

      expect(stats.errorCount).toBe(1);
    });
  });

  describe('clear', () => {
    it('should clear all subscriptions', () => {
      eventBus.subscribe('event1', jest.fn());
      eventBus.subscribe('event2', jest.fn());
      eventBus.clear();

      const stats = eventBus.getStats();
      expect(stats.subscriptionCount).toBe(0);
    });
  });
});
