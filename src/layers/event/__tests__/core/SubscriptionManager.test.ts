/**
 * SubscriptionManager Unit Tests
 * 
 * Comprehensive tests for SubscriptionManager core implementation.
 * Tests cover subscription lifecycle, indexing, statistics, and edge cases.
 */

import { SubscriptionManager } from '../../core/implementations/SubscriptionManager';
import { ISubscriptionManager, Subscription } from '../../core/interfaces';

describe('SubscriptionManager', () => {
  let manager: SubscriptionManager;

  beforeEach(() => {
    manager = new SubscriptionManager();
  });

  describe('add', () => {
    it('should add subscription and return it', () => {
      const handler = jest.fn();
      const subscription = manager.add('test.event', handler, false);

      expect(subscription).toBeDefined();
      expect(subscription.eventType).toBe('test.event');
      expect(subscription.handler).toBe(handler);
      expect(subscription.once).toBe(false);
      expect(subscription.id).toBeDefined();
      expect(subscription.createdAt).toBeInstanceOf(Date);
      expect(subscription.executionCount).toBe(0);
    });

    it('should add subscription with once flag', () => {
      const handler = jest.fn();
      const subscription = manager.add('test.event', handler, true);

      expect(subscription.once).toBe(true);
    });

    it('should generate unique IDs', () => {
      const handler = jest.fn();
      const sub1 = manager.add('test.event', handler, false);
      const sub2 = manager.add('test.event', handler, false);

      expect(sub1.id).not.toBe(sub2.id);
    });

    it('should increment subscription count', () => {
      const handler = jest.fn();
      expect(manager.count()).toBe(0);

      manager.add('test.event', handler, false);
      expect(manager.count()).toBe(1);

      manager.add('test.event', handler, false);
      expect(manager.count()).toBe(2);
    });

    it('should index by event type', () => {
      const handler = jest.fn();
      manager.add('test.event', handler, false);

      expect(manager.countByType('test.event')).toBe(1);
    });

    it('should handle multiple subscriptions for same event type', () => {
      const handler1 = jest.fn();
      const handler2 = jest.fn();
      const handler3 = jest.fn();

      manager.add('test.event', handler1, false);
      manager.add('test.event', handler2, false);
      manager.add('test.event', handler3, false);

      expect(manager.countByType('test.event')).toBe(3);
      expect(manager.count()).toBe(3);
    });

    it('should handle different event types', () => {
      const handler = jest.fn();

      manager.add('event1', handler, false);
      manager.add('event2', handler, false);
      manager.add('event3', handler, false);

      expect(manager.countByType('event1')).toBe(1);
      expect(manager.countByType('event2')).toBe(1);
      expect(manager.countByType('event3')).toBe(1);
      expect(manager.count()).toBe(3);
    });
  });

  describe('remove', () => {
    it('should remove subscription by ID', () => {
      const handler = jest.fn();
      const subscription = manager.add('test.event', handler, false);

      expect(manager.count()).toBe(1);
      expect(manager.remove(subscription.id)).toBe(true);
      expect(manager.count()).toBe(0);
    });

    it('should return false for non-existent subscription', () => {
      expect(manager.remove('non-existent-id')).toBe(false);
    });

    it('should remove from event type index', () => {
      const handler = jest.fn();
      const subscription = manager.add('test.event', handler, false);

      manager.remove(subscription.id);

      expect(manager.countByType('test.event')).toBe(0);
    });

    it('should remove event type from index when no subscriptions left', () => {
      const handler = jest.fn();
      const subscription = manager.add('test.event', handler, false);

      manager.remove(subscription.id);

      const subscriptions = manager.getByEventType('test.event');
      expect(subscriptions).toHaveLength(0);
    });

    it('should handle removing one of multiple subscriptions', () => {
      const handler = jest.fn();
      const sub1 = manager.add('test.event', handler, false);
      const sub2 = manager.add('test.event', handler, false);

      manager.remove(sub1.id);

      expect(manager.count()).toBe(1);
      expect(manager.countByType('test.event')).toBe(1);
    });
  });

  describe('get', () => {
    it('should return subscription by ID', () => {
      const handler = jest.fn();
      const subscription = manager.add('test.event', handler, false);

      const retrieved = manager.get(subscription.id);

      expect(retrieved).toBeDefined();
      expect(retrieved!.id).toBe(subscription.id);
      expect(retrieved!.eventType).toBe(subscription.eventType);
    });

    it('should return undefined for non-existent subscription', () => {
      expect(manager.get('non-existent-id')).toBeUndefined();
    });

    it('should return a clone of the subscription', () => {
      const handler = jest.fn();
      const subscription = manager.add('test.event', handler, false);
      const retrieved = manager.get(subscription.id)!;

      retrieved.executionCount = 100;

      expect(manager.get(subscription.id)!.executionCount).toBe(0);
    });
  });

  describe('getByEventType', () => {
    it('should return all subscriptions for event type', () => {
      const handler = jest.fn();
      manager.add('test.event', handler, false);
      manager.add('test.event', handler, false);
      manager.add('other.event', handler, false);

      const subscriptions = manager.getByEventType('test.event');

      expect(subscriptions).toHaveLength(2);
    });

    it('should return empty array for event type with no subscriptions', () => {
      const subscriptions = manager.getByEventType('non-existent.event');
      expect(subscriptions).toEqual([]);
    });

    it('should return subscriptions sorted by creation time', () => {
      const handler = jest.fn();
      const sub1 = manager.add('test.event', handler, false);
      await new Promise(resolve => setTimeout(resolve, 10));
      const sub2 = manager.add('test.event', handler, false);

      const subscriptions = manager.getByEventType('test.event');

      expect(subscriptions[0].id).toBe(sub1.id);
      expect(subscriptions[1].id).toBe(sub2.id);
    });

    it('should return clones of subscriptions', () => {
      const handler = jest.fn();
      const subscription = manager.add('test.event', handler, false);
      const subscriptions = manager.getByEventType('test.event');

      subscriptions[0].executionCount = 100;

      expect(manager.get(subscription.id)!.executionCount).toBe(0);
    });
  });

  describe('getAll', () => {
    it('should return all subscriptions', () => {
      const handler = jest.fn();
      manager.add('event1', handler, false);
      manager.add('event2', handler, false);
      manager.add('event3', handler, false);

      const subscriptions = manager.getAll();

      expect(subscriptions).toHaveLength(3);
    });

    it('should return empty array when no subscriptions', () => {
      const subscriptions = manager.getAll();
      expect(subscriptions).toEqual([]);
    });

    it('should return subscriptions sorted by creation time', () => {
      const handler = jest.fn();
      const sub1 = manager.add('event1', handler, false);
      await new Promise(resolve => setTimeout(resolve, 10));
      const sub2 = manager.add('event2', handler, false);

      const subscriptions = manager.getAll();

      expect(subscriptions[0].id).toBe(sub1.id);
      expect(subscriptions[1].id).toBe(sub2.id);
    });
  });

  describe('clear', () => {
    it('should remove all subscriptions', () => {
      const handler = jest.fn();
      manager.add('event1', handler, false);
      manager.add('event2', handler, false);
      manager.add('event3', handler, false);

      manager.clear();

      expect(manager.count()).toBe(0);
      expect(manager.getAll()).toHaveLength(0);
    });

    it('should clear event type indexes', () => {
      const handler = jest.fn();
      manager.add('event1', handler, false);
      manager.add('event2', handler, false);

      manager.clear();

      expect(manager.countByType('event1')).toBe(0);
      expect(manager.countByType('event2')).toBe(0);
    });

    it('should handle clearing empty manager', () => {
      expect(() => manager.clear()).not.toThrow();
      expect(manager.count()).toBe(0);
    });
  });

  describe('count', () => {
    it('should return 0 for empty manager', () => {
      expect(manager.count()).toBe(0);
    });

    it('should return total subscription count', () => {
      const handler = jest.fn();
      manager.add('event1', handler, false);
      manager.add('event2', handler, false);
      manager.add('event3', handler, false);

      expect(manager.count()).toBe(3);
    });
  });

  describe('countByType', () => {
    it('should return 0 for event type with no subscriptions', () => {
      expect(manager.countByType('non-existent.event')).toBe(0);
    });

    it('should return count for specific event type', () => {
      const handler = jest.fn();
      manager.add('event1', handler, false);
      manager.add('event1', handler, false);
      manager.add('event2', handler, false);

      expect(manager.countByType('event1')).toBe(2);
      expect(manager.countByType('event2')).toBe(1);
    });
  });

  describe('updateExecution', () => {
    it('should update execution count', () => {
      const handler = jest.fn();
      const subscription = manager.add('test.event', handler, false);

      expect(subscription.executionCount).toBe(0);

      manager.updateExecution(subscription.id);

      expect(manager.get(subscription.id)!.executionCount).toBe(1);
    });

    it('should update last executed at', () => {
      const handler = jest.fn();
      const subscription = manager.add('test.event', handler, false);

      expect(subscription.lastExecutedAt).toBeUndefined();

      manager.updateExecution(subscription.id);

      expect(manager.get(subscription.id)!.lastExecutedAt).toBeInstanceOf(Date);
    });

    it('should handle non-existent subscription', () => {
      expect(() => manager.updateExecution('non-existent-id')).not.toThrow();
    });

    it('should increment execution count on multiple updates', () => {
      const handler = jest.fn();
      const subscription = manager.add('test.event', handler, false);

      manager.updateExecution(subscription.id);
      manager.updateExecution(subscription.id);
      manager.updateExecution(subscription.id);

      expect(manager.get(subscription.id)!.executionCount).toBe(3);
    });
  });

  describe('edge cases', () => {
    it('should handle adding many subscriptions', () => {
      const handler = jest.fn();
      const count = 10000;

      for (let i = 0; i < count; i++) {
        manager.add(`event${i}`, handler, false);
      }

      expect(manager.count()).toBe(count);
    });

    it('should handle removing many subscriptions', () => {
      const handler = jest.fn();
      const ids: string[] = [];

      for (let i = 0; i < 1000; i++) {
        const sub = manager.add(`event${i}`, handler, false);
        ids.push(sub.id);
      }

      for (const id of ids) {
        manager.remove(id);
      }

      expect(manager.count()).toBe(0);
    });

    it('should handle special characters in event type', () => {
      const handler = jest.fn();
      const subscription = manager.add('event.with.dots', handler, false);

      expect(manager.countByType('event.with.dots')).toBe(1);
      expect(manager.getByEventType('event.with.dots')).toHaveLength(1);
    });

    it('should handle very long event type', () => {
      const handler = jest.fn();
      const longType = 'a'.repeat(1000);
      const subscription = manager.add(longType, handler, false);

      expect(manager.countByType(longType)).toBe(1);
    });

    it('should handle concurrent operations', async () => {
      const handler = jest.fn();
      const promises = [];

      for (let i = 0; i < 100; i++) {
        promises.push(
          new Promise(resolve => {
            setTimeout(() => {
              manager.add(`event${i}`, handler, false);
              resolve(null);
            }, Math.random() * 10);
          })
        );
      }

      await Promise.all(promises);

      expect(manager.count()).toBe(100);
    });
  });
});
