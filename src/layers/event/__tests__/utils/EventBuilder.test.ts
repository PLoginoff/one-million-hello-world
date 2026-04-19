/**
 * EventBuilder Unit Tests
 * 
 * Comprehensive tests for EventBuilder utility.
 * Tests cover fluent API, event construction, and edge cases.
 */

import { EventBuilder } from '../../utils/EventBuilder';
import { Event } from '../../domain/entities/Event';
import { EventId } from '../../domain/value-objects/EventId';
import { EventType } from '../../domain/value-objects/EventType';
import { EventMetadata } from '../../domain/value-objects/EventMetadata';

describe('EventBuilder', () => {
  describe('create', () => {
    it('should create new builder instance', () => {
      const builder = EventBuilder.create();
      expect(builder).toBeInstanceOf(EventBuilder);
    });

    it('should create builder with type parameter', () => {
      const builder = EventBuilder.create<{ test: string }>();
      expect(builder).toBeInstanceOf(EventBuilder);
    });
  });

  describe('withId', () => {
    it('should set custom ID as string', () => {
      const event = EventBuilder.create()
        .withId('custom-id')
        .withType('test.event')
        .withPayload({})
        .build();

      expect(event.id.value).toBe('custom-id');
    });

    it('should set custom ID as EventId', () => {
      const customId = EventId.fromString('custom-id');
      const event = EventBuilder.create()
        .withId(customId)
        .withType('test.event')
        .withPayload({})
        .build();

      expect(event.id.value).toBe('custom-id');
    });

    it('should return builder instance for chaining', () => {
      const builder = EventBuilder.create().withId('custom-id');
      expect(builder).toBeInstanceOf(EventBuilder);
    });
  });

  describe('withType', () => {
    it('should set type as string', () => {
      const event = EventBuilder.create()
        .withType('test.event')
        .withPayload({})
        .build();

      expect(event.type.value).toBe('test.event');
    });

    it('should set type as EventType', () => {
      const eventType = new EventType('test.event');
      const event = EventBuilder.create()
        .withType(eventType)
        .withPayload({})
        .build();

      expect(event.type.value).toBe('test.event');
    });

    it('should return builder instance for chaining', () => {
      const builder = EventBuilder.create().withType('test.event');
      expect(builder).toBeInstanceOf(EventBuilder);
    });
  });

  describe('withPayload', () => {
    it('should set payload as raw data', () => {
      const payload = { userId: '123', action: 'login' };
      const event = EventBuilder.create()
        .withType('test.event')
        .withPayload(payload)
        .build();

      expect(event.payload.data).toEqual(payload);
    });

    it('should set payload as EventPayload', () => {
      const payload = { userId: '123' };
      const eventPayload = new EventPayload(payload);
      const event = EventBuilder.create()
        .withType('test.event')
        .withPayload(eventPayload)
        .build();

      expect(event.payload.data).toEqual(payload);
    });

    it('should return builder instance for chaining', () => {
      const builder = EventBuilder.create().withPayload({});
      expect(builder).toBeInstanceOf(EventBuilder);
    });
  });

  describe('withMetadata', () => {
    it('should set custom metadata', () => {
      const metadata = EventMetadata.create('test-source');
      const event = EventBuilder.create()
        .withType('test.event')
        .withPayload({})
        .withMetadata(metadata)
        .build();

      expect(event.metadata.source).toBe('test-source');
    });

    it('should return builder instance for chaining', () => {
      const metadata = EventMetadata.create('test');
      const builder = EventBuilder.create().withMetadata(metadata);
      expect(builder).toBeInstanceOf(EventBuilder);
    });
  });

  describe('withSource', () => {
    it('should set source in metadata', () => {
      const event = EventBuilder.create()
        .withType('test.event')
        .withPayload({})
        .withSource('custom-source')
        .build();

      expect(event.metadata.source).toBe('custom-source');
    });

    it('should preserve other metadata properties', () => {
      const metadata = EventMetadata.create('original');
      const event = EventBuilder.create()
        .withType('test.event')
        .withPayload({})
        .withMetadata(metadata)
        .withSource('new-source')
        .build();

      expect(event.metadata.source).toBe('new-source');
      expect(event.metadata.correlationId).toBe(metadata.correlationId);
    });

    it('should return builder instance for chaining', () => {
      const builder = EventBuilder.create().withSource('test');
      expect(builder).toBeInstanceOf(EventBuilder);
    });
  });

  describe('withCorrelationId', () => {
    it('should set correlation ID in metadata', () => {
      const event = EventBuilder.create()
        .withType('test.event')
        .withPayload({})
        .withCorrelationId('test-correlation')
        .build();

      expect(event.metadata.correlationId).toBe('test-correlation');
    });

    it('should preserve other metadata properties', () => {
      const metadata = EventMetadata.create('original');
      const event = EventBuilder.create()
        .withType('test.event')
        .withPayload({})
        .withMetadata(metadata)
        .withCorrelationId('new-correlation')
        .build();

      expect(event.metadata.correlationId).toBe('new-correlation');
      expect(event.metadata.source).toBe('original');
    });

    it('should return builder instance for chaining', () => {
      const builder = EventBuilder.create().withCorrelationId('test');
      expect(builder).toBeInstanceOf(EventBuilder);
    });
  });

  describe('withUserId', () => {
    it('should set user ID in metadata', () => {
      const event = EventBuilder.create()
        .withType('test.event')
        .withPayload({})
        .withUserId('user-123')
        .build();

      expect(event.metadata.userId).toBe('user-123');
    });

    it('should preserve other metadata properties', () => {
      const metadata = EventMetadata.create('original');
      const event = EventBuilder.create()
        .withType('test.event')
        .withPayload({})
        .withMetadata(metadata)
        .withUserId('user-456')
        .build();

      expect(event.metadata.userId).toBe('user-456');
      expect(event.metadata.source).toBe('original');
    });

    it('should return builder instance for chaining', () => {
      const builder = EventBuilder.create().withUserId('user-123');
      expect(builder).toBeInstanceOf(EventBuilder);
    });
  });

  describe('withTag', () => {
    it('should add tag to metadata', () => {
      const event = EventBuilder.create()
        .withType('test.event')
        .withPayload({})
        .withTag('key1', 'value1')
        .build();

      expect(event.metadata.getTag('key1')).toBe('value1');
    });

    it('should add multiple tags', () => {
      const event = EventBuilder.create()
        .withType('test.event')
        .withPayload({})
        .withTag('key1', 'value1')
        .withTag('key2', 'value2')
        .withTag('key3', 'value3')
        .build();

      expect(event.metadata.getTag('key1')).toBe('value1');
      expect(event.metadata.getTag('key2')).toBe('value2');
      expect(event.metadata.getTag('key3')).toBe('value3');
    });

    it('should update existing tag', () => {
      const event = EventBuilder.create()
        .withType('test.event')
        .withPayload({})
        .withTag('key1', 'value1')
        .withTag('key1', 'value2')
        .build();

      expect(event.metadata.getTag('key1')).toBe('value2');
    });

    it('should preserve other tags', () => {
      const event = EventBuilder.create()
        .withType('test.event')
        .withPayload({})
        .withTag('key1', 'value1')
        .withTag('key2', 'value2')
        .withTag('key1', 'new-value')
        .build();

      expect(event.metadata.getTag('key1')).toBe('new-value');
      expect(event.metadata.getTag('key2')).toBe('value2');
    });

    it('should return builder instance for chaining', () => {
      const builder = EventBuilder.create().withTag('key', 'value');
      expect(builder).toBeInstanceOf(EventBuilder);
    });
  });

  describe('withOccurredAt', () => {
    it('should set custom occurredAt', () => {
      const customTime = new Date('2024-01-01');
      const event = EventBuilder.create()
        .withType('test.event')
        .withPayload({})
        .withOccurredAt(customTime)
        .build();

      expect(event.occurredAt).toEqual(customTime);
    });

    it('should return builder instance for chaining', () => {
      const builder = EventBuilder.create().withOccurredAt(new Date());
      expect(builder).toBeInstanceOf(EventBuilder);
    });
  });

  describe('withCausationId', () => {
    it('should set causation ID in metadata', () => {
      const event = EventBuilder.create()
        .withType('test.event')
        .withPayload({})
        .withCausationId('cause-id')
        .build();

      expect(event.metadata.causationId).toBe('cause-id');
    });

    it('should preserve correlation ID', () => {
      const event = EventBuilder.create()
        .withType('test.event')
        .withPayload({})
        .withCorrelationId('corr-id')
        .withCausationId('cause-id')
        .build();

      expect(event.metadata.correlationId).toBe('corr-id');
      expect(event.metadata.causationId).toBe('cause-id');
    });

    it('should return builder instance for chaining', () => {
      const builder = EventBuilder.create().withCausationId('cause');
      expect(builder).toBeInstanceOf(EventBuilder);
    });
  });

  describe('build', () => {
    it('should build valid event with required fields', () => {
      const event = EventBuilder.create()
        .withType('test.event')
        .withPayload({ data: 'test' })
        .build();

      expect(event).toBeInstanceOf(Event);
      expect(event.type.value).toBe('test.event');
      expect(event.payload.data).toEqual({ data: 'test' });
    });

    it('should generate default ID if not set', () => {
      const event = EventBuilder.create()
        .withType('test.event')
        .withPayload({})
        .build();

      expect(event.id.value).toBeDefined();
      expect(event.id.value.length).toBeGreaterThan(0);
    });

    it('should generate default metadata if not set', () => {
      const event = EventBuilder.create()
        .withType('test.event')
        .withPayload({})
        .build();

      expect(event.metadata).toBeDefined();
      expect(event.metadata.source).toBe('system');
    });

    it('should generate default occurredAt if not set', () => {
      const before = Date.now();
      const event = EventBuilder.create()
        .withType('test.event')
        .withPayload({})
        .build();
      const after = Date.now();

      expect(event.occurredAt.getTime()).toBeGreaterThanOrEqual(before);
      expect(event.occurredAt.getTime()).toBeLessThanOrEqual(after);
    });

    it('should handle complex fluent chain', () => {
      const event = EventBuilder.create()
        .withId('custom-id')
        .withType('user.created')
        .withPayload({ userId: '123', name: 'John' })
        .withSource('api')
        .withCorrelationId('corr-123')
        .withUserId('user-123')
        .withTag('region', 'us-east')
        .withTag('version', 'v1')
        .withCausationId('cause-456')
        .withOccurredAt(new Date('2024-01-01'))
        .build();

      expect(event.id.value).toBe('custom-id');
      expect(event.type.value).toBe('user.created');
      expect(event.payload.data).toEqual({ userId: '123', name: 'John' });
      expect(event.metadata.source).toBe('api');
      expect(event.metadata.correlationId).toBe('corr-123');
      expect(event.metadata.userId).toBe('user-123');
      expect(event.metadata.getTag('region')).toBe('us-east');
      expect(event.metadata.getTag('version')).toBe('v1');
      expect(event.metadata.causationId).toBe('cause-456');
      expect(event.occurredAt).toEqual(new Date('2024-01-01'));
    });
  });

  describe('fromEvent', () => {
    it('should create builder from existing event', () => {
      const original = Event.create('test.event', { data: 'test' });
      const builder = EventBuilder.fromEvent(original);

      expect(builder).toBeInstanceOf(EventBuilder);
    });

    it('should preserve event properties', () => {
      const original = Event.create('test.event', { data: 'test' });
      const rebuilt = EventBuilder.fromEvent(original).build();

      expect(rebuilt.id.value).toBe(original.id.value);
      expect(rebuilt.type.value).toBe(original.type.value);
      expect(rebuilt.payload.data).toEqual(original.payload.data);
    });

    it('should allow modifying properties', () => {
      const original = Event.create('test.event', { data: 'test' });
      const modified = EventBuilder.fromEvent(original)
        .withPayload({ new: 'data' })
        .build();

      expect(modified.id.value).toBe(original.id.value);
      expect(modified.payload.data).toEqual({ new: 'data' });
    });

    it('should preserve metadata', () => {
      const original = Event.create('test.event', {}).withCorrelationId('corr-id');
      const rebuilt = EventBuilder.fromEvent(original).build();

      expect(rebuilt.metadata.correlationId).toBe('corr-id');
    });
  });

  describe('edge cases', () => {
    it('should handle empty payload', () => {
      const event = EventBuilder.create()
        .withType('test.event')
        .withPayload({})
        .build();

      expect(event.payload.data).toEqual({});
    });

    it('should handle null payload', () => {
      const event = EventBuilder.create()
        .withType('test.event')
        .withPayload(null)
        .build();

      expect(event.payload.data).toBe(null);
    });

    it('should handle array payload', () => {
      const event = EventBuilder.create()
        .withType('test.event')
        .withPayload([1, 2, 3])
        .build();

      expect(event.payload.data).toEqual([1, 2, 3]);
    });

    it('should handle string payload', () => {
      const event = EventBuilder.create()
        .withType('test.event')
        .withPayload('test-string')
        .build();

      expect(event.payload.data).toBe('test-string');
    });

    it('should handle number payload', () => {
      const event = EventBuilder.create()
        .withType('test.event')
        .withPayload(42)
        .build();

      expect(event.payload.data).toBe(42);
    });

    it('should handle boolean payload', () => {
      const event = EventBuilder.create()
        .withType('test.event')
        .withPayload(true)
        .build();

      expect(event.payload.data).toBe(true);
    });

    it('should handle very long type', () => {
      const longType = 'a'.repeat(100);
      const event = EventBuilder.create()
        .withType(longType)
        .withPayload({})
        .build();

      expect(event.type.value).toBe(longType);
    });

    it('should handle special characters in type', () => {
      const event = EventBuilder.create()
        .withType('event.with.dots')
        .withPayload({})
        .build();

      expect(event.type.value).toBe('event.with.dots');
    });

    it('should handle complex nested payload', () => {
      const complexPayload = {
        nested: {
          deep: {
            value: 42,
          },
        },
        array: [1, 2, 3],
      };
      const event = EventBuilder.create()
        .withType('test.event')
        .withPayload(complexPayload)
        .build();

      expect(event.payload.data).toEqual(complexPayload);
    });

    it('should handle building multiple events from same builder', () => {
      const builder = EventBuilder.create()
        .withType('test.event')
        .withPayload({});

      const event1 = builder.build();
      const event2 = builder.build();

      expect(event1.id.value).not.toBe(event2.id.value);
    });
  });
});
