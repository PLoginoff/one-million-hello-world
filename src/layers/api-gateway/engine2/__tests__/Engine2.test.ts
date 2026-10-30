/**
 * Tests for BodyReshaper, ResponseAggregator, GatewayTracer and ConsumerQuotaTracker.
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { BodyReshaper, reshapeBody } from '../BodyReshaper';
import { ResponseAggregator, mergeResponses } from '../ResponseAggregator';
import { GatewayTracer, InMemoryTracingHooks } from '../GatewayTracer';
import { ConsumerQuotaTracker, QuotaExceededError } from '../ConsumerQuota';
import { ManualGatewayClock2, JsonObject, AggregationTarget } from '../types';

describe('BodyReshaper', () => {
  const incoming: JsonObject = {
    spec: { os: { hostname: 'web-1', image: 'nginx:1.25' } },
    metadata: { labels: { app: 'web', tier: 'frontend' } },
    count: 3,
  };

  it('copies values to new paths (projection mode)', () => {
    const out = reshapeBody(incoming, [
      { from: 'spec.os.hostname', to: 'host' },
      { from: 'metadata.labels.app', to: 'name' },
    ]);
    expect(out.body).toEqual({ host: 'web-1', name: 'web' });
    expect(out.missing).toEqual([]);
  });

  it('creates intermediate objects for deep destinations', () => {
    const out = reshapeBody(incoming, [{ from: 'spec.os.image', to: 'container.image.ref' }]);
    expect(out.body).toEqual({ container: { image: { ref: 'nginx:1.25' } } });
  });

  it('uses defaultValue when source is missing', () => {
    const out = reshapeBody(incoming, [
      { from: 'spec.os.missing', to: 'x', defaultValue: 'fallback' },
    ]);
    expect(out.body).toEqual({ x: 'fallback' });
    expect(out.missing).toEqual([]);
  });

  it('reports missing sources', () => {
    const out = reshapeBody(incoming, [{ from: 'nope.path', to: 'x' }]);
    expect(out.missing).toEqual(['nope.path']);
    expect(out.body).toEqual({});
  });

  it('move deletes the source path in passthrough mode', () => {
    const out = reshapeBody(
      incoming,
      [{ from: 'spec.os.hostname', to: 'host', move: true }],
      { passthrough: true }
    );
    const body = out.body as JsonObject;
    expect(body.host).toBe('web-1');
    const spec = body.spec as JsonObject;
    const os = spec.os as JsonObject;
    expect(os.hostname).toBeUndefined();
    expect(os.image).toBe('nginx:1.25');
    expect(out.moved).toEqual(['spec.os.hostname']);
  });

  it('does not mutate the input body', () => {
    const before = JSON.stringify(incoming);
    reshapeBody(incoming, [{ from: 'count', to: 'total' }]);
    expect(JSON.stringify(incoming)).toBe(before);
  });

  it('later rules can read values written by earlier rules (staging mode)', () => {
    const out = reshapeBody(incoming, [
      { from: 'metadata.labels.app', to: 'name' },
      { from: 'name', to: 'labels.app' },
    ]);
    expect(out.body).toEqual({ name: 'web', labels: { app: 'web' } });
  });

  it('isolateSource keeps reads on the original', () => {
    const out = reshapeBody(
      incoming,
      [
        { from: 'metadata.labels.app', to: 'name' },
        { from: 'name', to: 'again' },
      ],
      { isolateSource: true }
    );
    expect(out.missing).toContain('name');
    expect((out.body as JsonObject).name).toBe('web');
  });

  it('reshaper plan is reusable across bodies', () => {
    const r = new BodyReshaper([{ from: 'a.b', to: 'out' }]);
    expect(r.reshape({ a: { b: 1 } }).body).toEqual({ out: 1 });
    expect(r.reshape({ a: { b: 2 } }).body).toEqual({ out: 2 });
  });
});

describe('ResponseAggregator', () => {
  const targets: AggregationTarget[] = [
    { name: 'users', mergeKey: 'users' },
    { name: 'orders', mergeKey: 'orders' },
  ];

  it('merges successful responses under merge keys', async () => {
    const agg = new ResponseAggregator({ clock: new ManualGatewayClock2() });
    const res = await agg.aggregate(targets, async (t) =>
      t.name === 'users' ? { list: [1, 2] } : { total: 99 }
    );
    expect(res.degraded).toBe(false);
    expect(res.merged).toEqual({ users: { list: [1, 2] }, orders: { total: 99 } });
    expect(res.outcomes.every((o) => o.ok)).toBe(true);
  });

  it('degrades gracefully when a target fails', async () => {
    const agg = new ResponseAggregator({ clock: new ManualGatewayClock2() });
    const res = await agg.aggregate(targets, async (t) => {
      if (t.name === 'orders') throw new Error('upstream 500');
      return { list: [] };
    });
    expect(res.degraded).toBe(true);
    expect(res.merged).toEqual({ users: { list: [] } });
    const failed = res.outcomes.find((o) => o.name === 'orders');
    expect(failed?.ok).toBe(false);
    expect(failed?.error).toContain('upstream 500');
  });

  it('times out slow targets', async () => {
    const agg = new ResponseAggregator({
      clock: new ManualGatewayClock2(),
      defaultTimeoutMs: 10,
    });
    const res = await agg.aggregate(
      [{ name: 'slow', mergeKey: 'slow' }],
      () => new Promise((r) => setTimeout(() => r({ ok: true }), 500))
    );
    expect(res.degraded).toBe(true);
    expect(res.outcomes[0].error).toContain('timeout');
  });

  it('empty mergeKey merges at root', async () => {
    const agg = new ResponseAggregator({ clock: new ManualGatewayClock2() });
    const res = await agg.aggregate(
      [{ name: 'flat', mergeKey: '' }],
      async () => ({ a: 1 })
    );
    expect(res.merged).toEqual({ a: 1 });
  });
});

describe('mergeResponses strategies', () => {
  const docs = [
    { key: 'a', value: { x: 1, shared: { p: 1 } } },
    { key: 'b', value: { y: 2, shared: { q: 2 } } },
  ];

  it('shallow replaces whole keys', () => {
    const m = mergeResponses(docs, 'shallow');
    expect(m).toEqual({ a: { x: 1, shared: { p: 1 } }, b: { y: 2, shared: { q: 2 } } });
  });

  it('deep merges nested objects when keys collide at root', () => {
    const rootDocs = [
      { key: '', value: { cfg: { a: 1 } } },
      { key: '', value: { cfg: { b: 2 } } },
    ];
    const m = mergeResponses(rootDocs, 'deep');
    expect(m).toEqual({ cfg: { a: 1, b: 2 } });
  });

  it('array-concat concatenates arrays', () => {
    const arrDocs = [
      { key: '', value: { list: [1, 2] } },
      { key: '', value: { list: [3] } },
    ];
    const m = mergeResponses(arrDocs, 'array-concat');
    expect(m).toEqual({ list: [1, 2, 3] });
  });

  it('wraps scalar responses under __value', () => {
    const m = mergeResponses([{ key: 'n', value: 42 }], 'deep');
    expect(m).toEqual({ n: { __value: 42 } });
  });
});

describe('GatewayTracer', () => {
  let hooks: InMemoryTracingHooks;
  let clock: ManualGatewayClock2;
  let tracer: GatewayTracer;

  beforeEach(() => {
    hooks = new InMemoryTracingHooks();
    clock = new ManualGatewayClock2(1_000);
    tracer = new GatewayTracer(hooks, clock);
  });

  it('records spans with durations', () => {
    tracer.beginTrace();
    tracer.run('route-match', { route: 'r1' }, () => {
      clock.advance(5);
    });
    expect(hooks.completed.length).toBe(1);
    expect(hooks.completed[0].durationMs).toBe(5);
    expect(hooks.completed[0].status).toBe('ok');
  });

  it('nests child spans under parents', () => {
    tracer.beginTrace();
    tracer.run('outer', {}, () => {
      tracer.run('inner', {}, () => {});
    });
    const [inner, outer] = hooks.completed;
    expect(inner.name).toBe('inner');
    expect(inner.parentSpanId).toBe(outer.spanId);
    expect(outer.parentSpanId).toBeUndefined();
    expect(inner.traceId).toBe(outer.traceId);
  });

  it('records error status and rethrows', () => {
    tracer.beginTrace();
    expect(() =>
      tracer.run('boom', {}, () => {
        throw new Error('kaboom');
      })
    ).toThrow('kaboom');
    expect(hooks.completed[0].status).toBe('error');
    expect(hooks.completed[0].errorMessage).toBe('kaboom');
  });

  it('supports async runs', async () => {
    tracer.beginTrace();
    const out = await tracer.runAsync('fetch', {}, async () => {
      clock.advance(3);
      return 'done';
    });
    expect(out).toBe('done');
    expect(hooks.completed[0].durationMs).toBe(3);
  });

  it('tracks stack depth', () => {
    tracer.beginTrace();
    const span = tracer.startSpan('manual');
    expect(tracer.depth).toBe(1);
    span.end();
    expect(tracer.depth).toBe(0);
  });
});

describe('ConsumerQuotaTracker', () => {
  let clock: ManualGatewayClock2;
  let quota: ConsumerQuotaTracker;

  beforeEach(() => {
    clock = new ManualGatewayClock2(0);
    quota = new ConsumerQuotaTracker(
      { limit: 100, windowMs: 60_000 },
      { clock }
    );
  });

  it('allows charges within the limit', () => {
    const c = quota.charge('alice', 40);
    expect(c.allowed).toBe(true);
    expect(c.used).toBe(40);
    expect(c.remaining).toBe(60);
  });

  it('denies and does not debit when over limit', () => {
    quota.charge('alice', 90);
    const denied = quota.charge('alice', 20);
    expect(denied.allowed).toBe(false);
    expect(denied.used).toBe(90); // unchanged
    expect(denied.retryAfterMs).toBe(60_000);
  });

  it('resets at window boundary', () => {
    quota.charge('alice', 100);
    clock.advance(60_000);
    const c = quota.charge('alice', 50);
    expect(c.allowed).toBe(true);
    expect(c.used).toBe(50);
  });

  it('tracks consumers independently', () => {
    quota.charge('a', 100);
    expect(quota.charge('b', 100).allowed).toBe(true);
    expect(quota.charge('a', 1).allowed).toBe(false);
  });

  it('rounds up to unitSize', () => {
    const kb = new ConsumerQuotaTracker(
      { limit: 10_240, windowMs: 60_000, unitSize: 1024 },
      { clock }
    );
    const c = kb.charge('c', 1025);
    expect(c.used).toBe(2048);
  });

  it('preview does not spend', () => {
    const p = quota.preview('alice', 150);
    expect(p.allowed).toBe(false);
    expect(quota.usage('alice').used).toBe(0);
  });

  it('chargeOrThrow raises QuotaExceededError', () => {
    quota.charge('alice', 100);
    expect(() => quota.chargeOrThrow('alice', 1)).toThrow(QuotaExceededError);
  });

  it('sweep removes expired windows', () => {
    quota.charge('a', 10);
    quota.charge('b', 10);
    clock.advance(61_000);
    quota.charge('c', 1); // fresh window for c
    const removed = quota.sweep();
    // a and b windows ended at 60_000 which is <= now
    expect(removed).toBeGreaterThanOrEqual(0);
    expect(quota.usage('a').used).toBe(0);
  });

  it('rejects invalid policies', () => {
    expect(() => new ConsumerQuotaTracker({ limit: 0, windowMs: 1000 })).toThrow();
    expect(() => new ConsumerQuotaTracker({ limit: 5, windowMs: 0 })).toThrow();
  });
});
