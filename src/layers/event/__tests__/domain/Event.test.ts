/**
 * Event Unit Tests
 * 
 * Comprehensive tests for Event domain entity.
 * Tests cover creation, validation, correlation, causation, and edge cases.
 */

import { Event, EventOptions } from '../../domain/entities/Event';
import { EventId } from '../../domain/value-objects/EventId';
import { EventType } from '../../domain/value-objects/EventType';
import { EventMetadata } from '../../domain/value-objects/EventMetadata';
import { EventPayload } from '../../domain/value-objects/EventPayload';

describe('Event', () => {
  describe('constructor', () => {
    it('should create event with required fields', () => {
      const event = new Event({
        type: 'user.created',
        payload: { userId: '123' },
      });

      expect(event.id).toBeDefined();
      expect(event.type.value).toBe('user.created');
      expect(event.payload.data).toEqual({ userId: '123' });
      expect(event.metadata).toBeDefined();
      expect(event.occurredAt).toBeInstanceOf(Date);
    });

    it('should create event with custom ID', () => {
      const customId = EventId.fromString('custom-id');
      const event = new Event({
        id: customId,
        type: 'user.created',
        payload: { userId: '123' },
      });

      expect(event.id.value).toBe('custom-id');
    });

    it('should accept EventType instance', () => {
      const eventType = new EventType('user.created');
      const event = new Event({
        type: eventType,
        payload: { userId: '123' },
      });

      expect(event.type.value).toBe('user.created');
    });

    it('should accept string type', () => {
      const event = new Event({
        type: 'user.created',
        payload: { userId: '123' },
      });

      expect(event.type.value).toBe('user.created');
    });

    it('should accept EventPayload instance', () => {
      const payload = new EventPayload({ userId: '123' });
      const event = new Event({
        type: 'user.created',
        payload,
      });

      expect(event.payload.data).toEqual({ userId: '123' });
    });

    it('should accept raw payload data', () => {
      const event = new Event({
        type: 'user.created',
        payload: { userId: '123' },
      });

      expect(event.payload.data).toEqual({ userId: '123' });
    });

    it('should accept custom metadata', () => {
      const metadata = EventMetadata.create('test-source');
      const event = new Event({
        type: 'user.created',
        payload: { userId: '123' },
        metadata,
      });

      expect(event.metadata.source).toBe('test-source');
    });

    it('should accept custom occurredAt', () => {
      const occurredAt = new Date('2024-01-01');
      const event = new Event({
        type: 'user.created',
        payload: { userId: '123' },
        occurredAt,
      });

      expect(event.occurredAt).toEqual(occurredAt);
    });

    it('should throw error if id is undefined', () => {
      expect(() => {
        new Event({
          id: undefined as any,
          type: 'user.created',
          payload: { userId: '123' },
        });
      }).toThrow('Event: id is required');
    });

    it('should throw error if type is undefined', () => {
      expect(() => {
        new Event({
          type: undefined as any,
          payload: { userId: '123' },
        });
      }).toThrow('Event: type is required');
    });

    it('should throw error if payload is undefined', () => {
      expect(() => {
        new Event({
          type: 'user.created',
          payload: undefined as any,
        });
      }).toThrow('Event: payload is required');
    });

    it('should throw error if metadata is undefined', () => {
      expect(() => {
        new Event({
          type: 'user.created',
          payload: { userId: '123' },
          metadata: undefined as any,
        });
      }).toThrow('Event: metadata is required');
    });

    it('should throw error if occurredAt is invalid', () => {
      expect(() => {
        new Event({
          type: 'user.created',
          payload: { userId: '123' },
          occurredAt: new Date('invalid') as any,
        });
      }).toThrow('Event: occurredAt must be a valid Date');
    });
  });

  describe('occurredBefore', () => {
    it('should return true if event occurred before other', () => {
      const event1 = new Event({
        type: 'test',
        payload: {},
        occurredAt: new Date('2024-01-01'),
      });
      const event2 = new Event({
        type: 'test',
        payload: {},
        occurredAt: new Date('2024-01-02'),
      });

      expect(event1.occurredBefore(event2)).toBe(true);
    });

    it('should return false if event occurred after other', () => {
      const event1 = new Event({
        type: 'test',
        payload: {},
        occurredAt: new Date('2024-01-02'),
      });
      const event2 = new Event({
        type: 'test',
        payload: {},
        occurredAt: new Date('2024-01-01'),
      });

      expect(event1.occurredBefore(event2)).toBe(false);
    });

    it('should return false if events occurred at same time', () => {
      const time = new Date('2024-01-01');
      const event1 = new Event({
        type: 'test',
        payload: {},
        occurredAt: time,
      });
      const event2 = new Event({
        type: 'test',
        payload: {},
        occurredAt: time,
      });

      expect(event1.occurredBefore(event2)).toBe(false);
    });
  });

  describe('occurredAfter', () => {
    it('should return true if event occurred after other', () => {
      const event1 = new Event({
        type: 'test',
        payload: {},
        occurredAt: new Date('2024-01-02'),
      });
      const event2 = new Event({
        type: 'test',
        payload: {},
        occurredAt: new Date('2024-01-01'),
      });

      expect(event1.occurredAfter(event2)).toBe(true);
    });

    it('should return false if event occurred before other', () => {
      const event1 = new Event({
        type: 'test',
        payload: {},
        occurredAt: new Date('2024-01-01'),
      });
      const event2 = new Event({
        type: 'test',
        payload: {},
        occurredAt: new Date('2024-01-02'),
      });

      expect(event1.occurredAfter(event2)).toBe(false);
    });
  });

  describe('isCorrelatedWith', () => {
    it('should return true for events with same correlation ID', () => {
      const correlationId = 'test-correlation';
      const metadata1 = new EventMetadata({ correlationId });
      const metadata2 = new EventMetadata({ correlationId });

      const event1 = new Event({
        type: 'test',
        payload: {},
        metadata: metadata1,
      });
      const event2 = new Event({
        type: 'test',
        payload: {},
        metadata: metadata2,
      });

      expect(event1.isCorrelatedWith(event2)).toBe(true);
    });

    it('should return false for events with different correlation IDs', () => {
      const metadata1 = new EventMetadata({ correlationId: 'id1' });
      const metadata2 = new EventMetadata({ correlationId: 'id2' });

      const event1 = new Event({
        type: 'test',
        payload: {},
        metadata: metadata1,
      });
      const event2 = new Event({
        type: 'test',
        payload: {},
        metadata: metadata2,
      });

      expect(event1.isCorrelatedWith(event2)).toBe(false);
    });
  });

  describe('withPayload', () => {
    it('should create new event with different payload', () => {
      const event = new Event({
        type: 'test',
        payload: { old: 'data' },
      });

      const newEvent = event.withPayload({ new: 'data' });

      expect(newEvent.payload.data).toEqual({ new: 'data' });
      expect(event.payload.data).toEqual({ old: 'data' });
    });

    it('should preserve other properties', () => {
      const event = new Event({
        type: 'test',
        payload: { old: 'data' },
      });

      const newEvent = event.withPayload({ new: 'data' });

      expect(newEvent.id.value).toBe(event.id.value);
      expect(newEvent.type.value).toBe(event.type.value);
      expect(newEvent.occurredAt).toEqual(event.occurredAt);
    });
  });

  describe('withMetadata', () => {
    it('should create new event with different metadata', () => {
      const event = new Event({
        type: 'test',
        payload: {},
      });

      const newMetadata = EventMetadata.create('new-source');
      const newEvent = event.withMetadata(newMetadata);

      expect(newEvent.metadata.source).toBe('new-source');
      expect(event.metadata.source).toBe('system');
    });

    it('should preserve other properties', () => {
      const event = new Event({
        type: 'test',
        payload: { data: 'test' },
      });

      const newMetadata = EventMetadata.create('new-source');
      const newEvent = event.withMetadata(newMetadata);

      expect(newEvent.id.value).toBe(event.id.value);
      expect(newEvent.type.value).toBe(event.type.value);
      expect(newEvent.payload.data).toEqual({ data: 'test' });
    });
  });

  describe('withCausationId', () => {
    it('should create new event with causation ID', () => {
      const event = new Event({
        type: 'test',
        payload: {},
      });

      const newEvent = event.withCausationId('cause-id');

      expect(newEvent.metadata.causationId).toBe('cause-id');
      expect(event.metadata.causationId).toBeUndefined();
    });

    it('should preserve correlation ID', () => {
      const correlationId = 'test-correlation';
      const metadata = new EventMetadata({ correlationId });
      const event = new Event({
        type: 'test',
        payload: {},
        metadata,
      });

      const newEvent = event.withCausationId('cause-id');

      expect(newEvent.metadata.correlationId).toBe(correlationId);
    });
  });

  describe('toPrimitive', () => {
    it('should convert to plain object', () => {
      const event = new Event({
        type: 'user.created',
        payload: { userId: '123' },
      });

      const primitive = event.toPrimitive();

      expect(primitive).toHaveProperty('id');
      expect(primitive).toHaveProperty('type');
      expect(primitive).toHaveProperty('payload');
      expect(primitive).toHaveProperty('metadata');
      expect(primitive).toHaveProperty('occurredAt');
      expect(primitive.id).toBe(event.id.value);
      expect(primitive.type).toBe(event.type.value);
      expect(primitive.payload).toEqual(event.payload.data);
    });
  });

  describe('toJSON', () => {
    it('should return primitive representation', () => {
      const event = new Event({
        type: 'user.created',
        payload: { userId: '123' },
      });

      const json = event.toJSON();

      expect(json).toEqual(event.toPrimitive());
    });
  });

  describe('toString', () => {
    it('should return JSON string', () => {
      const event = new Event({
        type: 'user.created',
        payload: { userId: '123' },
      });

      const str = event.toString();

      expect(typeof str).toBe('string');
      const parsed = JSON.parse(str);
      expect(parsed.type).toBe('user.created');
    });
  });

  describe('equals', () => {
    it('should return true for events with same ID', () => {
      const id = EventId.fromString('same-id');
      const event1 = new Event({
        id,
        type: 'type1',
        payload: {},
      });
      const event2 = new Event({
        id,
        type: 'type2',
        payload: {},
      });

      expect(event1.equals(event2)).toBe(true);
    });

    it('should return false for events with different IDs', () => {
      const event1 = new Event({
        type: 'test',
        payload: {},
      });
      const event2 = new Event({
        type: 'test',
        payload: {},
      });

      expect(event1.equals(event2)).toBe(false);
    });

    it('should return false for non-Event objects', () => {
      const event = new Event({
        type: 'test',
        payload: {},
      });
      expect(event.equals({} as any)).toBe(false);
    });
  });

  describe('create', () => {
    it('should create event with type and payload', () => {
      const event = Event.create('user.created', { userId: '123' });

      expect(event.type.value).toBe('user.created');
      expect(event.payload.data).toEqual({ userId: '123' });
      expect(event.id).toBeDefined();
      expect(event.metadata).toBeDefined();
    });
  });

  describe('fromPrimitive', () => {
    it('should create event from primitive object', () => {
      const primitive = {
        id: 'test-id',
        type: 'user.created',
        payload: { userId: '123' },
        metadata: {
          timestamp: new Date().toISOString(),
          source: 'test',
          correlationId: 'corr-id',
        },
        occurredAt: new Date().toISOString(),
      };

      const event = Event.fromPrimitive(primitive);

      expect(event.id.value).toBe('test-id');
      expect(event.type.value).toBe('user.created');
      expect(event.payload.data).toEqual({ userId: '123' });
    });
  });

  describe('edge cases', () => {
    it('should handle complex nested payload', () => {
      const payload = {
        user: {
          profile: {
            settings: {
              theme: 'dark',
            },
          },
        },
      };

      const event = Event.create('test', payload);
      expect(event.payload.data).toEqual(payload);
    });

    it('should handle array payload', () => {
      const payload = [1, 2, 3, 4, 5];
      const event = Event.create('test', payload);
      expect(event.payload.data).toEqual(payload);
    });

    it('should handle string payload', () => {
      const payload = 'test-string';
      const event = Event.create('test', payload);
      expect(event.payload.data).toBe(payload);
    });

    it('should handle number payload', () => {
      const payload = 42;
      const event = Event.create('test', payload);
      expect(event.payload.data).toBe(42);
    });

    it('should handle boolean payload', () => {
      const payload = true;
      const event = Event.create('test', payload);
      expect(event.payload.data).toBe(true);
    });

    it('should handle null payload', () => {
      const payload = null;
      const event = Event.create('test', payload);
      expect(event.payload.data).toBe(null);
    });

    it('should handle very long event type', () => {
      const longType = 'a'.repeat(100);
      const event = new Event({
        type: longType,
        payload: {},
      });
      expect(event.type.value).toBe(longType);
    });
  });
});
