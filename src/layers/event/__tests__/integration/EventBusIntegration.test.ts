/**
 * EventBus Integration Tests
 * 
 * Integration tests for EventBus with all layers working together.
 * Tests cover end-to-end event flow across Domain, Core, and Application layers.
 */

import { EventBus } from '../../core/implementations/EventBus';
import { EventDispatcher } from '../../application/services/EventDispatcher';
import { EventHandlerRegistry } from '../../application/services/EventHandlerRegistry';
import { MemoryEventStore } from '../../infrastructure/implementations/MemoryEventStore';
import { MemoryEventQueue } from '../../infrastructure/implementations/MemoryEventQueue';
import { ConsoleEventPublisher } from '../../infrastructure/implementations/ConsoleEventPublisher';
import { EventMetricsCollector } from '../../monitoring/EventMetricsCollector';
import { EventLogger, LogLevel } from '../../monitoring/EventLogger';
import { EventBusConfig } from '../../configuration/EventBusConfig';
import { Event } from '../../domain/entities/Event';
import { EventBuilder } from '../../utils/EventBuilder';
import { EventValidator } from '../../utils/EventValidator';

describe('EventBus Integration', () => {
  let eventBus: EventBus;
  let dispatcher: EventDispatcher;
  let registry: EventHandlerRegistry;
  let eventStore: MemoryEventStore;
  let eventQueue: MemoryEventQueue;
  let eventPublisher: ConsoleEventPublisher;
  let metricsCollector: EventMetricsCollector;
  let eventLogger: EventLogger;
  let eventValidator: EventValidator;
  let config: EventBusConfig;

  beforeEach(() => {
    config = EventBusConfig.default();
    registry = new EventHandlerRegistry();
    eventBus = new EventBus();
    dispatcher = new EventDispatcher(registry, eventBus);
    eventStore = new MemoryEventStore();
    eventQueue = new MemoryEventQueue();
    eventPublisher = new ConsoleEventPublisher();
    metricsCollector = new EventMetricsCollector();
    eventLogger = new EventLogger({ enableConsole: false });
    eventValidator = new EventValidator();
  });

  describe('End-to-End Event Flow', () => {
    it('should process event through all layers', async () => {
      const handler = jest.fn();
      registry.register('test.event', handler);

      const event = EventBuilder.create()
        .withType('test.event')
        .withPayload({ userId: '123' })
        .build();

      const result = await dispatcher.dispatch(event);

      expect(result.success).toBe(true);
      expect(handler).toHaveBeenCalledWith(event);
      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('should integrate with event store', async () => {
      const handler = jest.fn();
      registry.register('test.event', handler);

      const event = EventBuilder.create()
        .withType('test.event')
        .withPayload({ data: 'test' })
        .build();

      await eventStore.save(event);
      const retrieved = await eventStore.get(event.id.value);

      expect(retrieved).toBeDefined();
      expect(retrieved!.id.value).toBe(event.id.value);
    });

    it('should integrate with event queue', async () => {
      const event = EventBuilder.create()
        .withType('test.event')
        .withPayload({ data: 'test' })
        .build();

      await eventQueue.enqueue(event);
      const size = await eventQueue.size();

      expect(size).toBe(1);
    });

    it('should integrate with event publisher', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      const event = EventBuilder.create()
        .withType('test.event')
        .withPayload({ data: 'test' })
        .build();

      await eventPublisher.publish(event);

      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('should integrate with metrics collector', () => {
      metricsCollector.recordEventPublished('test.event');
      metricsCollector.recordEventHandled('test.event', 100);

      const metrics = metricsCollector.getMetrics();

      expect(metrics.totalEventsPublished).toBe(1);
      expect(metrics.totalEventsHandled).toBe(1);
      expect(metrics.avgProcessingTime).toBe(100);
    });

    it('should integrate with event logger', () => {
      eventLogger.info('Event published', { type: 'test.event' });

      const entries = eventLogger.getEntries();

      expect(entries).toHaveLength(1);
      expect(entries[0].message).toBe('Event published');
    });

    it('should integrate with event validator', () => {
      const event = EventBuilder.create()
        .withType('test.event')
        .withPayload({ data: 'test' })
        .build();

      const result = eventValidator.validate(event);

      expect(result.valid).toBe(true);
    });

    it('should integrate with configuration', () => {
      const customConfig = EventBusConfig.create({
        enableAsync: false,
        maxQueueSize: 500,
      });

      expect(customConfig.enableAsync).toBe(false);
      expect(customConfig.maxQueueSize).toBe(500);
    });
  });

  describe('Complex Event Flow Scenarios', () => {
    it('should handle event with multiple handlers across layers', async () => {
      const handler1 = jest.fn();
      const handler2 = jest.fn();
      const handler3 = jest.fn();

      registry.register('test.event', handler1, 1);
      registry.register('test.event', handler2, 3);
      registry.register('test.event', handler3, 2);

      const event = EventBuilder.create()
        .withType('test.event')
        .withPayload({ data: 'test' })
        .build();

      await dispatcher.dispatch(event);

      expect(handler1).toHaveBeenCalled();
      expect(handler2).toHaveBeenCalled();
      expect(handler3).toHaveBeenCalled();
    });

    it('should persist event before dispatching', async () => {
      const handler = jest.fn();
      registry.register('test.event', handler);

      const event = EventBuilder.create()
        .withType('test.event')
        .withPayload({ data: 'test' })
        .build();

      await eventStore.save(event);
      await dispatcher.dispatch(event);

      const retrieved = await eventStore.get(event.id.value);
      expect(retrieved).toBeDefined();
      expect(handler).toHaveBeenCalled();
    });

    it('should queue event for async processing', async () => {
      const event = EventBuilder.create()
        .withType('test.event')
        .withPayload({ data: 'test' })
        .build();

      await eventQueue.enqueue(event);
      const size = await eventQueue.size();

      expect(size).toBe(1);

      const dequeued = await eventQueue.dequeue();
      expect(dequeued).toBeDefined();
      expect(dequeued!.id.value).toBe(event.id.value);
    });

    it('should collect metrics during event processing', async () => {
      const handler = jest.fn(() => {
        metricsCollector.recordEventHandled('test.event', 50);
      });

      registry.register('test.event', handler);

      const event = EventBuilder.create()
        .withType('test.event')
        .withPayload({ data: 'test' })
        .build();

      metricsCollector.recordEventPublished('test.event');
      await dispatcher.dispatch(event);

      const metrics = metricsCollector.getMetrics();

      expect(metrics.totalEventsPublished).toBe(1);
      expect(metrics.totalEventsHandled).toBe(1);
    });

    it('should log event processing steps', () => {
      eventLogger.info('Event created');
      eventLogger.info('Event validated');
      eventLogger.info('Event dispatched');

      const entries = eventLogger.getEntries();

      expect(entries).toHaveLength(3);
      expect(entries[0].message).toBe('Event created');
      expect(entries[1].message).toBe('Event validated');
      expect(entries[2].message).toBe('Event dispatched');
    });

    it('should validate event before processing', () => {
      const event = EventBuilder.create()
        .withType('test.event')
        .withPayload({ data: 'test' })
        .build();

      const validationResult = eventValidator.validate(event);

      expect(validationResult.valid).toBe(true);

      if (validationResult.valid) {
        const handler = jest.fn();
        registry.register('test.event', handler);

        dispatcher.dispatch(event);

        expect(handler).toHaveBeenCalled();
      }
    });
  });

  describe('Error Handling Across Layers', () => {
    it('should handle handler errors and record metrics', async () => {
      const handler = jest.fn(() => {
        metricsCollector.recordEventHandled('test.event', 50);
        throw new Error('Handler error');
      });

      registry.register('test.event', handler);

      const event = EventBuilder.create()
        .withType('test.event')
        .withPayload({ data: 'test' })
        .build();

      metricsCollector.recordEventPublished('test.event');
      await dispatcher.dispatch(event);

      const metrics = metricsCollector.getMetrics();

      expect(metrics.totalEventsPublished).toBe(1);
    });

    it('should log errors during event processing', () => {
      eventLogger.error('Event processing failed', { error: 'Test error' });

      const entries = eventLogger.getEntries(LogLevel.ERROR);

      expect(entries).toHaveLength(1);
      expect(entries[0].message).toBe('Event processing failed');
    });

    it('should validate event and reject invalid events', () => {
      const invalidEvent = EventBuilder.create()
        .withType('test.event')
        .withPayload({ data: 'test' })
        .build();

      (invalidEvent as any).id = undefined;

      const validationResult = eventValidator.validate(invalidEvent);

      expect(validationResult.valid).toBe(false);
      expect(validationResult.errors.length).toBeGreaterThan(0);
    });
  });

  describe('Performance Across Layers', () => {
    it('should handle high volume of events', async () => {
      const handler = jest.fn();
      registry.register('test.event', handler);

      const eventCount = 100;
      const events = Array.from({ length: eventCount }, (_, i) =>
        EventBuilder.create()
          .withType('test.event')
          .withPayload({ index: i })
          .build()
      );

      const startTime = Date.now();

      for (const event of events) {
        await dispatcher.dispatch(event);
      }

      const endTime = Date.now();
      const duration = endTime - startTime;

      expect(handler).toHaveBeenCalledTimes(eventCount);
      expect(duration).toBeLessThan(5000);
    });

    it('should handle concurrent event processing', async () => {
      const handler = jest.fn();
      registry.register('test.event', handler);

      const eventCount = 50;
      const promises = Array.from({ length: eventCount }, (_, i) =>
        dispatcher.dispatch(
          EventBuilder.create()
            .withType('test.event')
            .withPayload({ index: i })
            .build()
        )
      );

      await Promise.all(promises);

      expect(handler).toHaveBeenCalledTimes(eventCount);
    });

    it('should maintain performance with metrics collection', async () => {
      const handler = jest.fn(() => {
        metricsCollector.recordEventHandled('test.event', Math.random() * 100);
      });

      registry.register('test.event', handler);

      const eventCount = 100;
      for (let i = 0; i < eventCount; i++) {
        metricsCollector.recordEventPublished('test.event');
        await dispatcher.dispatch(
          EventBuilder.create()
            .withType('test.event')
            .withPayload({ index: i })
            .build()
        );
      }

      const metrics = metricsCollector.getMetrics();

      expect(metrics.totalEventsPublished).toBe(eventCount);
      expect(metrics.totalEventsHandled).toBe(eventCount);
    });
  });

  describe('Configuration Integration', () => {
    it('should apply configuration to all components', () => {
      const customConfig = EventBusConfig.create({
        enableAsync: false,
        maxQueueSize: 500,
        enableMetrics: true,
        enableLogging: true,
      });

      expect(customConfig.enableAsync).toBe(false);
      expect(customConfig.maxQueueSize).toBe(500);
      expect(customConfig.enableMetrics).toBe(true);
      expect(customConfig.enableLogging).toBe(true);
    });

    it('should validate configuration before applying', () => {
      const invalidConfig = EventBusConfig.create({
        maxQueueSize: 0,
      });

      const validator = require('../../configuration/ConfigValidator').ConfigValidator;
      const configValidator = new validator();

      const result = configValidator.validate(invalidConfig);

      expect(result.valid).toBe(false);
    });
  });

  describe('Data Flow Integration', () => {
    it('should flow event data from creation to handler', async () => {
      const handler = jest.fn((event) => {
        return event.payload.data;
      });

      registry.register('test.event', handler);

      const payload = { userId: '123', action: 'login' };
      const event = EventBuilder.create()
        .withType('test.event')
        .withPayload(payload)
        .build();

      await dispatcher.dispatch(event);

      expect(handler).toHaveBeenCalledWith(event);
      expect(handler.mock.results[0].value).toEqual(payload);
    });

    it('should preserve event metadata through layers', async () => {
      const handler = jest.fn((event) => {
        return event.metadata;
      });

      registry.register('test.event', handler);

      const event = EventBuilder.create()
        .withType('test.event')
        .withPayload({})
        .withCorrelationId('test-corr-id')
        .withUserId('user-123')
        .build();

      await dispatcher.dispatch(event);

      const metadata = handler.mock.results[0].value;

      expect(metadata.correlationId).toBe('test-corr-id');
      expect(metadata.userId).toBe('user-123');
    });

    it('should serialize and deserialize events', () => {
      const serializer = require('../../utils/EventSerializer').EventSerializer;
      const eventSerializer = new serializer();

      const event = EventBuilder.create()
        .withType('test.event')
        .withPayload({ userId: '123' })
        .build();

      const serialized = eventSerializer.serialize(event);
      const deserialized = eventSerializer.deserialize(serialized);

      expect(deserialized.id.value).toBe(event.id.value);
      expect(deserialized.type.value).toBe(event.type.value);
      expect(deserialized.payload.data).toEqual(event.payload.data);
    });
  });
});
