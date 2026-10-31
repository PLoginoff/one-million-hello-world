# Testing Strategy

## Overview
Event Layer tests cover all 8 sub-layers (domain, core, infrastructure, application, utils, monitoring, configuration, testing). Tests use `bun:test` under `src/layers/event/__tests__/`.

## Coverage Targets

- Minimum 95%, target 99%+; branch 90%+, functions 100%.

## Test Organization

```
src/layers/event/__tests__/
├── domain/          # Event, EventId, EventType, EventMetadata, EventPayload
├── core/            # EventBus, SubscriptionManager, ErrorHandler, EventExecutor
├── infrastructure/  # MemoryEventStore, MemoryEventQueue, ConsoleEventPublisher
├── application/     # EventHandlerRegistry, EventDispatcher
├── utils/           # EventValidator, EventSerializer, IdGenerator, EventBuilder
├── monitoring/      # EventMetricsCollector, EventLogger
├── configuration/   # EventBusConfig, ConfigValidator, ConfigLoader
└── integration/     # end-to-end EventBus flow
```

Plus flat files: `EventBus.test.ts`, `EventAdapters.test.ts`, `EventStrategies.test.ts`, `EventFactories.test.ts`, `EventHealthCheck.test.ts`, `EventMetrics.test.ts`, `EventErrors.test.ts`, `EventConfiguration.test.ts`, `InMemoryEventBusAdapter.test.ts`.

## Unit Test Examples

### Domain
```typescript
const id1 = new EventId(); const id2 = new EventId();
id1.value !== id2.value;                    // unique
EventId.fromString('custom-id-123').value;  // round-trip
EventBuilder.create().withType('test.event').withPayload({}).build().type.value; // 'test.event'
Event.create('test.event', {}).withCausationId('cause-1').isCorrelatedWith(parent); // correlation
```

### Core
```typescript
bus.subscribe('test.event', handler);
bus.publish(Event.create('test.event', {}));        // sync
await bus.publishAsync(Event.create('test.event', {})); // async
manager.register('test.event', handler, 10);        // priority order
```

### Infrastructure
`MemoryEventStore.save/get`, `MemoryEventQueue.enqueue/dequeue/size`.

### Application
```typescript
const dispatcher = new EventDispatcher(new EventHandlerRegistry(), new EventBus());
registry.register('test.event', handler);
await dispatcher.dispatch(event);                   // result.success
dispatcher.addMiddleware(async (e, next) => next()); // middleware chain
```

### Utils
`EventValidator.validate` (valid/invalid), `EventBuilder` fluent fields (`withCorrelationId`, `withUserId`), `EventSerializer` formats, `IdGenerator` strategies.

## Integration Tests

- Dispatch through `registry + bus + dispatcher` — `result.success`, handler receives the event.
- `MemoryEventStore` persistence round-trip.
- `EventMetricsCollector.recordEventPublished/Handled` → `getMetrics()` counters.
- Correlation/user metadata flows through `dispatch` to handlers.

## Performance Tests

- 1k sequential dispatches under ~5 s; 100 concurrent `Promise.all` dispatches all delivered.
- Metrics collection adds negligible overhead to dispatch.

## Test Utilities

Testing-layer helpers: `MockEventBus`, `TestEventFactory` (`createEvent`, `createBatch`), `EventTestHelpers` (`compareEvents`, `cloneEvent`).

```typescript
const event = TestEventFactory.createEvent('test.event', { data: 'x' });
const batch = TestEventFactory.createBatch('test.event', 10);
```

## Running Tests

```bash
bun test ./src/layers/event/
bun test ./src/layers/event/__tests__/core/EventBus.test.ts
bun test --coverage ./src/layers/event/
```

## Best Practices

- Test each layer's component in isolation and the seams between them.
- Cover error paths (`ErrorHandler`, failed handlers, invalid events) and priority ordering.
- Use `MockEventBus`/`TestEventFactory` instead of hand-rolled mocks where possible.
- Benchmark dispatch volume + metrics overhead; keep unit tests fast.
