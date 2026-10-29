/**
 * Adapter tests for Event layer
 */

import { InMemoryEventBusAdapter } from '../adapters/InMemoryEventBusAdapter';
import { RedisEventAdapter } from '../adapters/RedisEventAdapter';
import { HttpEventAdapter } from '../adapters/HttpEventAdapter';
import { KafkaEventAdapter } from '../adapters/KafkaEventAdapter';

describe('InMemoryEventBusAdapter', () => {
  it('should publish and subscribe', async () => {
    const adapter = new InMemoryEventBusAdapter();
    let received = '';
    adapter.subscribe('test-event', (data: string) => { received = data; });
    await adapter.publishAsync('test-event', 'hello');
    expect(received).toBe('hello');
    expect(adapter.getStats().publishedCount).toBe(1);
    expect(adapter.getStats().handledCount).toBe(1);
  });

  it('should subscribe once', () => {
    const adapter = new InMemoryEventBusAdapter();
    let count = 0;
    adapter.once('event', () => { count++; });
    adapter.publish('event', 1);
    adapter.publish('event', 2);
    expect(count).toBe(1);
  });

  it('should unsubscribe', () => {
    const adapter = new InMemoryEventBusAdapter();
    let count = 0;
    const id = adapter.subscribe('evt', () => { count++; });
    adapter.publish('evt', 1);
    adapter.unsubscribe(id);
    adapter.publish('evt', 2);
    expect(count).toBe(1);
  });

  it('should publish async', async () => {
    const adapter = new InMemoryEventBusAdapter();
    let received = 0;
    adapter.subscribe('async-event', (data: number) => { received = data; });
    await adapter.publishAsync('async-event', 42);
    expect(received).toBe(42);
  });

  it('should clear subscriptions', () => {
    const adapter = new InMemoryEventBusAdapter();
    adapter.subscribe('evt', () => {});
    adapter.clear();
    expect(adapter.getStats().subscriptionCount).toBe(0);
  });

  it('should track errors', () => {
    const adapter = new InMemoryEventBusAdapter();
    adapter.subscribe('err-event', () => { throw new Error('handler error'); });
    adapter.publish('err-event', 'data');
    expect(adapter.getStats().errorCount).toBe(1);
  });

  it('should support event filters', () => {
    const adapter = new InMemoryEventBusAdapter();
    let received: string | null = null;
    adapter.subscribe('filtered', (data: string) => { received = data; }, (data) => data === 'allowed');
    adapter.publish('filtered', 'denied');
    expect(received).toBeNull();
    adapter.publish('filtered', 'allowed');
    expect(received).toBe('allowed');
  });

  it('should support wildcard subscriptions', () => {
    const adapter = new InMemoryEventBusAdapter();
    let received: string[] = [];
    adapter.subscribe('*', (data: string) => { received.push(data); });
    adapter.publish('event1', 'a');
    adapter.publish('event2', 'b');
    expect(received).toContain('a');
    expect(received).toContain('b');
  });

  it('should persist events when enabled', () => {
    const adapter = new InMemoryEventBusAdapter({ enablePersistence: true, maxEventHistory: 10 });
    adapter.publish('persist-event', 'data1');
    adapter.publish('persist-event', 'data2');
    const history = adapter.getEventHistory();
    expect(history.length).toBe(2);
    expect(history[0].data).toBe('data1');
    expect(history[1].data).toBe('data2');
  });

  it('should replay events', () => {
    const adapter = new InMemoryEventBusAdapter({ enablePersistence: true, maxEventHistory: 10 });
    adapter.publish('replay-event', 'data1');
    adapter.publish('replay-event', 'data2');
    let replayed: string[] = [];
    const count = adapter.replayEvents('replay-event', (data: string) => { replayed.push(data); });
    expect(count).toBe(2);
    expect(replayed).toEqual(['data1', 'data2']);
  });

  it('should track subscriber count', () => {
    const adapter = new InMemoryEventBusAdapter();
    adapter.subscribe('evt1', () => {});
    adapter.subscribe('evt1', () => {});
    adapter.subscribe('evt2', () => {});
    expect(adapter.getSubscriberCount('evt1')).toBe(2);
    expect(adapter.getSubscriberCount('evt2')).toBe(1);
    expect(adapter.getSubscriberCount('nonexistent')).toBe(0);
  });

  it('should respect max subscriptions limit', () => {
    const adapter = new InMemoryEventBusAdapter({ maxSubscriptions: 2 });
    adapter.subscribe('evt1', () => {});
    adapter.subscribe('evt2', () => {});
    expect(() => adapter.subscribe('evt3', () => {})).toThrow('Maximum subscriptions');
  });

  it('should respect max event history', () => {
    const adapter = new InMemoryEventBusAdapter({ enablePersistence: true, maxEventHistory: 2 });
    adapter.publish('evt', '1');
    adapter.publish('evt', '2');
    adapter.publish('evt', '3');
    const history = adapter.getEventHistory();
    expect(history.length).toBe(2);
    expect(history[0].data).toBe('2');
    expect(history[1].data).toBe('3');
  });

  it('should return subscription IDs', () => {
    const adapter = new InMemoryEventBusAdapter();
    const id1 = adapter.subscribe('evt', () => {});
    const id2 = adapter.subscribe('evt', () => {});
    const ids = adapter.getSubscriptionIds('evt');
    expect(ids).toContain(id1);
    expect(ids).toContain(id2);
  });

  // it('should handle dispose', () => {
  //   const adapter = new InMemoryEventBusAdapter();
  //   adapter.subscribe('evt', () => {});
  //   adapter.dispose();
  //   expect(adapter.isDisposed()).toBe(true);
  //   expect(() => adapter.subscribe('evt', () => {})).toThrow('disposed');
  // });

  it('should handle async handler', async () => {
    const adapter = new InMemoryEventBusAdapter();
    let received = '';
    adapter.subscribe('async-evt', async (data: string) => { 
      await new Promise(r => setTimeout(r, 10));
      received = data; 
    });
    await adapter.publishAsync('async-evt', 'hello');
    expect(received).toBe('hello');
  });

  it('should publish sync', () => {
    const adapter = new InMemoryEventBusAdapter();
    let received = '';
    adapter.subscribe('test-event', (data: string) => { received = data; });
    adapter.publish('test-event', 'hello');
    expect(received).toBe('hello');
    expect(adapter.getStats().publishedCount).toBe(1);
    expect(adapter.getStats().handledCount).toBe(1);
  });
});

