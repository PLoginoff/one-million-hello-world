# Testing Strategy

## Overview
The Message Queue Layer follows a comprehensive testing strategy to ensure correctness, reliability, and performance of queue functionality. Tests are organized into unit tests, integration tests, and performance tests with specific coverage targets.

## Test Coverage Targets

### Coverage Goals
- **Minimum Coverage**: 95%
- **Target Coverage**: 99%+
- **Branch Coverage**: 90%+
- **Function Coverage**: 100%

### Coverage by Component
- **IMessageQueue Interface**: 100% (type validation)
- **MessageQueue Implementation**: 99%+
- **Queue Manager**: 99%+
- **Retry Handler**: 99%+
- **Dead Letter Queue Manager**: 99%+
- **Processing Controller**: 99%+
- **Statistics Tracker**: 99%+

## Unit Tests

### Test Organization
```
src/layers/message-queue/__tests__/
├── unit/
│   ├── queue/
│   │   ├── queue-manager.test.ts
│   │   ├── message-enqueuer.test.ts
│   │   └── message-dequeuer.test.ts
│   ├── retry/
│   │   ├── retry-handler.test.ts
│   │   ├── attempt-tracker.test.ts
│   │   └── retry-statistics.test.ts
│   ├── dead-letter/
│   │   ├── dead-letter-queue.test.ts
│   │   ├── statistics-tracker.test.ts
│   │   └── retrieval-manager.test.ts
│   ├── processing/
│   │   ├── processing-controller.test.ts
│   │   ├── handler-registry.test.ts
│   │   └── concurrency-manager.test.ts
│   └── statistics/
│       ├── statistics-tracker.test.ts
│       ├── performance-monitor.test.ts
│       └── statistics-reporter.test.ts
```

### Unit Test Categories

#### 1. Queue Manager Tests
```typescript
describe('Queue Manager', () => {
  it('should enqueue message', () => {
    const manager = new QueueManager(100);
    const message = createTestMessage();
    
    const success = manager.enqueue(message);
    
    expect(success).toBe(true);
    expect(manager.size()).toBe(1);
  });

  it('should reject enqueue when queue is full', () => {
    const manager = new QueueManager(1);
    manager.enqueue(createTestMessage());
    
    const success = manager.enqueue(createTestMessage());
    
    expect(success).toBe(false);
  });

  it('should dequeue message', () => {
    const manager = new QueueManager(100);
    const message = createTestMessage();
    manager.enqueue(message);
    
    const dequeued = manager.dequeue();
    
    expect(dequeued).toBe(message);
    expect(manager.size()).toBe(0);
  });

  it('should return null when queue is empty', () => {
    const manager = new QueueManager(100);
    
    const dequeued = manager.dequeue();
    
    expect(dequeued).toBeNull();
  });
});
```

#### 2. Retry Handler Tests
```typescript
describe('Retry Handler', () => {
  it('should retry on failure', async () => {
    const config = createRetryConfig({ maxRetries: 3 });
    const queueManager = new QueueManager(100);
    const handler = new RetryHandler(config, queueManager);
    
    let attempts = 0;
    const mockHandler = createMockHandler(() => {
      attempts++;
      if (attempts < 2) throw new Error('Transient error');
    });
    
    const message = createTestMessage();
    await handler.handleWithRetry(message, mockHandler);
    
    expect(attempts).toBe(2);
  });

  it('should fail after max retries', async () => {
    const config = createRetryConfig({ maxRetries: 2 });
    const queueManager = new QueueManager(100);
    const handler = new RetryHandler(config, queueManager);
    
    const mockHandler = createMockHandler(() => {
      throw new Error('Persistent error');
    });
    
    const message = createTestMessage();
    
    await expect(handler.handleWithRetry(message, mockHandler)).rejects.toThrow();
  });
});
```

