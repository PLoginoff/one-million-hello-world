import { InMemoryQueueAdapter } from '../adapters/InMemoryQueueAdapter';
import { RedisQueueAdapter } from '../adapters/RedisQueueAdapter';

describe('InMemoryQueueAdapter', () => {
  let adapter: InMemoryQueueAdapter;

  beforeEach(() => {
    adapter = new InMemoryQueueAdapter();
  });

  it('should enqueue a message', () => {
    const result = adapter.enqueue({ task: 'send-email' });
    expect(result.success).toBe(true);
    expect(result.messageId).toBeDefined();
  });

  it('should dequeue and process a message', async () => {
    adapter.enqueue({ task: 'test' });
    let processed = false;
    await adapter.dequeue((_data) => { processed = true; });
    expect(processed).toBe(true);
    expect(adapter.getStats().processedCount).toBe(1);
  });

  it('should move to dead letter after max retries', async () => {
    adapter.setConfig({ maxRetries: 1, retryDelay: 0, enableDeadLetter: true, maxQueueSize: 100 });
    adapter.enqueue('failing-task');
    await adapter.dequeue(() => { throw new Error('fail'); });
    await adapter.dequeue(() => { throw new Error('fail'); });
    expect(adapter.getDeadLetterQueue().length).toBe(1);
  });

  it('should respect priority', () => {
    adapter.enqueue('low', 1);
    adapter.enqueue('high', 10);
    adapter.enqueue('medium', 5);
    expect(adapter.getStats().queuedCount).toBe(3);
  });

  it('should clear queue', () => {
    adapter.enqueue('test');
    adapter.clear();
    expect(adapter.getStats().queuedCount).toBe(0);
  });

  it('should return status', () => {
    expect(adapter.getConfig().maxRetries).toBe(3);
  });
});

describe('RedisQueueAdapter', () => {
  let adapter: RedisQueueAdapter;

  beforeEach(() => {
    adapter = new RedisQueueAdapter('redis://localhost:6379');
  });

  it('should enqueue a message', () => {
    const result = adapter.enqueue({ task: 'process' });
    expect(result.success).toBe(true);
  });

  it('should dequeue and process', async () => {
    adapter.enqueue('task');
    let processed = false;
    await adapter.dequeue(() => { processed = true; });
    expect(processed).toBe(true);
  });

  it('should return Redis URL', () => {
    expect(adapter.getRedisUrl()).toBe('redis://localhost:6379');
  });

  it('should move to dead letter after max retries', async () => {
    adapter.setConfig({ maxRetries: 1, retryDelay: 0, enableDeadLetter: true, maxQueueSize: 100 });
    adapter.enqueue('fail');
    await adapter.dequeue(() => { throw new Error('fail'); });
    await adapter.dequeue(() => { throw new Error('fail'); });
    expect(adapter.getDeadLetterQueue().length).toBe(1);
  });
});
