# Automatic Processing

## Overview
Automatic processing lives in `implementations/MessageQueue.ts` (`IMessageQueue`). A single registered `MessageHandler` is invoked per message; the internal loop dequeues, retries, and dead-letters failed messages. There are no separate `ProcessingController`, `HandlerRegistry`, or `ConcurrencyManager` classes — `MessageQueue` holds a `_processing` flag, `_isRunning` flag, and a `_deadLetterQueue` array.

## Types

```typescript
type MessageHandler<T = unknown> = (data: T) => void | Promise<void>;

interface Message<T> {
  id: string;
  data: T;
  priority: number;
  attempts: number;
  maxAttempts: number;
  createdAt: number;
  scheduledAt: number;
}

interface QueueConfig {
  maxRetries: number;      // default 3
  retryDelay: number;      // default 1000 ms
  enableDeadLetter: boolean; // default true
  maxQueueSize: number;    // default 1000
}

interface QueueStats {
  queuedCount: number;
  processedCount: number;
  failedCount: number;
  deadLetterCount: number;
}
```

## Processing Lifecycle

```typescript
const queue = new MessageQueue();

queue.registerHandler(async (data) => { /* process */ });
queue.start();  // begins the loop; no-op if already running or no handler
queue.stop();   // sets _isRunning = false; loop exits after current message
```

- `start()` spins `_processQueue()`: while `_isRunning` and a handler is set, it pulls the head message (priority-sorted), waits if `scheduledAt` is in the future or a message is already in flight, then calls `dequeue(handler)`.
- The loop polls with a 100 ms delay when idle or busy. `_processing` prevents concurrent message handling — there is one in-flight message at a time.
- `enqueue(data, priority)` returns `{ success: false, error: 'Queue is full' }` past `maxQueueSize`; otherwise pushes, re-sorts by `priority` desc, and bumps `queuedCount`.

## Retry and Dead Lettering

- On handler failure, `attempts++`. Below `maxAttempts`, the message is re-queued with `scheduledAt = now + retryDelay`.
- At `attempts >= maxAttempts`: if `enableDeadLetter`, the message moves to the dead letter queue (`getDeadLetterQueue()`), `deadLetterCount++`; `failedCount++` either way.
- `queuedCount` is resynced to `queue.length` after each dequeue.

## Stats and Config

```typescript
queue.getStats();   // { queuedCount, processedCount, failedCount, deadLetterCount }
queue.setConfig({ maxRetries: 5, retryDelay: 500 });  // merged partial update
queue.getConfig();
queue.clear();      // empties queue, resets queuedCount (dead letters kept)
```

## Engine Extras

`engine/` provides richer primitives beyond `MessageQueue`: `PriorityHeap`, `DelayScheduler`, `ConsumerGroups`, `BrokerQueue`, and `advanced/` (`AdvancedQueueEngine`, `FifoSequencer`, `MessageExpiry`, `QueueFairness`, `ProducerQuotas`, `QueueTransaction`, `MessageTracer`, `PreemptingQueue`).

## Best Practices

- Register the handler **before** `start()`; `start()` is a no-op without one.
- Keep handlers idempotent — retries re-invoke them.
- Monitor `getStats()` for `deadLetterCount`/`failedCount` growth and queue depth.
- Size `maxQueueSize` and `retryDelay` for your throughput; drain the dead letter queue on a schedule.
