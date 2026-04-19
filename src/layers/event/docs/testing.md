# Testing Strategy

## Overview
The Event Layer follows a comprehensive testing strategy to ensure correctness, error handling, and performance of the 8-layer architecture. Tests are organized into unit tests, integration tests, and end-to-end tests with specific coverage targets.

## Test Coverage Targets

### Coverage Goals
- **Minimum Coverage**: 95%
- **Target Coverage**: 99%+
- **Branch Coverage**: 90%+
- **Function Coverage**: 100%

### Coverage by Layer
- **Domain Layer**: 99%+
- **Core Layer**: 99%+
- **Infrastructure Layer**: 99%+
- **Application Layer**: 99%+
- **Utils Layer**: 99%+
- **Monitoring Layer**: 99%+
- **Configuration Layer**: 99%+
- **Testing Layer**: 100%

## Unit Tests

### Test Organization
```
src/layers/event/__tests__/
├── domain/
│   ├── EventId.test.ts
│   ├── EventType.test.ts
│   ├── EventMetadata.test.ts
│   ├── EventPayload.test.ts
│   └── Event.test.ts
├── core/
│   ├── SubscriptionManager.test.ts
│   ├── ErrorHandler.test.ts
│   ├── EventExecutor.test.ts
│   └── EventBus.test.ts
├── infrastructure/
│   ├── MemoryEventStore.test.ts
│   ├── MemoryEventQueue.test.ts
│   └── ConsoleEventPublisher.test.ts
├── application/
│   ├── EventHandlerRegistry.test.ts
│   └── EventDispatcher.test.ts
├── utils/
│   ├── EventValidator.test.ts
│   ├── EventSerializer.test.ts
│   ├── IdGenerator.test.ts
│   └── EventBuilder.test.ts
├── monitoring/
│   ├── EventMetricsCollector.test.ts
│   └── EventLogger.test.ts
├── configuration/
│   ├── EventBusConfig.test.ts
│   ├── ConfigValidator.test.ts
│   └── ConfigLoader.test.ts
└── integration/
    └── EventBusIntegration.test.ts
```

### Unit Test Categories

#### 1. Domain Layer Tests
```typescript
describe('EventId', () => {
  it('should generate unique IDs', () => {
    const id1 = new EventId();
    const id2 = new EventId();
    expect(id1.value).not.toBe(id2.value);
  });

  it('should accept custom ID', () => {
    const id = EventId.fromString('custom-id-123');
    expect(id.value).toBe('custom-id-123');
  });

  it('should validate ID length', () => {
    expect(() => new EventId('short')).toThrow();
  });
});

describe('Event', () => {
  it('should create event with builder', () => {
    const event = EventBuilder.create()
      .withType('test.event')
      .withPayload({ data: 'test' })
      .build();
    expect(event.type.value).toBe('test.event');
  });

  it('should check correlation', () => {
    const event1 = Event.create('test.event', {});
    const event2 = event1.withCausationId('cause-1');
    expect(event1.isCorrelatedWith(event2)).toBe(true);
  });
});
```

#### 2. Core Layer Tests
```typescript
describe('EventBus', () => {
  it('should subscribe and publish', () => {
    const bus = new EventBus();
    const handler = jest.fn();
    bus.subscribe('test.event', handler);
    bus.publish(Event.create('test.event', {}));
    expect(handler).toHaveBeenCalled();
  });

  it('should handle async publishing', async () => {
    const bus = new EventBus();
    const handler = jest.fn();
    bus.subscribe('test.event', handler);
    await bus.publishAsync(Event.create('test.event', {}));
    expect(handler).toHaveBeenCalled();
  });
});

describe('SubscriptionManager', () => {
  it('should register handler with priority', () => {
    const manager = new SubscriptionManager();
    const handler = jest.fn();
    manager.register('test.event', handler, 10);
    expect(manager.countByType('test.event')).toBe(1);
  });
});
```

#### 3. Infrastructure Layer Tests
```typescript
describe('MemoryEventStore', () => {
  it('should save and retrieve events', async () => {
    const store = new MemoryEventStore();
    const event = Event.create('test.event', {});
    await store.save(event);
    const retrieved = await store.get(event.id.value);
    expect(retrieved).toBeDefined();
  });
});

describe('MemoryEventQueue', () => {
  it('should enqueue and dequeue events', async () => {
    const queue = new MemoryEventQueue();
    const event = Event.create('test.event', {});
    await queue.enqueue(event);
    const size = await queue.size();
    expect(size).toBe(1);
  });
});
```

