/**
 * EventHandlerRegistry Unit Tests
 * 
 * Comprehensive tests for EventHandlerRegistry application service.
 * Tests cover registration, priority, discovery, and edge cases.
 */

import { EventHandlerRegistry } from '../../application/services/EventHandlerRegistry';
import { Event } from '../../domain/entities/Event';

describe('EventHandlerRegistry', () => {
  let registry: EventHandlerRegistry;

  beforeEach(() => {
    registry = new EventHandlerRegistry();
  });

  describe('register', () => {
    it('should register handler and return registration', () => {
      const handler = jest.fn();
      const registration = registry.register('test.event', handler);

      expect(registration).toBeDefined();
      expect(registration.eventType).toBe('test.event');
      expect(registration.handler).toBe(handler);
      expect(registration.priority).toBe(0);
      expect(registration.id).toBeDefined();
    });

    it('should register with custom priority', () => {
      const handler = jest.fn();
      const registration = registry.register('test.event', handler, 10);

      expect(registration.priority).toBe(10);
    });

    it('should generate unique registration IDs', () => {
      const handler = jest.fn();
      const reg1 = registry.register('test.event', handler);
      const reg2 = registry.register('test.event', handler);

      expect(reg1.id).not.toBe(reg2.id);
    });

    it('should increment total count', () => {
      const handler = jest.fn();
      expect(registry.count()).toBe(0);

      registry.register('event1', handler);
      expect(registry.count()).toBe(1);

      registry.register('event2', handler);
      expect(registry.count()).toBe(2);
    });

    it('should increment count by type', () => {
      const handler = jest.fn();
      registry.register('test.event', handler);

      expect(registry.countByType('test.event')).toBe(1);
    });

    it('should handle multiple registrations for same event type', () => {
      const handler = jest.fn();
      registry.register('test.event', handler, 1);
      registry.register('test.event', handler, 2);
      registry.register('test.event', handler, 3);

      expect(registry.countByType('test.event')).toBe(3);
    });

    it('should handle different event types', () => {
      const handler = jest.fn();
      registry.register('event1', handler);
      registry.register('event2', handler);
      registry.register('event3', handler);

      expect(registry.countByType('event1')).toBe(1);
      expect(registry.countByType('event2')).toBe(1);
      expect(registry.countByType('event3')).toBe(1);
    });

    it('should accept metadata in registration', () => {
      const handler = jest.fn();
      const registration = registry.register('test.event', handler, 0);

      expect(registration.metadata).toBeUndefined();
    });
  });

  describe('unregister', () => {
    it('should remove registration by ID', () => {
      const handler = jest.fn();
      const registration = registry.register('test.event', handler);

      expect(registry.count()).toBe(1);
      expect(registry.unregister(registration.id)).toBe(true);
      expect(registry.count()).toBe(0);
    });

    it('should return false for non-existent registration', () => {
      expect(registry.unregister('non-existent-id')).toBe(false);
    });

    it('should remove from event type index', () => {
      const handler = jest.fn();
      const registration = registry.register('test.event', handler);

      registry.unregister(registration.id);

      expect(registry.countByType('test.event')).toBe(0);
    });

    it('should handle unregistering one of multiple registrations', () => {
      const handler = jest.fn();
      const reg1 = registry.register('test.event', handler);
      const reg2 = registry.register('test.event', handler);

      registry.unregister(reg1.id);

      expect(registry.count()).toBe(1);
      expect(registry.countByType('test.event')).toBe(1);
    });
  });

  describe('get', () => {
    it('should return registrations for event type', () => {
      const handler = jest.fn();
      registry.register('test.event', handler);
      registry.register('test.event', handler);
      registry.register('other.event', handler);

      const registrations = registry.get('test.event');

      expect(registrations).toHaveLength(2);
    });

    it('should return empty array for event type with no registrations', () => {
      const registrations = registry.get('non-existent.event');
      expect(registrations).toEqual([]);
    });

    it('should return clones of registrations', () => {
      const handler = jest.fn();
      const registration = registry.register('test.event', handler);
      const registrations = registry.get('test.event');

      registrations[0].priority = 999;

      expect(registry.get('test.event')[0].priority).toBe(0);
    });
  });

  describe('getAll', () => {
    it('should return all registrations', () => {
      const handler = jest.fn();
      registry.register('event1', handler);
      registry.register('event2', handler);
      registry.register('event3', handler);

      const registrations = registry.getAll();

      expect(registrations).toHaveLength(3);
    });

    it('should return empty array when no registrations', () => {
      const registrations = registry.getAll();
      expect(registrations).toEqual([]);
    });

    it('should return clones of registrations', () => {
      const handler = jest.fn();
      const registration = registry.register('test.event', handler);
      const registrations = registry.getAll();

      registrations[0].priority = 999;

      expect(registry.getAll()[0].priority).toBe(0);
    });
  });

  describe('getByPriority', () => {
    it('should return registrations sorted by priority (descending)', () => {
      const handler = jest.fn();
      registry.register('test.event', handler, 1);
      registry.register('test.event', handler, 3);
      registry.register('test.event', handler, 2);

      const registrations = registry.getByPriority('test.event');

      expect(registrations[0].priority).toBe(3);
      expect(registrations[1].priority).toBe(2);
      expect(registrations[2].priority).toBe(1);
    });

    it('should handle same priority registrations', () => {
      const handler = jest.fn();
      registry.register('test.event', handler, 5);
      registry.register('test.event', handler, 5);
      registry.register('test.event', handler, 5);

      const registrations = registry.getByPriority('test.event');

      expect(registrations).toHaveLength(3);
      expect(registrations.every(r => r.priority === 5)).toBe(true);
    });

    it('should return empty array for event type with no registrations', () => {
      const registrations = registry.getByPriority('non-existent.event');
      expect(registrations).toEqual([]);
    });

    it('should handle negative priorities', () => {
      const handler = jest.fn();
      registry.register('test.event', handler, -5);
      registry.register('test.event', handler, 0);
      registry.register('test.event', handler, 5);

      const registrations = registry.getByPriority('test.event');

      expect(registrations[0].priority).toBe(5);
      expect(registrations[1].priority).toBe(0);
      expect(registrations[2].priority).toBe(-5);
    });
  });

  describe('clear', () => {
    it('should remove all registrations', () => {
      const handler = jest.fn();
      registry.register('event1', handler);
      registry.register('event2', handler);
      registry.register('event3', handler);

      registry.clear();

      expect(registry.count()).toBe(0);
      expect(registry.getAll()).toHaveLength(0);
    });

    it('should clear event type indexes', () => {
      const handler = jest.fn();
      registry.register('event1', handler);
      registry.register('event2', handler);

      registry.clear();

      expect(registry.countByType('event1')).toBe(0);
      expect(registry.countByType('event2')).toBe(0);
    });

    it('should handle clearing empty registry', () => {
      expect(() => registry.clear()).not.toThrow();
      expect(registry.count()).toBe(0);
    });
  });

  describe('count', () => {
    it('should return 0 for empty registry', () => {
      expect(registry.count()).toBe(0);
    });

    it('should return total registration count', () => {
      const handler = jest.fn();
      registry.register('event1', handler);
      registry.register('event2', handler);
      registry.register('event3', handler);

      expect(registry.count()).toBe(3);
    });
  });

  describe('countByType', () => {
    it('should return 0 for event type with no registrations', () => {
      expect(registry.countByType('non-existent.event')).toBe(0);
    });

    it('should return count for specific event type', () => {
      const handler = jest.fn();
      registry.register('event1', handler);
      registry.register('event1', handler);
      registry.register('event2', handler);

      expect(registry.countByType('event1')).toBe(2);
      expect(registry.countByType('event2')).toBe(1);
    });
  });

  describe('edge cases', () => {
    it('should handle registering many handlers', () => {
      const handler = jest.fn();
      const count = 10000;

      for (let i = 0; i < count; i++) {
        registry.register(`event${i}`, handler);
      }

      expect(registry.count()).toBe(count);
    });

    it('should handle unregistering many handlers', () => {
      const handler = jest.fn();
      const ids: string[] = [];

      for (let i = 0; i < 1000; i++) {
        const reg = registry.register(`event${i}`, handler);
        ids.push(reg.id);
      }

      for (const id of ids) {
        registry.unregister(id);
      }

      expect(registry.count()).toBe(0);
    });

    it('should handle very high priority values', () => {
      const handler = jest.fn();
      const registration = registry.register('test.event', handler, 999999);

      expect(registration.priority).toBe(999999);
    });

    it('should handle very low priority values', () => {
      const handler = jest.fn();
      const registration = registry.register('test.event', handler, -999999);

      expect(registration.priority).toBe(-999999);
    });

    it('should handle special characters in event type', () => {
      const handler = jest.fn();
      const registration = registry.register('event.with.dots', handler);

      expect(registration.eventType).toBe('event.with.dots');
      expect(registry.countByType('event.with.dots')).toBe(1);
    });

    it('should handle concurrent operations', async () => {
      const handler = jest.fn();
      const promises = [];

      for (let i = 0; i < 100; i++) {
        promises.push(
          new Promise(resolve => {
            setTimeout(() => {
              registry.register(`event${i}`, handler);
              resolve(null);
            }, Math.random() * 10);
          })
        );
      }

      await Promise.all(promises);

      expect(registry.count()).toBe(100);
    });
  });
});