describe('RedisEventAdapter', () => {
  // These tests require redis to be installed and running
  // They are skipped in environments without redis
  it.skip('should create with default config', () => {
    const adapter = new RedisEventAdapter({ host: 'localhost', port: 6379 });
    expect(adapter).toBeDefined();
    expect(adapter.isConnected()).toBe(false);
  });

  it.skip('should publish and subscribe (mock)', () => {
    const adapter = new RedisEventAdapter({ host: 'localhost', port: 6379 });
    let received = '';
    adapter.subscribe('redis-event', (data: string) => { received = data; });
    adapter.publish('redis-event', 'via-redis');
    expect(received).toBe('via-redis');
  });

  it.skip('should return Redis URL', () => {
    const adapter = new RedisEventAdapter({ host: 'localhost', port: 6379 });
    expect(adapter.getRedisUrl()).toBe('redis://localhost:6379');
  });

  it.skip('should subscribe once', () => {
    const adapter = new RedisEventAdapter({ host: 'localhost', port: 6379 });
    let count = 0;
    adapter.once('evt', () => { count++; });
    adapter.publish('evt', 1);
    adapter.publish('evt', 2);
    expect(count).toBe(1);
  });

  it.skip('should publish async', async () => {
    const adapter = new RedisEventAdapter({ host: 'localhost', port: 6379 });
    let received = 0;
    adapter.subscribe('async', (data: number) => { received = data; });
    await adapter.publishAsync('async', 99);
    expect(received).toBe(99);
  });

  it.skip('should clear', () => {
    const adapter = new RedisEventAdapter({ host: 'localhost', port: 6379 });
    adapter.subscribe('e', () => {});
    adapter.clear();
    expect(adapter.getStats().subscriptionCount).toBe(0);
  });

  it.skip('should get stats', () => {
    const adapter = new RedisEventAdapter({ host: 'localhost', port: 6379 });
    const stats = adapter.getStats();
    expect(stats.publishedCount).toBe(0);
    expect(stats.handledCount).toBe(0);
    expect(stats.errorCount).toBe(0);
    expect(stats.subscriptionCount).toBe(0);
  });
});

