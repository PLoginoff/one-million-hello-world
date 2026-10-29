/**
 * InMemoryEventBusAdapter tests
 */

import { InMemoryEventBusAdapter } from '../adapters/InMemoryEventBusAdapter';

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

  it('should subscribe once', async () => {
    const adapter = new InMemoryEventBusAdapter();
    let count = 0;
    adapter.once('event', () => { count++; });
    await adapter.publishAsync('event', 1);
    await adapter.publishAsync('event', 2);
    expect(count).toBe(1);
  });

  it('should unsubscribe', async () => {
    const adapter = new InMemoryEventBusAdapter();
    let count = 0;
    const id = adapter.subscribe('evt', () => { count++; });
    await adapter.publishAsync('evt', 1);
    adapter.unsubscribe(id);
    await adapter.publishAsync('evt', 2);
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

  it('should track errors', async () => {
    const adapter = new InMemoryEventBusAdapter();
    adapter.subscribe('err-event', () => { throw new Error('handler error'); });
    await adapter.publishAsync('err-event', 'data');
    expect(adapter.getStats().errorCount).toBe(1);
  });

  it('should support event filters', async () => {
    const adapter = new InMemoryEventBusAdapter();
    let received: string | null = null;
    adapter.subscribe('filtered', (data: string) => { received = data; }, (data) => data === 'allowed');
    await adapter.publishAsync('filtered', 'denied');
    expect(received).toBeNull();
    await adapter.publishAsync('filtered', 'allowed');
    expect(received).toBe('allowed');
  });

  it('should support wildcard subscriptions', async () => {
    const adapter = new InMemoryEventBusAdapter();
    let received: string[] = [];
    adapter.subscribe('*', (data: string) => { received.push(data); });
    await adapter.publishAsync('event1', 'a');
    await adapter.publishAsync('event2', 'b');
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
  //   expect(adapter.isDisposed()).toBe(false);
  //   adapter.dispose();
  //   expect(adapter.isDisposed()).toBe(true);
  //   // Don't test subscribe after dispose as it causes issues with test framework
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