# Testing Strategy

## Overview
The Event Layer follows a comprehensive testing strategy to ensure correctness, error handling, and performance of event-driven functionality. Tests are organized into unit tests, integration tests, and performance tests with specific coverage targets.

## Test Coverage Targets

### Coverage Goals
- **Minimum Coverage**: 95%
- **Target Coverage**: 99%+
- **Branch Coverage**: 90%+
- **Function Coverage**: 100%

### Coverage by Component
- **IEventBus Interface**: 100% (type validation)
- **EventBus Implementation**: 99%+
- **Subscription Manager**: 99%+
- **Async Publisher**: 99%+
- **Error Handler**: 99%+
- **Statistics Tracker**: 99%+

## Unit Tests

### Test Organization
```
src/layers/event/__tests__/
├── unit/
│   ├── event-bus/
│   │   ├── event-bus.test.ts
│   │   ├── event-publisher.test.ts
│   │   └── event-handler.test.ts
│   ├── subscription/
│   │   ├── subscription-manager.test.ts
│   │   ├── subscription-filter.test.ts
│   │   └── metadata-manager.test.ts
│   ├── async/
│   │   ├── async-event-bus.test.ts
│   │   ├── promise-executor.test.ts
│   │   └── retry-handler.test.ts
│   ├── error-handling/
│   │   ├── error-handler.test.ts
│   │   ├── non-blocking-handler.test.ts
│   │   └── statistics-tracker.test.ts
│   └── statistics/
│       ├── statistics-tracker.test.ts
│       ├── performance-tracker.test.ts
│       └── statistics-reporter.test.ts
```

### Unit Test Categories

#### 1. Event Bus Tests
```typescript
describe('Event Bus', () => {
  it('should subscribe and publish event', async () => {
    const config = createEventBusConfig();
    const bus = new EventBus(config);
    
    let receivedEvent: Event | null = null;
    bus.subscribe('testEvent', (event) => { receivedEvent = event; });
    
    const event = createTestEvent('testEvent');
    await bus.publish(event);
    
    expect(receivedEvent).not.toBeNull();
    expect(receivedEvent?.type).toBe('testEvent');
  });

  it('should call multiple handlers for same event', async () => {
    const config = createEventBusConfig();
    const bus = new EventBus(config);
    
    let callCount = 0;
    bus.subscribe('testEvent', () => { callCount++; });
    bus.subscribe('testEvent', () => { callCount++; });
    
    const event = createTestEvent('testEvent');
    await bus.publish(event);
    
    expect(callCount).toBe(2);
  });

  it('should unsubscribe handler', async () => {
    const config = createEventBusConfig();
    const bus = new EventBus(config);
    
    let callCount = 0;
    const subscriptionId = bus.subscribe('testEvent', () => { callCount++; });
    
    bus.unsubscribe(subscriptionId);
    
    const event = createTestEvent('testEvent');
    await bus.publish(event);
    
    expect(callCount).toBe(0);
  });
});
```

#### 2. Subscription Manager Tests
```typescript
describe('Subscription Manager', () => {
  it('should subscribe and return subscription ID', () => {
    const manager = new SubscriptionManager();
    
    const handler = (event: Event) => {};
    const subscriptionId = manager.subscribe('testEvent', handler);
    
    expect(subscriptionId).toBeDefined();
    expect(manager.getSubscriptionCount('testEvent')).toBe(1);
  });

  it('should subscribe once and auto-unsubscribe', async () => {
    const manager = new SubscriptionManager();
    
    let callCount = 0;
    const subscriptionId = manager.subscribeOnce('testEvent', () => { callCount++; });
    
    const event = createTestEvent('testEvent');
    await manager.executeHandler(manager.getSubscription(subscriptionId)!, event);
    await manager.executeHandler(manager.getSubscription(subscriptionId)!, event);
    
    expect(callCount).toBe(1);
  });

  it('should unsubscribe all subscriptions', () => {
    const manager = new SubscriptionManager();
    
    manager.subscribe('event1', () => {});
    manager.subscribe('event2', () => {});
    manager.subscribe('event1', () => {});
    
    const count = manager.unsubscribeAll();
    
    expect(count).toBe(3);
    expect(manager.getSubscriptionCount()).toBe(0);
  });
});
```

#### 3. Async Publishing Tests
```typescript
describe('Async Event Bus', () => {
  it('should publish events asynchronously', async () => {
    const config = createAsyncEventBusConfig({ parallel: true });
    const bus = new AsyncEventBus(config);
    
    let callCount = 0;
    bus.subscribe('testEvent', async () => { callCount++; await delay(10); });
    bus.subscribe('testEvent', async () => { callCount++; await delay(10); });
    
    const event = createTestEvent('testEvent');
    await bus.publishAsync(event);
    
    expect(callCount).toBe(2);
  });

  it('should respect queue size limit', async () => {
    const config = createAsyncEventBusConfig({ queueSizeLimit: 2 });
    const bus = new AsyncEventBus(config);
    
    let callCount = 0;
    for (let i = 0; i < 5; i++) {
      bus.subscribe('testEvent', async () => { callCount++; });
    }
    
    const event = createTestEvent('testEvent');
    await bus.publishAsync(event);
    
    expect(callCount).toBe(2);
  });
});
```

#### 4. Error Handler Tests
```typescript
describe('Error Handler', () => {
  it('should handle handler errors', () => {
    const logger = createMockLogger();
    const handler = new DefaultErrorHandler(logger);
    
    const subscription = createSubscription();
    const error = new Error('Test error');
    
    handler.handle(error, subscription);
    
    expect(handler.getErrorCount()).toBe(1);
    expect(logger.error).toHaveBeenCalled();
  });

  it('should reset error count', () => {
    const logger = createMockLogger();
    const handler = new DefaultErrorHandler(logger);
    
    handler.handle(new Error('Error 1'), createSubscription());
    handler.handle(new Error('Error 2'), createSubscription());
    
    handler.resetErrorCount();
    
    expect(handler.getErrorCount()).toBe(0);
  });
});
```

