/**
 * Integration test: Event → Message Queue
 * Verifies that events can trigger message queue operations
 */

import { InMemoryEventBusAdapter } from '../../event/adapters/InMemoryEventBusAdapter';
import { InMemoryQueueAdapter } from '../../message-queue/adapters/InMemoryQueueAdapter';

describe('Event → Message Queue Integration', () => {
  it('should enqueue message when event is published', () => {
    const eventBus = new InMemoryEventBusAdapter();
    const queue = new InMemoryQueueAdapter();

    eventBus.subscribe('order.created', (data: { orderId: string }) => {
      queue.enqueue({ task: 'process-order', orderId: data.orderId });
    });

    eventBus.publish('order.created', { orderId: 'ord-123' });

    expect(queue.getStats().queuedCount).toBe(1);
    expect(eventBus.getStats().publishedCount).toBe(1);
    expect(eventBus.getStats().handledCount).toBe(1);
  });

  it('should handle event errors without breaking queue', () => {
    const eventBus = new InMemoryEventBusAdapter();
    const queue = new InMemoryQueueAdapter();

    eventBus.subscribe('error.event', () => {
      throw new Error('handler failed');
    });

    eventBus.subscribe('error.event', (data: unknown) => {
      queue.enqueue(data);
    });

    eventBus.publish('error.event', { test: true });

    expect(eventBus.getStats().errorCount).toBe(1);
    expect(queue.getStats().queuedCount).toBe(1);
  });

  it('should process queued messages via event bus', async () => {
    const eventBus = new InMemoryEventBusAdapter();
    const queue = new InMemoryQueueAdapter();

    let processed = '';
    eventBus.subscribe('task.complete', (data: { task: string }) => {
      processed = data.task;
    });

    queue.enqueue({ task: 'send-email' });
    await queue.dequeue((data: { task: string }) => {
      eventBus.publish('task.complete', { task: data.task });
    });

    expect(processed).toBe('send-email');
    expect(queue.getStats().processedCount).toBe(1);
  });
});
