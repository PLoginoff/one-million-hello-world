# Testing Strategy

## Overview
Message Queue Layer tests exercise `MessageQueue` (`IMessageQueue`) — enqueue/dequeue, the registered-handler processing loop, retry + dead-lettering, stats and config — plus engine components, strategies, and adapters. Tests use `bun:test` in `src/layers/message-queue/__tests__/`.

## Coverage Targets

- Minimum 95%, target 99%+; branch 90%+, functions 100%.
- `MessageQueue`: 99%+; engine, strategies, adapters: 95%+.

## Test Organization

```
src/layers/message-queue/__tests__/
├── MessageQueue.test.ts               # core enqueue/dequeue/lifecycle
├── MessageQueueStrategies.test.ts     # Default/Fast/Reliable/Cached/Batch
├── MessageQueueAdapters.test.ts       # InMemory/Redis adapters
├── MessageQueueConfiguration.test.ts  # builder, defaults, validators
└── engine/                            # PriorityHeap, DelayScheduler, ConsumerGroups, advanced/
```

## Unit Test Examples

### Config
```typescript
const queue = new MessageQueue();
queue.getConfig(); // { maxRetries: 3, retryDelay: 1000, enableDeadLetter: true, maxQueueSize: 1000 }
queue.setConfig({ maxRetries: 5 }); // merged partial update
```

### Enqueue
```typescript
const r = queue.enqueue({ job: 1 }, 5);
r.success;         // true
r.messageId;       // generated id
// past maxQueueSize → { success: false, error: 'Queue is full' }
// priority sorts desc — higher priority dequeues first
```

### Dequeue
```typescript
queue.enqueue({ x: 1 });
await queue.dequeue(async (data) => { /* handler */ });
queue.getStats().processedCount; // 1
```

- Handler throw → `attempts++`, re-queued with `scheduledAt = now + retryDelay`.
- `attempts >= maxAttempts` → dead-lettered when `enableDeadLetter` (`deadLetterCount++`), `failedCount++` either way.
- `scheduledAt` in the future → `dequeue` returns without processing.

### Automatic Processing
```typescript
queue.registerHandler(async (data) => { /* ... */ });
queue.start();  // spins _processQueue loop
queue.stop();   // sets _isRunning=false; current message finishes
```

- `start()` is a no-op when already running or no handler registered.
- The loop polls with a 100 ms delay when idle/busy; `_processing` keeps one message in flight.
- Unscheduled messages process in priority order; `scheduledAt` delays are honored.

### Stats / Clear / Dead Letters
```typescript
queue.getStats();          // { queuedCount, processedCount, failedCount, deadLetterCount }
queue.getDeadLetterQueue();// Message[]
queue.clear();             // empties queue, resets queuedCount (dead letters kept)
```

## Engine Tests

- `PriorityHeap` ordering; `DelayScheduler` `scheduledAt` delays; `ConsumerGroups` fan-out; `BrokerQueue`.
- `advanced/`: `AdvancedQueueEngine`, `FifoSequencer`, `MessageExpiry`, `QueueFairness`, `ProducerQuotas`, `QueueTransaction`, `MessageTracer`, `PreemptingQueue`.

## Integration Tests

- End-to-end: `enqueue → registerHandler → start → handler invoked → stop`.
- Failure path: handler throws past `maxRetries` → message lands in `getDeadLetterQueue()`.
- Retry path: transient failure → re-queued at `retryDelay`, `attempts` increments until success.

## Performance Tests

- 1k `enqueue` in <100 ms; 1k `dequeue` in <100 ms.
- `start()` loop drains a full queue at handler speed without drops.
- `getStats()` O(1) regardless of queue depth.

## Test Utilities

```typescript
function createMessage(overrides?: Partial<Message>): Message {
  return { id: 'm-1', data: {}, priority: 0, attempts: 0,
           maxAttempts: 3, createdAt: Date.now(), scheduledAt: Date.now(), ...overrides };
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const failingHandler = (times: number) => { let n = 0; return async () => { if (++n <= times) throw new Error('boom'); }; };
```

## Running Tests

```bash
bun test ./src/layers/message-queue/
bun test ./src/layers/message-queue/__tests__/MessageQueue.test.ts
bun test --coverage ./src/layers/message-queue/
```

## Best Practices

- Register the handler before `start()` in every test — `start()` without a handler is a silent no-op.
- Drive retries with `retryDelay: 0` or short delays so tests stay fast.
- Assert `getStats()` after each scenario; `clear()` between groups.
- Cover `maxQueueSize`, `maxAttempts`, and `enableDeadLetter` boundary paths.