describe('HttpEventAdapter', () => {
  let adapter: HttpEventAdapter;

  beforeEach(() => {
    adapter = new HttpEventAdapter({
      endpoints: [
        {
          name: 'test-endpoint',
          url: 'http://localhost:3000/webhook',
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        },
      ],
      enableBuffering: false, // Disable buffering for simpler tests
    });
  });

  afterEach(async () => {
    await adapter.dispose();
  });

  it('should create with endpoints', () => {
    expect(adapter.getEndpoints()).toContain('test-endpoint');
  });

  it('should publish and subscribe locally', () => {
    let received = '';
    adapter.subscribe('local-event', (data: string) => { received = data; });
    adapter.publish('local-event', 'hello');
    expect(received).toBe('hello');
  });

  it('should add endpoint dynamically', () => {
    adapter.addEndpoint({
      name: 'new-endpoint',
      url: 'http://localhost:3001/webhook',
      method: 'POST',
      headers: {},
    });
    expect(adapter.getEndpoints()).toContain('new-endpoint');
  });

  it('should remove endpoint', () => {
    expect(adapter.removeEndpoint('test-endpoint')).toBe(true);
    expect(adapter.getEndpoints()).not.toContain('test-endpoint');
    expect(adapter.removeEndpoint('nonexistent')).toBe(false);
  });

  it('should track buffer size', () => {
    const bufferedAdapter = new HttpEventAdapter({
      endpoints: [{ name: 'buffered', url: 'http://localhost:3000', method: 'POST', headers: {} }],
      enableBuffering: true,
    });
    expect(bufferedAdapter.getBufferSize('buffered')).toBe(0);
    bufferedAdapter.dispose();
  });

  it('should get stats', () => {
    const stats = adapter.getStats();
    expect(stats.publishedCount).toBe(0);
    expect(stats.handledCount).toBe(0);
    expect(stats.errorCount).toBe(0);
    expect(stats.subscriptionCount).toBe(0);
  });
});

describe('KafkaEventAdapter', () => {
  // These tests require kafka to be installed and running
  // They are skipped in environments without kafka
  it.skip('should create with config', () => {
    const adapter = new KafkaEventAdapter({
      producer: { brokers: ['localhost:9092'] },
      consumer: { brokers: ['localhost:9092'], groupId: 'test-group', topics: ['test-topic'] },
    });
    expect(adapter).toBeDefined();
    expect(adapter.isConnected()).toBe(false);
  });

  it.skip('should get stats', () => {
    const adapter = new KafkaEventAdapter({
      producer: { brokers: ['localhost:9092'] },
      consumer: { brokers: ['localhost:9092'], groupId: 'test-group', topics: ['test-topic'] },
    });
    const stats = adapter.getStats();
    expect(stats.publishedCount).toBe(0);
    expect(stats.handledCount).toBe(0);
    expect(stats.errorCount).toBe(0);
    expect(stats.subscriptionCount).toBe(0);
  });

  it.skip('should pause and resume topics', () => {
    const adapter = new KafkaEventAdapter({
      producer: { brokers: ['localhost:9092'] },
      consumer: { brokers: ['localhost:9092'], groupId: 'test-group', topics: ['test-topic'] },
    });
    adapter.pauseTopics(['test-topic']);
    adapter.resumeTopics(['test-topic']);
    // No errors means success
  });
});