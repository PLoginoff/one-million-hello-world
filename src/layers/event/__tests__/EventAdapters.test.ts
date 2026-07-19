import { InMemoryEventBusAdapter } from '../adapters/InMemoryEventBusAdapter';
import { RedisEventBusAdapter } from '../adapters/RedisEventBusAdapter';

describe('InMemoryEventBusAdapter', () => {
  let adapter: InMemoryEventBusAdapter;

  beforeEach(() => {
    adapter = new InMemoryEventBusAdapter();
  });

  it('should publish and subscribe', () => {
    let received = '';
    adapter.subscribe('test-event', (data: string) => { received = data; });
    adapter.publish('test-event', 'hello');
    expect(received).toBe('hello');
    expect(adapter.getStats().publishedCount).toBe(1);
    expect(adapter.getStats().handledCount).toBe(1);
  });

  it('should subscribe once', () => {
    let count = 0;
    adapter.once('event', () => { count++; });
    adapter.publish('event', 1);
    adapter.publish('event', 2);
    expect(count).toBe(1);
  });

  it('should unsubscribe', () => {
    let count = 0;
    const id = adapter.subscribe('evt', () => { count++; });
    adapter.publish('evt', 1);
    adapter.unsubscribe(id);
    adapter.publish('evt', 2);
    expect(count).toBe(1);
  });

  it('should publish async', async () => {
    let received = 0;
    adapter.subscribe('async-event', (data: number) => { received = data; });
    await adapter.publishAsync('async-event', 42);
    expect(received).toBe(42);
  });

  it('should clear subscriptions', () => {
    adapter.subscribe('evt', () => {});
    adapter.clear();
    expect(adapter.getStats().subscriptionCount).toBe(0);
  });

  it('should track errors', () => {
    adapter.subscribe('err-event', () => { throw new Error('handler error'); });
    adapter.publish('err-event', 'data');
    expect(adapter.getStats().errorCount).toBe(1);
  });
});

describe('RedisEventBusAdapter', () => {
  let adapter: RedisEventBusAdapter;

  beforeEach(() => {
    adapter = new RedisEventBusAdapter('redis://localhost:6379');
  });

  it('should publish and subscribe', () => {
    let received = '';
    adapter.subscribe('redis-event', (data: string) => { received = data; });
    adapter.publish('redis-event', 'via-redis');
    expect(received).toBe('via-redis');
  });

  it('should return Redis URL', () => {
    expect(adapter.getRedisUrl()).toBe('redis://localhost:6379');
  });

  it('should subscribe once', () => {
    let count = 0;
    adapter.once('evt', () => { count++; });
    adapter.publish('evt', 1);
    adapter.publish('evt', 2);
    expect(count).toBe(1);
  });

  it('should publish async', async () => {
    let received = 0;
    adapter.subscribe('async', (data: number) => { received = data; });
    await adapter.publishAsync('async', 99);
    expect(received).toBe(99);
  });

  it('should clear', () => {
    adapter.subscribe('e', () => {});
    adapter.clear();
    expect(adapter.getStats().subscriptionCount).toBe(0);
  });
});