#### 4. Application Layer Tests
```typescript
describe('EventDispatcher', () => {
  it('should dispatch event to handlers', async () => {
    const registry = new EventHandlerRegistry();
    const eventBus = new EventBus();
    const dispatcher = new EventDispatcher(registry, eventBus);
    const handler = jest.fn();
    registry.register('test.event', handler);
    const result = await dispatcher.dispatch(Event.create('test.event', {}));
    expect(result.success).toBe(true);
  });

  it('should support middleware', async () => {
    const registry = new EventHandlerRegistry();
    const eventBus = new EventBus();
    const dispatcher = new EventDispatcher(registry, eventBus);
    const middleware = jest.fn(async (event, next) => await next());
    dispatcher.addMiddleware(middleware);
    registry.register('test.event', jest.fn());
    await dispatcher.dispatch(Event.create('test.event', {}));
    expect(middleware).toHaveBeenCalled();
  });
});
```

#### 5. Utils Layer Tests
```typescript
describe('EventValidator', () => {
  it('should validate valid event', () => {
    const validator = new EventValidator();
    const event = Event.create('test.event', {});
    const result = validator.validate(event);
    expect(result.valid).toBe(true);
  });

  it('should detect invalid event', () => {
    const validator = new EventValidator();
    const event = Event.create('test.event', {});
    (event as any).id = undefined;
    const result = validator.validate(event);
    expect(result.valid).toBe(false);
  });
});

describe('EventBuilder', () => {
  it('should build event with fluent API', () => {
    const event = EventBuilder.create()
      .withType('test.event')
      .withPayload({ data: 'test' })
      .withCorrelationId('corr-123')
      .build();
    expect(event.metadata.correlationId).toBe('corr-123');
  });
});
```

## Integration Tests

### Full Event Bus Integration Tests
```typescript
describe('Event Bus Integration', () => {
  it('should process event through all layers', async () => {
    const registry = new EventHandlerRegistry();
    const eventBus = new EventBus();
    const dispatcher = new EventDispatcher(registry, eventBus);
    const handler = jest.fn();
    registry.register('test.event', handler);

    const event = EventBuilder.create()
      .withType('test.event')
      .withPayload({ data: 'test' })
      .build();

    const result = await dispatcher.dispatch(event);

    expect(result.success).toBe(true);
    expect(handler).toHaveBeenCalledWith(event);
  });

  it('should integrate with event store', async () => {
    const eventStore = new MemoryEventStore();
    const event = Event.create('test.event', {});
    await eventStore.save(event);
    const retrieved = await eventStore.get(event.id.value);
    expect(retrieved).toBeDefined();
  });

  it('should integrate with metrics collector', () => {
    const metrics = new EventMetricsCollector();
    metrics.recordEventPublished('test.event');
    metrics.recordEventHandled('test.event', 100);
    const result = metrics.getMetrics();
    expect(result.totalEventsPublished).toBe(1);
    expect(result.totalEventsHandled).toBe(1);
  });

  it('should handle complex event flow', async () => {
    const registry = new EventHandlerRegistry();
    const eventBus = new EventBus();
    const dispatcher = new EventDispatcher(registry, eventBus);
    const handler = jest.fn();
    registry.register('test.event', handler);

    const event = EventBuilder.create()
      .withType('test.event')
      .withPayload({ userId: '123' })
      .withCorrelationId('corr-123')
      .withUserId('user-123')
      .build();

    await dispatcher.dispatch(event);

    expect(handler).toHaveBeenCalledWith(event);
    expect(handler.mock.calls[0][0].metadata.correlationId).toBe('corr-123');
  });
});
```

## Performance Tests

### Benchmark Tests
```typescript
describe('Performance Benchmarks', () => {
  it('should handle high volume of events', async () => {
    const registry = new EventHandlerRegistry();
    const eventBus = new EventBus();
    const dispatcher = new EventDispatcher(registry, eventBus);
    const handler = jest.fn();
    registry.register('test.event', handler);

    const eventCount = 1000;
    const events = Array.from({ length: eventCount }, (_, i) =>
      Event.create('test.event', { index: i })
    );

    const startTime = Date.now();
    for (const event of events) {
      await dispatcher.dispatch(event);
    }
    const duration = Date.now() - startTime;

    expect(handler).toHaveBeenCalledTimes(eventCount);
    expect(duration).toBeLessThan(5000);
  });

  it('should handle concurrent event processing', async () => {
    const registry = new EventHandlerRegistry();
    const eventBus = new EventBus();
    const dispatcher = new EventDispatcher(registry, eventBus);
    const handler = jest.fn();
    registry.register('test.event', handler);

    const eventCount = 100;
    const promises = Array.from({ length: eventCount }, (_, i) =>
      dispatcher.dispatch(Event.create('test.event', { index: i }))
    );

    await Promise.all(promises);

    expect(handler).toHaveBeenCalledTimes(eventCount);
  });

  it('should maintain performance with metrics collection', async () => {
    const metrics = new EventMetricsCollector();
    const registry = new EventHandlerRegistry();
    const eventBus = new EventBus();
    const dispatcher = new EventDispatcher(registry, eventBus);
    const handler = jest.fn(() => {
      metrics.recordEventHandled('test.event', Math.random() * 100);
    });
    registry.register('test.event', handler);

    const eventCount = 1000;
    for (let i = 0; i < eventCount; i++) {
      metrics.recordEventPublished('test.event');
      await dispatcher.dispatch(Event.create('test.event', { index: i }));
    }

    const result = metrics.getMetrics();
    expect(result.totalEventsPublished).toBe(eventCount);
    expect(result.totalEventsHandled).toBe(eventCount);
  });
});
```

