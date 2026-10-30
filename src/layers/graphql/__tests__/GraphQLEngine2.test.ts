import { describe, it, expect, beforeEach } from 'bun:test';
import { QueryComplexityAnalyzer } from '../engine2/QueryComplexityAnalyzer';
import { PersistedQueryRegistry, queryHash } from '../engine2/PersistedQueryRegistry';
import { DataLoader } from '../engine2/DataLoader';
import { EventBus, SubscriptionRegistry } from '../engine2/SubscriptionEngine';
import { GraphQLGateway } from '../engine2/GraphQLGateway';
import { parse } from '../implementations/parser/Parser';

/* ------------------------------------------------------------------ */

describe('QueryComplexityAnalyzer', () => {
  let analyzer: QueryComplexityAnalyzer;

  beforeEach(() => {
    analyzer = new QueryComplexityAnalyzer({
      defaultListMultiplier: 10,
      maxComplexity: 500,
      maxDepth: 6,
    });
  });

  it('scores a simple flat query cheaply', () => {
    const doc = parse(`{ user { id name email } }`);
    const r = analyzer.analyze(doc);
    // user (1) + 3 leaves ×10 default multiplier… user has children → ×10.
    expect(r.ok).toBe(true);
    expect(r.totalCost).toBeGreaterThan(0);
    expect(r.maxDepthReached).toBe(2);
  });

  it('list args multiply subtree cost', () => {
    const small = parse(`{ users(first: 5) { id } }`);
    const big = parse(`{ users(first: 100) { id } }`);
    const s = analyzer.analyze(small);
    const b = analyzer.analyze(big);
    expect(b.totalCost / s.totalCost).toBeCloseTo(20, 0); // 100/5
  });

  it('counts aliased fields as separate resolutions', () => {
    const doc = parse(`{ a: user(id: 1) { name } b: user(id: 2) { name } }`);
    const r = analyzer.analyze(doc);
    expect(Object.keys(r.byRootField).sort()).toEqual(['a', 'b']);
    // Two separate resolutions → double the single-field cost.
    const single = analyzer.analyze(parse(`{ a: user(id: 1) { name } }`));
    expect(r.totalCost).toBe(single.totalCost * 2);
  });

  it('rejects queries over maxComplexity', () => {
    const doc = parse(`{ users(first: 100) { friends(first: 10) { id name } } }`);
    const r = analyzer.analyze(doc);
    // users: 100 × (1 + 10×3) ≈ way over 500.
    expect(r.ok).toBe(false);
    expect(r.violations.some((v) => v.kind === 'max-complexity')).toBe(true);
  });

  it('rejects over-deep nesting regardless of cost', () => {
    const doc = parse(`{ a { b { c { d { e { f { g { h } } } } } } } }`);
    const r = analyzer.analyze(doc);
    expect(r.violations.some((v) => v.kind === 'max-depth')).toBe(true);
  });

  it('@skip(if:true) drops the field cost', () => {
    const withSkip = parse(`{ user { name expensive @skip(if: true) } }`);
    const without = parse(`{ user { name expensive } }`);
    const r1 = analyzer.analyze(withSkip);
    const r2 = analyzer.analyze(without);
    expect(r1.totalCost).toBeLessThan(r2.totalCost);
  });

  it('expands fragments once and cuts cycles', () => {
    const doc = parse(`
      fragment F on User { name friends(first: 5) { ...F } }
      { user { ...F } }
    `);
    // Recursive fragment — must not hang; F's nested spread is cut.
    const r = analyzer.analyze(doc);
    expect(r.totalCost).toBeGreaterThan(0);
    expect(r.maxDepthReached).toBeLessThanOrEqual(6);
  });
});

/* ------------------------------------------------------------------ */

describe('PersistedQueryRegistry', () => {
  it('registers and resolves by sha-256 hash', () => {
    const reg = new PersistedQueryRegistry();
    const q = `{ me { id } }`;
    const hash = reg.register(q);
    expect(hash).toBe(queryHash(q));
    expect(reg.resolveHash(hash)).toEqual({ status: 'hit', text: q });
  });

  it('APQ miss → register → hit round-trip', () => {
    const reg = new PersistedQueryRegistry();
    const q = `{ x }`;
    const hash = queryHash(q);
    expect(reg.resolveHash(hash).status).toBe('miss'); // client retries with text
    reg.register(q);
    expect(reg.resolveHash(hash).status).toBe('hit');
  });

  it('evicts LRU entries past capacity', () => {
    const reg = new PersistedQueryRegistry({ maxEntries: 3 });
    reg.register('a');
    reg.register('b');
    reg.register('c');
    // Touch 'a' to make 'b' the LRU.
    reg.lookup(queryHash('a'));
    reg.register('d'); // evicts 'b'
    expect(reg.resolveHash(queryHash('b')).status).toBe('miss');
    expect(reg.resolveHash(queryHash('a')).status).toBe('hit');
    expect(reg.stats().evictions).toBe(1);
  });

  it('tracks hit rate', () => {
    const reg = new PersistedQueryRegistry();
    const h = reg.register('q');
    reg.lookup(h);
    reg.lookup('nonexistent');
    expect(reg.stats().hitRate).toBeCloseTo(0.5);
  });
});

/* ------------------------------------------------------------------ */

