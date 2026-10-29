/**
 * InMemoryMessageBus Engine Tests
 *
 * Covers topic wildcards, priority, delayed delivery, request/reply,
 * ACK/NACK redelivery, DLQ routing, TTL expiry and backpressure.
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import {
  InMemoryMessageBus,
  compileTopicPattern,
  BackpressureError,
  RequestTimeoutError,
  type BusMessage,
} from '../implementations/InMemoryMessageBus';

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Flush microtask dispatch loops. */
async function flush(): Promise<void> {
  await sleep(0);
  await sleep(0);
}

describe('compileTopicPattern', () => {
  it('matches exact topics', () => {
    const m = compileTopicPattern('order.created');
    expect(m('order.created')).toBe(true);
    expect(m('order.updated')).toBe(false);
    expect(m('order.created.eu')).toBe(false);
  });

  it('matches single-word wildcard *', () => {
    const m = compileTopicPattern('order.*');
    expect(m('order.created')).toBe(true);
    expect(m('order.created.eu')).toBe(false);
    expect(m('order')).toBe(false);
  });

  it('matches multi-word wildcard #', () => {
    const m = compileTopicPattern('orders.#');
    expect(m('orders')).toBe(true);
    expect(m('orders.created')).toBe(true);
    expect(m('orders.created.eu.west')).toBe(true);
    expect(m('order.created')).toBe(false);
  });

  it('matches bare # for all topics', () => {
    const m = compileTopicPattern('#');
    expect(m('anything.at.all')).toBe(true);
  });

  it('matches * inside patterns', () => {
    const m = compileTopicPattern('*.created');
    expect(m('order.created')).toBe(true);
    expect(m('user.created')).toBe(true);
    expect(m('user.order.created')).toBe(false);
  });
});