## Test Utilities

### Testing Layer Components
The Testing Layer provides utilities for testing:
- `MockEventBus`: Mock implementation of IEventBus for testing
- `TestEventFactory`: Factory for creating test events
- `EventTestHelpers`: Helper functions for event testing

```typescript
import { MockEventBus, TestEventFactory, EventTestHelpers } from './testing';

// Using MockEventBus
const mockBus = new MockEventBus();
const handler = jest.fn();
mockBus.subscribe('test.event', handler);
mockBus.publish(Event.create('test.event', {}));

// Using TestEventFactory
const factory = new TestEventFactory();
const event = factory.createEvent('test.event', { data: 'test' });
const events = factory.createBatch('test.event', 10);

// Using EventTestHelpers
const isSameEvent = EventTestHelpers.compareEvents(event1, event2);
const eventCopy = EventTestHelpers.cloneEvent(event);
```

### Test Helpers
```typescript
function createTestEvent(type: string, payload?: any): Event {
  return EventBuilder.create()
    .withType(type)
    .withPayload(payload || {})
    .build();
}

function createTestRegistry(): EventHandlerRegistry {
  return new EventHandlerRegistry();
}

function createTestDispatcher(): EventDispatcher {
  const registry = new EventHandlerRegistry();
  const eventBus = new EventBus();
  return new EventDispatcher(registry, eventBus);
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
```

## Running Tests

### Unit Tests
```bash
npm test -- src/layers/event/__tests__/domain
npm test -- src/layers/event/__tests__/core
npm test -- src/layers/event/__tests__/infrastructure
npm test -- src/layers/event/__tests__/application
npm test -- src/layers/event/__tests__/utils
npm test -- src/layers/event/__tests__/monitoring
npm test -- src/layers/event/__tests__/configuration
```

### Integration Tests
```bash
npm test -- src/layers/event/__tests__/integration
```

### All Tests
```bash
npm test -- src/layers/event
```

### Coverage Report
```bash
npm run test:coverage -- src/layers/event
```

## Continuous Integration

### GitHub Actions Workflow
```yaml
name: Event Layer Tests

on:
  pull_request:
    paths:
      - 'src/layers/event/**'

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm ci
      - run: npm test -- src/layers/event
      - run: npm run test:coverage -- src/layers/event
      - uses: codecov/codecov-action@v3
```

## Best Practices

### Test Writing Guidelines
- Test all layer components independently
- Test layer integration points
- Test error handling at each layer
- Test performance under load
- Maintain test independence
- Use Testing Layer utilities

### Layer-Specific Testing

#### Domain Layer
- Test value object validation
- Test entity invariants
- Test domain logic
- Test immutability

#### Core Layer
- Test subscription management
- Test event publishing
- Test error handling strategies
- Test execution modes

#### Infrastructure Layer
- Test persistence operations
- Test queue management
- Test external system integration
- Test connection handling

#### Application Layer
- Test event dispatching
- Test handler registration
- Test middleware execution
- Test retry policies

#### Utils Layer
- Test validation rules
- Test serialization formats
- Test ID generation strategies
- Test builder patterns

#### Monitoring Layer
- Test metrics collection
- Test logging levels
- Test time-series data
- Test performance impact

#### Configuration Layer
- Test configuration validation
- Test configuration loading
- Test environment variable parsing
- Test configuration merging

### Integration Testing Guidelines
- Test event flow across layers
- Test error propagation
- Test metrics collection integration
- Test logging integration
- Test configuration integration

### Performance Testing Guidelines
- Test high event volumes
- Test concurrent processing
- Test memory usage
- Test with metrics enabled/disabled
- Test with logging enabled/disabled