describe('DataLoader', () => {
  it('coalesces same-tick loads into one batch', async () => {
    const batches: string[][] = [];
    const loader = new DataLoader<string, number>(async (keys) => {
      batches.push([...keys]);
      return keys.map((k) => parseInt(k, 10));
    });
    const [a, b, c] = await Promise.all([loader.load('1'), loader.load('2'), loader.load('3')]);
    expect([a, b, c]).toEqual([1, 2, 3]);
    expect(batches).toEqual([['1', '2', '3']]); // one batch, order preserved
  });

  it('caches per-key within the loader lifetime', async () => {
    let calls = 0;
    const loader = new DataLoader<string, string>(async (keys) => {
      calls++;
      return keys.map((k) => `v-${k}`);
    });
    const p1 = loader.load('x');
    const p2 = loader.load('x'); // same tick — cache hit, not re-queued
    expect(await p1).toBe('v-x');
    expect(await p2).toBe('v-x');
    expect(calls).toBe(1);
    expect(loader.stats().cacheHits).toBe(1);
  });

  it('separate ticks dispatch separate batches', async () => {
    let calls = 0;
    const loader = new DataLoader<string, string>(async (keys) => {
      calls++;
      return keys.map((k) => `v-${k}`);
    });
    await loader.load('a');
    await loader.load('b');
    expect(calls).toBe(2);
  });

  it('per-slot errors reject only that load', async () => {
    const loader = new DataLoader<string, string>(async (keys) =>
      keys.map((k) => (k === 'bad' ? new Error('nope') : `v-${k}`))
    );
    const results = await loader.loadMany(['ok', 'bad', 'also-ok']);
    expect(results[0]).toBe('v-ok');
    expect((results[1] as Error).message).toBe('nope');
    expect(results[2]).toBe('v-also-ok');
  });

  it('prime() seeds the cache; clear() invalidates', async () => {
    let calls = 0;
    const loader = new DataLoader<string, string>(async (keys) => {
      calls++;
      return keys.map((k) => `fetched-${k}`);
    });
    loader.prime('warm', 'preloaded');
    expect(await loader.load('warm')).toBe('preloaded');
    expect(calls).toBe(0);
    loader.clear('warm');
    expect(await loader.load('warm')).toBe('fetched-warm');
  });
});

/* ------------------------------------------------------------------ */

describe('SubscriptionEngine', () => {
  it('delivers published events to topic subscribers', async () => {
    const bus = new EventBus();
    const stream = bus.subscribe<number>('orders.updated');
    bus.publish('orders.updated', 42);
    const iter = stream[Symbol.asyncIterator]();
    const first = await iter.next();
    expect(first.done).toBe(false);
    expect(first.value.payload).toBe(42);
    bus.unsubscribe('orders.updated', stream);
    expect((await iter.next()).done).toBe(true);
  });

  it('queues events published before the consumer iterates', async () => {
    const bus = new EventBus();
    const stream = bus.subscribe<string>('t');
    bus.publish('t', 'a');
    bus.publish('t', 'b');
    const seen: string[] = [];
    for await (const e of stream) {
      seen.push(e.payload);
      if (seen.length === 2) break;
    }
    expect(seen).toEqual(['a', 'b']);
  });

  it('registry binds fields to topics with arg filtering', async () => {
    const bus = new EventBus();
    const reg = new SubscriptionRegistry(bus);
    reg.bind({
      field: 'orderUpdated',
      topic: 'orders.updated',
      filter: (args, p) => (p as { id: number }).id === (args.id as number),
      map: (p) => p,
    });

    const sub = reg.subscribe('orderUpdated', { id: 42 });
    const iter = sub[Symbol.asyncIterator]();
    // Async generators don't run their body until the first next() —
    // kick it so the bus subscription exists before we publish.
    const pending = iter.next();
    // Let the microtask reach the `for await` (i.e. bus.subscribe ran).
    await Promise.resolve();

    // Wrong id → filtered out; right id → delivered.
    bus.publish('orders.updated', { id: 99, status: 'shipped' });
    bus.publish('orders.updated', { id: 42, status: 'paid' });
    const ev = await pending;
    expect(ev.value).toEqual({ orderUpdated: { id: 42, status: 'paid' } });
    // Terminate the generator — releases the bus subscription.
    await iter.return(undefined);
  });

  it('counts subscribers and deliveries', () => {
    const bus = new EventBus();
    const s1 = bus.subscribe('x');
    const s2 = bus.subscribe('x');
    expect(bus.subscriberCount('x')).toBe(2);
    expect(bus.publish('x', 1)).toBe(2);
    expect(bus.stats().delivered).toBe(2);
    bus.unsubscribe('x', s1);
    bus.unsubscribe('x', s2);
  });
});

/* ------------------------------------------------------------------ */

describe('GraphQLGateway', () => {
  it('APQ handshake: miss → register → hit', () => {
    const gw = new GraphQLGateway();
    const q = `{ me { id } }`;
    const h = queryHash(q);
    expect(gw.prepare({ hash: h }).status).toBe('persisted-query-not-found');
    // Client retries with full text + hash → registered.
    expect(gw.prepare({ query: q, hash: h }).status).toBe('execute');
    // Now hash-only works.
    expect(gw.prepare({ hash: h }).status).toBe('execute');
  });

  it('rejects over-complex queries before execution', () => {
    const gw = new GraphQLGateway({ complexity: { maxComplexity: 50 } });
    const r = gw.prepare({ query: `{ users(first: 100) { friends(first: 50) { id } } }` });
    expect(r.status).toBe('complexity-rejected');
  });

  it('rejects malformed queries', () => {
    const gw = new GraphQLGateway();
    expect(gw.prepare({ query: `{ unclosed` }).status).toBe('parse-error');
  });

  it('issues request-scoped loaders', async () => {
    const gw = new GraphQLGateway();
    let calls = 0;
    const l1 = gw.createLoader<string, number>(async (ks) => { calls++; return ks.map(() => 1); });
    const l2 = gw.createLoader<string, number>(async (ks) => { calls++; return ks.map(() => 2); });
    await Promise.all([l1.load('a'), l2.load('a')]);
    expect(calls).toBe(2); // separate loaders → separate batches
  });
});
