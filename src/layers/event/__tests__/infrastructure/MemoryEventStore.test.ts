/**
 * MemoryEventStore Unit Tests
 * 
 * Comprehensive tests for MemoryEventStore infrastructure implementation.
 * Tests cover event storage, retrieval, indexing, and edge cases.
 */

import { MemoryEventStore } from '../../infrastructure/implementations/MemoryEventStore';
import { Event } from '../../domain/entities/Event';

describe('MemoryEventStore', () => {
  let store: MemoryEventStore;

  beforeEach(() => {
    store = new MemoryEventStore();
  });

  describe('constructor', () => {
    it('should create with default options', () => {
      const newStore = new MemoryEventStore();
      expect(newStore).toBeDefined();
    });

    it('should create with custom max size', () => {
      const newStore = new MemoryEventStore({ maxSize: 100 });
      expect(newStore).toBeDefined();
    });

    it('should create with custom TTL', () => {
      const newStore = new MemoryEventStore({ ttl: 60000 });
      expect(newStore).toBeDefined();
    });
  });

  describe('save', () => {
    it('should save event', async () => {
      const event = Event.create('test.event', { data: 'test' });
      await store.save(event);

      const retrieved = await store.get(event.id.value);
      expect(retrieved).toBeDefined();
      expect(retrieved!.id.value).toBe(event.id.value);
    });

    it('should update type index', async () => {
      const event = Event.create('test.event', { data: 'test' });
      await store.save(event);

      const events = await store.getByType('test.event');
      expect(events).toHaveLength(1);
      expect(events[0].id.value).toBe(event.id.value);
    });

    it('should update correlation index', async () => {
      const event = Event.create('test.event', { data: 'test' });
      await store.save(event);

      const events = await store.getByCorrelationId(event.metadata.correlationId);
      expect(events).toHaveLength(1);
    });

    it('should handle saving same event multiple times', async () => {
      const event = Event.create('test.event', { data: 'test' });
      await store.save(event);
      await store.save(event);

      const count = await store.count();
      expect(count).toBe(1);
    });

    it('should handle saving multiple events', async () => {
      const event1 = Event.create('event1', {});
      const event2 = Event.create('event2', {});
      const event3 = Event.create('event3', {});

      await store.save(event1);
      await store.save(event2);
      await store.save(event3);

      const count = await store.count();
      expect(count).toBe(3);
    });
  });

  describe('saveBatch', () => {
    it('should save multiple events', async () => {
      const events = [
        Event.create('event1', {}),
        Event.create('event2', {}),
        Event.create('event3', {}),
      ];

      await store.saveBatch(events);

      const count = await store.count();
      expect(count).toBe(3);
    });

    it('should handle empty batch', async () => {
      await store.saveBatch([]);
      const count = await store.count();
      expect(count).toBe(0);
    });

    it('should handle single event batch', async () => {
      const events = [Event.create('event1', {})];
      await store.saveBatch(events);

      const count = await store.count();
      expect(count).toBe(1);
    });
  });

  describe('get', () => {
    it('should retrieve saved event', async () => {
      const event = Event.create('test.event', { data: 'test' });
      await store.save(event);

      const retrieved = await store.get(event.id.value);
      expect(retrieved).toBeDefined();
      expect(retrieved!.id.value).toBe(event.id.value);
    });

    it('should return undefined for non-existent event', async () => {
      const retrieved = await store.get('non-existent-id');
      expect(retrieved).toBeUndefined();
    });

    it('should return event with all properties', async () => {
      const event = Event.create('test.event', { data: 'test' });
      await store.save(event);

      const retrieved = await store.get(event.id.value);
      expect(retrieved!.type.value).toBe(event.type.value);
      expect(retrieved!.payload.data).toEqual(event.payload.data);
      expect(retrieved!.metadata.source).toBe(event.metadata.source);
    });
  });

  describe('getByType', () => {
    it('should return events of specific type', async () => {
      const event1 = Event.create('type1', {});
      const event2 = Event.create('type1', {});
      const event3 = Event.create('type2', {});

      await store.save(event1);
      await store.save(event2);
      await store.save(event3);

      const events = await store.getByType('type1');
      expect(events).toHaveLength(2);
    });

    it('should return empty array for non-existent type', async () => {
      const events = await store.getByType('non-existent');
      expect(events).toEqual([]);
    });

    it('should return events sorted by occurredAt', async () => {
      const event1 = Event.create('type1', {});
      await new Promise(resolve => setTimeout(resolve, 10));
      const event2 = Event.create('type1', {});
      await new Promise(resolve => setTimeout(resolve, 10));
      const event3 = Event.create('type1', {});

      await store.save(event1);
      await store.save(event2);
      await store.save(event3);

      const events = await store.getByType('type1');
      expect(events[0].occurredAt.getTime()).toBeLessThan(events[1].occurredAt.getTime());
      expect(events[1].occurredAt.getTime()).toBeLessThan(events[2].occurredAt.getTime());
    });
  });

  describe('getByCorrelationId', () => {
    it('should return events with same correlation ID', async () => {
      const correlationId = 'test-correlation';
      const event1 = Event.create('type1', {});
      const event2 = event1.withCausationId('cause1');
      const event3 = Event.create('type2', {});

      await store.save(event1);
      await store.save(event2);
      await store.save(event3);

      const events = await store.getByCorrelationId(correlationId);
      expect(events).toHaveLength(2);
    });

    it('should return empty array for non-existent correlation ID', async () => {
      const events = await store.getByCorrelationId('non-existent');
      expect(events).toEqual([]);
    });

    it('should return events sorted by occurredAt', async () => {
      const event1 = Event.create('type1', {});
      await new Promise(resolve => setTimeout(resolve, 10));
      const event2 = event1.withCausationId('cause1');

      await store.save(event1);
      await store.save(event2);

      const events = await store.getByCorrelationId(event1.metadata.correlationId);
      expect(events[0].occurredAt.getTime()).toBeLessThan(events[1].occurredAt.getTime());
    });
  });

  describe('getAll', () => {
    it('should return all events', async () => {
      const event1 = Event.create('event1', {});
      const event2 = Event.create('event2', {});
      const event3 = Event.create('event3', {});

      await store.save(event1);
      await store.save(event2);
      await store.save(event3);

      const events = await store.getAll();
      expect(events).toHaveLength(3);
    });

    it('should return empty array when no events', async () => {
      const events = await store.getAll();
      expect(events).toEqual([]);
    });

    it('should respect limit parameter', async () => {
      for (let i = 0; i < 10; i++) {
        await store.save(Event.create(`event${i}`, {}));
      }

      const events = await store.getAll(5);
      expect(events).toHaveLength(5);
    });

    it('should respect offset parameter', async () => {
      for (let i = 0; i < 10; i++) {
        await store.save(Event.create(`event${i}`, {}));
      }

      const events = await store.getAll(5, 5);
      expect(events).toHaveLength(5);
    });

    it('should return events sorted by occurredAt', async () => {
      const events = [];
      for (let i = 0; i < 5; i++) {
        events.push(Event.create('type', {}));
        await new Promise(resolve => setTimeout(resolve, 10));
        await store.save(events[i]);
      }

      const allEvents = await store.getAll();
      for (let i = 1; i < allEvents.length; i++) {
        expect(allEvents[i].occurredAt.getTime()).toBeGreaterThanOrEqual(
          allEvents[i - 1].occurredAt.getTime()
        );
      }
    });
  });

  describe('count', () => {
    it('should return 0 for empty store', async () => {
      const count = await store.count();
      expect(count).toBe(0);
    });

    it('should return total event count', async () => {
      await store.save(Event.create('event1', {}));
      await store.save(Event.create('event2', {}));
      await store.save(Event.create('event3', {}));

      const count = await store.count();
      expect(count).toBe(3);
    });
  });

  describe('countByType', () => {
    it('should return 0 for non-existent type', async () => {
      const count = await store.countByType('non-existent');
      expect(count).toBe(0);
    });

    it('should return count for specific type', async () => {
      await store.save(Event.create('type1', {}));
      await store.save(Event.create('type1', {}));
      await store.save(Event.create('type2', {}));

      const count = await store.countByType('type1');
      expect(count).toBe(2);
    });
  });

  describe('clear', () => {
    it('should clear all events', async () => {
      await store.save(Event.create('event1', {}));
      await store.save(Event.create('event2', {}));
      await store.save(Event.create('event3', {}));

      await store.clear();

      const count = await store.count();
      expect(count).toBe(0);
    });

    it('should clear type indexes', async () => {
      await store.save(Event.create('type1', {}));
      await store.save(Event.create('type2', {}));

      await store.clear();

      expect(await store.countByType('type1')).toBe(0);
      expect(await store.countByType('type2')).toBe(0);
    });

    it('should clear correlation indexes', async () => {
      const event = Event.create('type1', {});
      await store.save(event);

      await store.clear();

      const events = await store.getByCorrelationId(event.metadata.correlationId);
      expect(events).toHaveLength(0);
    });

    it('should handle clearing empty store', async () => {
      await expect(store.clear()).resolves.not.toThrow();
      const count = await store.count();
      expect(count).toBe(0);
    });
  });

  describe('exists', () => {
    it('should return true for existing event', async () => {
      const event = Event.create('test.event', {});
      await store.save(event);

      const exists = await store.exists(event.id.value);
      expect(exists).toBe(true);
    });

    it('should return false for non-existent event', async () => {
      const exists = await store.exists('non-existent-id');
      expect(exists).toBe(false);
    });
  });

  describe('max size limit', () => {
    it('should enforce max size limit', async () => {
      const limitedStore = new MemoryEventStore({ maxSize: 5 });

      for (let i = 0; i < 10; i++) {
        await limitedStore.save(Event.create(`event${i}`, {}));
      }

      const count = await limitedStore.count();
      expect(count).toBeLessThanOrEqual(5);
    });

    it('should remove oldest events when limit reached', async () => {
      const limitedStore = new MemoryEventStore({ maxSize: 3 });

      const event1 = Event.create('event1', {});
      await limitedStore.save(event1);
      await new Promise(resolve => setTimeout(resolve, 10));

      const event2 = Event.create('event2', {});
      await limitedStore.save(event2);
      await new Promise(resolve => setTimeout(resolve, 10));

      const event3 = Event.create('event3', {});
      await limitedStore.save(event3);
      await new Promise(resolve => setTimeout(resolve, 10));

      const event4 = Event.create('event4', {});
      await limitedStore.save(event4);

      const exists = await limitedStore.exists(event1.id.value);
      expect(exists).toBe(false);

      const count = await limitedStore.count();
      expect(count).toBe(3);
    });
  });

  describe('edge cases', () => {
    it('should handle saving many events', async () => {
      const count = 10000;
      for (let i = 0; i < count; i++) {
        await store.save(Event.create(`event${i}`, {}));
      }

      const total = await store.count();
      expect(total).toBe(count);
    });

    it('should handle events with complex payloads', async () => {
      const complexPayload = {
        nested: { deep: { value: 42 } },
        array: [1, 2, 3],
      };
      const event = Event.create('test.event', complexPayload);
      await store.save(event);

      const retrieved = await store.get(event.id.value);
      expect(retrieved!.payload.data).toEqual(complexPayload);
    });

    it('should handle events with special characters in type', async () => {
      const event = Event.create('event.with.dots-and_underscores', {});
      await store.save(event);

      const retrieved = await store.get(event.id.value);
      expect(retrieved).toBeDefined();
    });

    it('should handle concurrent saves', async () => {
      const promises = [];
      for (let i = 0; i < 100; i++) {
        promises.push(store.save(Event.create(`event${i}`, {})));
      }

      await Promise.all(promises);

      const count = await store.count();
      expect(count).toBe(100);
    });
  });
});