#### 3. Dead Letter Queue Tests
```typescript
describe('Dead Letter Queue Manager', () => {
  it('should add failed message', () => {
    const manager = new DeadLetterQueueManager(100, true);
    const message = createTestMessage();
    const error = new Error('Test error');
    
    manager.add(message, error);
    
    expect(manager.size()).toBe(1);
  });

  it('should not add when disabled', () => {
    const manager = new DeadLetterQueueManager(100, false);
    const message = createTestMessage();
    const error = new Error('Test error');
    
    manager.add(message, error);
    
    expect(manager.size()).toBe(0);
  });

  it('should remove message', () => {
    const manager = new DeadLetterQueueManager(100, true);
    const message = createTestMessage();
    const error = new Error('Test error');
    
    manager.add(message, error);
    const removed = manager.remove(message.id);
    
    expect(removed).toBe(true);
    expect(manager.size()).toBe(0);
  });
});
```

#### 4. Processing Controller Tests
```typescript
describe('Processing Controller', () => {
  it('should start processing', () => {
    const queueManager = new QueueManager(100);
    const deadLetterManager = new DeadLetterQueueManager(100);
    const retryHandler = new RetryHandler(createRetryConfig(), queueManager);
    const controller = new ProcessingController(queueManager, deadLetterManager, retryHandler);
    
    controller.registerHandler(createMockHandler());
    controller.start(100);
    
    expect(controller.getState()).toBe(ProcessingState.PROCESSING);
    controller.stop();
  });

  it('should pause and resume processing', () => {
    const queueManager = new QueueManager(100);
    const deadLetterManager = new DeadLetterQueueManager(100);
    const retryHandler = new RetryHandler(createRetryConfig(), queueManager);
    const controller = new ProcessingController(queueManager, deadLetterManager, retryHandler);
    
    controller.registerHandler(createMockHandler());
    controller.start(100);
    controller.pause();
    
    expect(controller.getState()).toBe(ProcessingState.PAUSED);
    
    controller.resume(100);
    expect(controller.getState()).toBe(ProcessingState.PROCESSING);
    
    controller.stop();
  });
});
```

#### 5. Statistics Tracker Tests
```typescript
describe('Statistics Tracker', () => {
  it('should record processed message', () => {
    const tracker = new QueueStatisticsTracker();
    
    tracker.recordProcessed(100);
    
    const stats = tracker.getStatistics();
    expect(stats.processedCount).toBe(1);
    expect(stats.averageProcessingTime).toBe(100);
  });

  it('should record failed message', () => {
    const tracker = new QueueStatisticsTracker();
    
    tracker.recordFailed();
    
    const stats = tracker.getStatistics();
    expect(stats.failedCount).toBe(1);
  });
});
```

## Integration Tests

### Full Queue Integration Tests
```typescript
describe('Message Queue Integration', () => {
  it('should process message end-to-end', async () => {
    const queueManager = new QueueManager(100);
    const deadLetterManager = new DeadLetterQueueManager(100);
    const retryHandler = new RetryHandler(createRetryConfig(), queueManager);
    const controller = new ProcessingController(queueManager, deadLetterManager, retryHandler);
    
    let processedMessage: Message | null = null;
    controller.registerHandler(createMockHandler((msg) => { processedMessage = msg; }));
    
    const message = createTestMessage();
    queueManager.enqueue(message);
    
    await controller.processNextMessage();
    
    expect(processedMessage).not.toBeNull();
    expect(processedMessage?.id).toBe(message.id);
  });

  it('should move failed message to dead letter queue', async () => {
    const queueManager = new QueueManager(100);
    const deadLetterManager = new DeadLetterQueueManager(100);
    const retryHandler = new RetryHandler(createRetryConfig({ maxRetries: 1 }), queueManager);
    const controller = new ProcessingController(queueManager, deadLetterManager, retryHandler);
    
    controller.registerHandler(createMockHandler(() => { throw new Error('Handler error'); }));
    
    const message = createTestMessage();
    queueManager.enqueue(message);
    
    await controller.processNextMessage();
    
    expect(deadLetterManager.size()).toBe(1);
  });
});
```