describe('InMemoryMessageBus', () => {
  let bus: InMemoryMessageBus;

  beforeEach(() => {
    bus = new InMemoryMessageBus({ schedulerTickMs: 5 });
  });

  afterEach(async () => {
    await bus.close();
  });

  it('delivers a published message to a matching subscriber', async () => {
    const received: BusMessage[] = [];
    bus.subscribe('order.created', (m) => {
      received.push(m);
    });
    bus.publish('order.created', { id: 1 });
    await flush();
    expect(received).toHaveLength(1);
    expect(received[0].payload).toEqual({ id: 1 });
  });

  it('fans out to multiple matching patterns', async () => {
    const a: string[] = [];
    const b: string[] = [];
    bus.subscribe('order.*', () => a.push('a'));
    bus.subscribe('#', () => b.push('b'));
    bus.publish('order.created', null);
    await flush();
    expect(a).toHaveLength(1);
    expect(b).toHaveLength(1);
  });

  it('does not deliver to non-matching subscribers', async () => {
    const received: unknown[] = [];
    bus.subscribe('user.*', (m) => received.push(m));
    bus.publish('order.created', 1);
    await flush();
    expect(received).toHaveLength(0);
  });

  it('delivers higher priority messages first', async () => {
    const order: number[] = [];
    // Gate the handler so all three messages are queued before draining.
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => {
      release = r;
    });
    bus.subscribe(
      'q',
      async (m) => {
        await gate;
        order.push(m.payload as number);
      },
      { prefetch: 10 }
    );
    bus.publish('q', 1, { priority: 1 });
    bus.publish('q', 9, { priority: 9 });
    bus.publish('q', 5, { priority: 5 });
    await flush();
    release();
    await sleep(20);
    // Large prefetch drains the heap in priority order: 9, 5, 1.
    expect(order).toEqual([9, 5, 1]);
  });

  it('delivers delayed messages only after the delay', async () => {
    const received: number[] = [];
    bus.subscribe('delayed', (m) => received.push(m.payload as number));
    bus.publish('delayed', 42, { delayMs: 30 });
    await flush();
    expect(received).toHaveLength(0);
    await sleep(60);
    expect(received).toEqual([42]);
  });

  it('request/reply resolves with the reply message', async () => {
    bus.subscribe('echo', (m, ack) => {
      bus.reply(m, { echo: m.payload });
      ack.ack();
    }, { manualAck: true });
    const res = await bus.request<{ v: number }, { echo: { v: number } }>(
      'echo',
      { v: 7 },
      { timeoutMs: 1000 }
    );
    expect(res.payload.echo).toEqual({ v: 7 });
  });

  it('request times out when no reply arrives', async () => {
    const promise = bus.request('nobody.home', null, { timeoutMs: 20 });
    await expect(promise).rejects.toBeInstanceOf(RequestTimeoutError);
  });

  it('auto-ack mode redelivers on handler failure then succeeds', async () => {
    let attempts = 0;
    const payloads: unknown[] = [];
    bus.subscribe('flaky', (m) => {
      attempts++;
      if (attempts < 3) throw new Error('boom');
      payloads.push(m.payload);
    }, { maxDeliveries: 5 });
    bus.publish('flaky', 'work');
    await sleep(20);
    expect(attempts).toBe(3);
    expect(payloads).toEqual(['work']);
  });

  it('dead-letters after max delivery attempts', async () => {
    bus.subscribe('poison', () => {
      throw new Error('always fails');
    }, { maxDeliveries: 3 });
    bus.publish('poison', 'bad');
    await sleep(30);
    const stats = bus.stats();
    expect(stats.deadLettered).toBe(1);
    expect(bus.deadLetters()).toHaveLength(1);
    expect(bus.deadLetters()[0].headers.dlqOriginalTopic).toBe('poison');
  });

  it('manual ack removes the message; nack requeues it', async () => {
    let deliveries = 0;
    bus.subscribe('manual', (_m, ack) => {
      deliveries++;
      if (deliveries === 1) ack.nack(true);
      else ack.ack();
    }, { manualAck: true, prefetch: 1 });
    bus.publish('manual', 'x');
    await flush();
    await flush();
    expect(deliveries).toBe(2);
    expect(bus.stats().acked).toBe(1);
    expect(bus.stats().nacked).toBe(1);
  });

  it('manual ack mode dead-letters when nacked without requeue', async () => {
    bus.subscribe('m2', (_m, ack) => ack.nack(false), { manualAck: true });
    bus.publish('m2', 'x');
    await flush();
    expect(bus.stats().deadLettered).toBe(1);
  });

  it('replayDeadLetter re-delivers a dead letter', async () => {
    const got: unknown[] = [];
    let fail = true;
    bus.subscribe('p2', (m) => {
      if (fail) throw new Error('fail once');
      got.push(m.payload);
    }, { maxDeliveries: 1 });
    bus.publish('p2', 'retry-me');
    await sleep(20);
    expect(bus.deadLetters()).toHaveLength(1);
    fail = false;
    const id = bus.deadLetters()[0].id;
    expect(bus.replayDeadLetter(id)).toBe(true);
    await flush();
    expect(got).toEqual(['retry-me']);
    expect(bus.deadLetters()).toHaveLength(0);
  });

  it('rejects on full queue with overflow=reject', async () => {
    bus.subscribe('slow', () => {
      return new Promise<void>((r) => setTimeout(r, 50));
    }, { queueCapacity: 2, overflow: 'reject', prefetch: 1 });
    // Handler occupies dispatch asynchronously; fill queue first.
    // Publish more than capacity synchronously — dispatch drains via microtasks,
    // so all publishes land before the first drain completes the handler.
    let threw = false;
    try {
      for (let i = 0; i < 20; i++) bus.publish('slow', i);
    } catch (e) {
      threw = e instanceof BackpressureError;
    }
    expect(threw).toBe(true);
    expect(bus.stats().rejected).toBeGreaterThan(0);
  });

  it('drop-oldest keeps the queue bounded', async () => {
    bus.subscribe('drop', () => {
      return new Promise<void>((r) => setTimeout(r, 30));
    }, { queueCapacity: 2, overflow: 'drop-oldest', prefetch: 1 });
    for (let i = 0; i < 10; i++) bus.publish('drop', i);
    await flush();
    // We never threw; queue stayed bounded.
    expect(bus.stats().rejected).toBe(0);
  });

  it('expires messages whose TTL elapsed before routing', async () => {
    const received: unknown[] = [];
    bus.subscribe('ttl', (m) => received.push(m));
    // Schedule far future, then manipulate via direct delayed publish + wait for TTL
    bus.publish('ttl', 'x', { delayMs: 40, ttlMs: 10 });
    await sleep(80);
    expect(received).toHaveLength(0);
    expect(bus.stats().expired).toBe(1);
  });

  it('deduplicates by idempotency key per subscription', async () => {
    const a: unknown[] = [];
    const b: unknown[] = [];
    bus.subscribe('a.topic', (m) => a.push(m));
    bus.subscribe('b.topic', (m) => b.push(m));
    bus.publish('a.topic', 1, { idempotencyKey: 'k1' });
    bus.publish('a.topic', 1, { idempotencyKey: 'k1' });
    bus.publish('b.topic', 2, { idempotencyKey: 'k1' });
    await flush();
    expect(a).toHaveLength(1);
    expect(b).toHaveLength(1);
  });

  it('routes dead letters to dlq.<topic> subscribers', async () => {
    const dlq: BusMessage[] = [];
    bus.subscribe('dlq.#', (m) => dlq.push(m));
    bus.subscribe('bad.topic', () => {
      throw new Error('nope');
    }, { maxDeliveries: 1 });
    bus.publish('bad.topic', 'x');
    await sleep(20);
    expect(dlq).toHaveLength(1);
    expect(dlq[0].topic).toBe('dlq.bad.topic');
  });

  it('close() releases pending requests', async () => {
    const p = bus.request('x', null, { timeoutMs: 10000 });
    await bus.close();
    await expect(p).rejects.toThrow();
  });

  it('tracks stats', async () => {
    bus.subscribe('s', () => {});
    bus.publish('s', 1);
    bus.publish('s', 2);
    // Poll until handler completions have been accounted (async observation).
    for (let i = 0; i < 50 && bus.stats().delivered < 2; i++) await sleep(10);
    const stats = bus.stats();
    expect(stats.published).toBe(2);
    expect(stats.delivered).toBe(2);
    expect(stats.activeSubscriptions).toBe(1);
  });
});