#### 5. Statistics Tracker Tests
```typescript
describe('Statistics Tracker', () => {
  it('should record publish statistics', () => {
    const tracker = new EventBusStatisticsTracker();
    
    tracker.recordPublish('event1');
    tracker.recordPublish('event1');
    tracker.recordPublish('event2');
    
    const stats = tracker.getStatistics();
    
    expect(stats.totalPublishes).toBe(3);
    expect(stats.publishesByEventType.get('event1')).toBe(2);
    expect(stats.publishesByEventType.get('event2')).toBe(1);
  });

  it('should record error statistics', () => {
    const tracker = new EventBusStatisticsTracker();
    
    tracker.recordError();
    tracker.recordError();
    
    const stats = tracker.getStatistics();
    
    expect(stats.totalErrors).toBe(2);
  });
});
```

## Integration Tests

### Full Event Bus Integration Tests
```typescript
describe('Event Bus Integration', () => {
  it('should handle complete event lifecycle', async () => {
    const config = createEventBusConfig();
    const bus = new EventBus(config);
    
    let receivedEvent: Event | null = null;
    const subscriptionId = bus.subscribe('testEvent', (event) => { receivedEvent = event; });
    
    const event = createTestEvent('testEvent', { data: 'test' });
    await bus.publish(event);
    
    expect(receivedEvent).not.toBeNull();
    expect(receivedEvent?.data).toBe('test');
    
    bus.unsubscribe(subscriptionId);
    expect(bus.getSubscriptionCount('testEvent')).toBe(0);
  });

  it('should track statistics across operations', async () => {
    const config = createEventBusConfig();
    const bus = new EventBus(config);
    
    bus.subscribe('event1', () => {});
    bus.subscribe('event2', () => {});
    
    await bus.publish(createTestEvent('event1'));
    await bus.publish(createTestEvent('event2'));
    
    const stats = bus.statisticsTracker.getStatistics();
    
    expect(stats.totalPublishes).toBe(2);
    expect(stats.totalSubscriptions).toBe(2);
  });
});
```

## Performance Tests

### Benchmark Tests
```typescript
describe('Performance Benchmarks', () => {
  it('should publish events within time limit', async () => {
    const config = createEventBusConfig({ async: false });
    const bus = new EventBus(config);
    
    bus.subscribe('testEvent', () => {});
    
    const start = Date.now();
    
    for (let i = 0; i < 1000; i++) {
      await bus.publish(createTestEvent('testEvent'));
    }
    
    const duration = Date.now() - start;
    expect(duration).toBeLessThan(100); // < 100ms for 1000 publishes
  });

  it('should handle concurrent subscriptions efficiently', async () => {
    const config = createAsyncEventBusConfig({ parallel: true });
    const bus = new AsyncEventBus(config);
    
    const start = Date.now();
    
    const promises = Array(100).fill(null).map((_, i) =>
      bus.subscribe(`event${i}`, async () => { await delay(1); })
    );
    
    await Promise.all(promises);
    
    const duration = Date.now() - start;
    expect(duration).toBeLessThan(100); // < 100ms for 100 subscriptions
  });
});
```

## Test Utilities

### Mock Helpers
```typescript
function createEventBusConfig(overrides?: Partial<EventBusConfig>): EventBusConfig {
  return {
    async: false,
    persistence: false,
    queueSizeLimit: 0,
    errorHandler: new DefaultErrorHandler(createMockLogger()),
    ...overrides
  };
}

function createAsyncEventBusConfig(overrides?: Partial<AsyncEventBusConfig>): AsyncEventBusConfig {
  return {
    async: true,
    persistence: false,
    queueSizeLimit: 0,
    errorHandler: new DefaultErrorHandler(createMockLogger()),
    parallel: true,
    timeout: 0,
    ...overrides
  };
}

function createTestEvent(type: string, data: any = {}): Event {
  return {
    type,
    data,
    timestamp: new Date(),
    id: crypto.randomUUID()
  };
}

function createSubscription(overrides?: Partial<Subscription>): Subscription {
  return {
    id: crypto.randomUUID(),
    eventType: 'testEvent',
    handler: () => {},
    once: false,
    createdAt: new Date(),
    metadata: new Map(),
    ...overrides
  };
}

function createMockLogger(): any {
  return {
    error: jest.fn(),
    info: jest.fn(),
    warn: jest.fn()
  };
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
```

## Running Tests

### Unit Tests
```bash
npm run test:unit -- src/layers/event
```

### Integration Tests
```bash
npm run test:integration -- src/layers/event
```

### Performance Tests
```bash
npm run test:performance -- src/layers/event
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
name: Event Tests

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
      - run: npm run test:unit -- src/layers/event
      - run: npm run test:integration -- src/layers/event
      - run: npm run test:performance -- src/layers/event
      - run: npm run test:coverage -- src/layers/event
      - uses: codecov/codecov-action@v3
```

## Best Practices

### Test Writing Guidelines
- Test all event bus operations
- Test subscription management
- Test async publishing
- Test error handling
- Test statistics tracking
- Maintain test independence

### Error Testing Guidelines
- Test handler error catching
- Test error statistics tracking
- Test non-blocking error handling
- Test error recovery strategies
- Test error logging

### Performance Testing Guidelines
- Test with high event volumes
- Test concurrent subscriptions
- Test async execution performance
- Monitor memory usage
- Test queue management
