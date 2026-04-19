/**
 * EventSerializer Unit Tests
 * 
 * Comprehensive tests for EventSerializer utility.
 * Tests cover serialization formats, round-trip conversion, and edge cases.
 */

import { EventSerializer } from '../../utils/EventSerializer';
import { Event } from '../../domain/entities/Event';

describe('EventSerializer', () => {
  let serializer: EventSerializer;

  beforeEach(() => {
    serializer = new EventSerializer();
  });

  describe('constructor', () => {
    it('should create with default JSON format', () => {
      expect(serializer).toBeDefined();
      expect(serializer.getFormat()).toBe('json');
    });

    it('should create with custom format', () => {
      const customSerializer = new EventSerializer('protobuf');
      expect(customSerializer.getFormat()).toBe('protobuf');
    });
  });

  describe('serialize', () => {
    it('should serialize event to JSON string', () => {
      const event = Event.create('test.event', { data: 'test' });
      const serialized = serializer.serialize(event);

      expect(typeof serialized).toBe('string');
      expect(serialized).toContain('test.event');
    });

    it('should include event ID in serialization', () => {
      const event = Event.create('test.event', {});
      const serialized = serializer.serialize(event);

      const parsed = JSON.parse(serialized);
      expect(parsed.id).toBe(event.id.value);
    });

    it('should include event type in serialization', () => {
      const event = Event.create('test.event', {});
      const serialized = serializer.serialize(event);

      const parsed = JSON.parse(serialized);
      expect(parsed.type).toBe('test.event');
    });

    it('should include payload in serialization', () => {
      const event = Event.create('test.event', { userId: '123' });
      const serialized = serializer.serialize(event);

      const parsed = JSON.parse(serialized);
      expect(parsed.payload).toEqual({ userId: '123' });
    });

    it('should include metadata in serialization', () => {
      const event = Event.create('test.event', {});
      const serialized = serializer.serialize(event);

      const parsed = JSON.parse(serialized);
      expect(parsed.metadata).toBeDefined();
    });

    it('should include occurredAt in serialization', () => {
      const event = Event.create('test.event', {});
      const serialized = serializer.serialize(event);

      const parsed = JSON.parse(serialized);
      expect(parsed.occurredAt).toBeDefined();
    });

    it('should handle complex payload', () => {
      const complexPayload = {
        nested: { deep: { value: 42 } },
        array: [1, 2, 3],
      };
      const event = Event.create('test.event', complexPayload);
      const serialized = serializer.serialize(event);

      const parsed = JSON.parse(serialized);
      expect(parsed.payload).toEqual(complexPayload);
    });

    it('should handle null payload', () => {
      const event = Event.create('test.event', null);
      const serialized = serializer.serialize(event);

      const parsed = JSON.parse(serialized);
      expect(parsed.payload).toBe(null);
    });

    it('should handle array payload', () => {
      const event = Event.create('test.event', [1, 2, 3]);
      const serialized = serializer.serialize(event);

      const parsed = JSON.parse(serialized);
      expect(parsed.payload).toEqual([1, 2, 3]);
    });
  });

  describe('deserialize', () => {
    it('should deserialize JSON string to event', () => {
      const event = Event.create('test.event', { data: 'test' });
      const serialized = serializer.serialize(event);

      const deserialized = serializer.deserialize(serialized);

      expect(deserialized).toBeInstanceOf(Event);
      expect(deserialized.id.value).toBe(event.id.value);
      expect(deserialized.type.value).toBe(event.type.value);
      expect(deserialized.payload.data).toEqual(event.payload.data);
    });

    it('should restore event ID', () => {
      const event = Event.create('test.event', {});
      const serialized = serializer.serialize(event);

      const deserialized = serializer.deserialize(serialized);

      expect(deserialized.id.value).toBe(event.id.value);
    });

    it('should restore event type', () => {
      const event = Event.create('test.event', {});
      const serialized = serializer.serialize(event);

      const deserialized = serializer.deserialize(serialized);

      expect(deserialized.type.value).toBe('test.event');
    });

    it('should restore payload', () => {
      const event = Event.create('test.event', { userId: '123' });
      const serialized = serializer.serialize(event);

      const deserialized = serializer.deserialize(serialized);

      expect(deserialized.payload.data).toEqual({ userId: '123' });
    });

    it('should restore metadata', () => {
      const event = Event.create('test.event', {});
      const serialized = serializer.serialize(event);

      const deserialized = serializer.deserialize(serialized);

      expect(deserialized.metadata.source).toBe(event.metadata.source);
    });

    it('should restore occurredAt', () => {
      const event = Event.create('test.event', {});
      const serialized = serializer.serialize(event);

      const deserialized = serializer.deserialize(serialized);

      expect(deserialized.occurredAt.getTime()).toBe(event.occurredAt.getTime());
    });

    it('should handle invalid JSON string', () => {
      expect(() => serializer.deserialize('invalid json')).toThrow();
    });
  });

  describe('serializeBatch', () => {
    it('should serialize multiple events', () => {
      const events = [
        Event.create('event1', { id: 1 }),
        Event.create('event2', { id: 2 }),
        Event.create('event3', { id: 3 }),
      ];

      const serialized = serializer.serializeBatch(events);

      expect(serialized).toHaveLength(3);
      expect(serialized.every(s => typeof s === 'string')).toBe(true);
    });

    it('should handle empty batch', () => {
      const serialized = serializer.serializeBatch([]);
      expect(serialized).toEqual([]);
    });

    it('should handle single event batch', () => {
      const events = [Event.create('event1', {})];
      const serialized = serializer.serializeBatch(events);

      expect(serialized).toHaveLength(1);
    });
  });

  describe('deserializeBatch', () => {
    it('should deserialize multiple events', () => {
      const events = [
        Event.create('event1', { id: 1 }),
        Event.create('event2', { id: 2 }),
        Event.create('event3', { id: 3 }),
      ];

      const serialized = serializer.serializeBatch(events);
      const deserialized = serializer.deserializeBatch(serialized);

      expect(deserialized).toHaveLength(3);
      expect(deserialized.every(e => e instanceof Event)).toBe(true);
    });

    it('should restore all events correctly', () => {
      const events = [
        Event.create('event1', { id: 1 }),
        Event.create('event2', { id: 2 }),
      ];

      const serialized = serializer.serializeBatch(events);
      const deserialized = serializer.deserializeBatch(serialized);

      expect(deserialized[0].id.value).toBe(events[0].id.value);
      expect(deserialized[1].id.value).toBe(events[1].id.value);
    });

    it('should handle empty batch', () => {
      const deserialized = serializer.deserializeBatch([]);
      expect(deserialized).toEqual([]);
    });
  });

  describe('setFormat', () => {
    it('should change serialization format', () => {
      serializer.setFormat('protobuf');
      expect(serializer.getFormat()).toBe('protobuf');
    });

    it('should accept all valid formats', () => {
      const formats = ['json', 'protobuf', 'msgpack'];

      for (const format of formats) {
        serializer.setFormat(format);
        expect(serializer.getFormat()).toBe(format);
      }
    });
  });

  describe('getFormat', () => {
    it('should return current format', () => {
      serializer.setFormat('msgpack');
      expect(serializer.getFormat()).toBe('msgpack');
    });
  });

  describe('round-trip conversion', () => {
    it('should preserve event data through serialize/deserialize', () => {
      const original = Event.create('test.event', {
        userId: '123',
        action: 'login',
        timestamp: Date.now(),
      });

      const serialized = serializer.serialize(original);
      const deserialized = serializer.deserialize(serialized);

      expect(deserialized.id.value).toBe(original.id.value);
      expect(deserialized.type.value).toBe(original.type.value);
      expect(deserialized.payload.data).toEqual(original.payload.data);
      expect(deserialized.metadata.source).toBe(original.metadata.source);
    });

    it('should preserve complex nested data', () => {
      const original = Event.create('test.event', {
        user: {
          profile: {
            settings: {
              theme: 'dark',
              language: 'en',
            },
          },
        },
      });

      const serialized = serializer.serialize(original);
      const deserialized = serializer.deserialize(serialized);

      expect(deserialized.payload.data).toEqual(original.payload.data);
    });

    it('should preserve array data', () => {
      const original = Event.create('test.event', [1, 2, 3, 4, 5]);

      const serialized = serializer.serialize(original);
      const deserialized = serializer.deserialize(serialized);

      expect(deserialized.payload.data).toEqual(original.payload.data);
    });

    it('should preserve null values', () => {
      const original = Event.create('test.event', null);

      const serialized = serializer.serialize(original);
      const deserialized = serializer.deserialize(serialized);

      expect(deserialized.payload.data).toBe(null);
    });
  });

  describe('edge cases', () => {
    it('should handle event with very large payload', () => {
      const largePayload = { data: 'a'.repeat(10000) };
      const event = Event.create('test.event', largePayload);

      const serialized = serializer.serialize(event);
      const deserialized = serializer.deserialize(serialized);

      expect(deserialized.payload.data).toEqual(largePayload);
    });

    it('should handle event with special characters', () => {
      const specialPayload = { data: 'test\n\t\r' };
      const event = Event.create('test.event', specialPayload);

      const serialized = serializer.serialize(event);
      const deserialized = serializer.deserialize(serialized);

      expect(deserialized.payload.data).toEqual(specialPayload);
    });

    it('should handle event with unicode characters', () => {
      const unicodePayload = { data: 'тест' };
      const event = Event.create('test.event', unicodePayload);

      const serialized = serializer.serialize(event);
      const deserialized = serializer.deserialize(serialized);

      expect(deserialized.payload.data).toEqual(unicodePayload);
    });

    it('should handle serializing many events', () => {
      const events = Array.from({ length: 1000 }, (_, i) =>
        Event.create(`event${i}`, { id: i })
      );

      const serialized = serializer.serializeBatch(events);
      const deserialized = serializer.deserializeBatch(serialized);

      expect(deserialized).toHaveLength(1000);
    });

    it('should handle event with boolean payload', () => {
      const event = Event.create('test.event', true);

      const serialized = serializer.serialize(event);
      const deserialized = serializer.deserialize(serialized);

      expect(deserialized.payload.data).toBe(true);
    });

    it('should handle event with number payload', () => {
      const event = Event.create('test.event', 42.5);

      const serialized = serializer.serialize(event);
      const deserialized = serializer.deserialize(serialized);

      expect(deserialized.payload.data).toBe(42.5);
    });

    it('should handle event with empty object payload', () => {
      const event = Event.create('test.event', {});

      const serialized = serializer.serialize(event);
      const deserialized = serializer.deserialize(serialized);

      expect(deserialized.payload.data).toEqual({});
    });

    it('should handle event with empty array payload', () => {
      const event = Event.create('test.event', []);

      const serialized = serializer.serialize(event);
      const deserialized = serializer.deserialize(serialized);

      expect(deserialized.payload.data).toEqual([]);
    });
  });
});