## Performance Tests

### Benchmark Tests
```typescript
describe('Performance Benchmarks', () => {
  it('should enqueue messages within time limit', () => {
    const manager = new QueueManager(10000);
    const start = Date.now();
    
    for (let i = 0; i < 1000; i++) {
      manager.enqueue(createTestMessage());
    }
    
    const duration = Date.now() - start;
    expect(duration).toBeLessThan(100); // < 100ms for 1000 enqueues
  });

  it('should dequeue messages within time limit', () => {
    const manager = new QueueManager(10000);
    
    for (let i = 0; i < 1000; i++) {
      manager.enqueue(createTestMessage());
    }
    
    const start = Date.now();
    
    for (let i = 0; i < 1000; i++) {
      manager.dequeue();
    }
    
    const duration = Date.now() - start;
    expect(duration).toBeLessThan(100); // < 100ms for 1000 dequeues
  });

  it('should process messages efficiently', async () => {
    const queueManager = new QueueManager(10000);
    const deadLetterManager = new DeadLetterQueueManager(100);
    const retryHandler = new RetryHandler(createRetryConfig(), queueManager);
    const controller = new ProcessingController(queueManager, deadLetterManager, retryHandler);
    
    controller.registerHandler(createMockHandler());
    
    for (let i = 0; i < 100; i++) {
      queueManager.enqueue(createTestMessage());
    }
    
    const start = Date.now();
    
    for (let i = 0; i < 100; i++) {
      await controller.processNextMessage();
    }
    
    const duration = Date.now() - start;
    expect(duration).toBeLessThan(500); // < 500ms for 100 messages
  });
});
```

## Test Utilities

### Mock Helpers
```typescript
function createTestMessage(overrides?: Partial<Message>): Message {
  return {
    id: crypto.randomUUID(),
    data: { test: 'data' },
    priority: MessagePriority.NORMAL,
    attempts: 0,
    createdAt: new Date(),
    queuedAt: new Date(),
    metadata: new Map(),
    ...overrides
  };
}

function createRetryConfig(overrides?: Partial<RetryConfig>): RetryConfig {
  return {
    maxRetries: 3,
    retryDelay: 100,
    exponentialBackoff: false,
    backoffMultiplier: 2,
    ...overrides
  };
}

function createMockHandler(fn?: (message: Message) => void): MessageHandler {
  return {
    handle: async (message: Message) => {
      if (fn) fn(message);
    },
    getMaxRetries: () => 3
  };
}
```

## Running Tests

### Unit Tests
```bash
npm run test:unit -- src/layers/message-queue
```

### Integration Tests
```bash
npm run test:integration -- src/layers/message-queue
```

### Performance Tests
```bash
npm run test:performance -- src/layers/message-queue
```

### All Tests
```bash
npm test -- src/layers/message-queue
```

### Coverage Report
```bash
npm run test:coverage -- src/layers/message-queue
```

## Continuous Integration

### GitHub Actions Workflow
```yaml
name: Message Queue Tests

on:
  pull_request:
    paths:
      - 'src/layers/message-queue/**'

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm ci
      - run: npm run test:unit -- src/layers/message-queue
      - run: npm run test:integration -- src/layers/message-queue
      - run: npm run test:performance -- src/layers/message-queue
      - run: npm run test:coverage -- src/layers/message-queue
      - uses: codecov/codecov-action@v3
```

## Best Practices

### Test Writing Guidelines
- Test all queue operations
- Test retry mechanisms
- Test dead letter queue
- Test processing control
- Test statistics tracking
- Maintain test independence

### Performance Testing Guidelines
- Test with high message volumes
- Test concurrent operations
- Test retry performance
- Monitor memory usage
- Test queue depth limits

### Error Testing Guidelines
- Test retry on failure
- Test max retry limits
- Test dead letter queue
- Test error recovery
- Test error statistics
