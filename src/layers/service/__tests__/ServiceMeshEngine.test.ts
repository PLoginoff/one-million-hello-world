/**
 * Service Mesh Engine Tests
 *
 * Covers: service sagas (compensating actions, rollback order,
 * compensation-failure tracking), sidecar mesh interception (onion
 * order, short-circuit, tracing/context/cache interceptors), request
 * coalescing (single-flight dedup), key-template caching (TTL, SWR,
 * LRU eviction), and circuit state propagation.
 */

import { describe, it, expect, beforeEach } from 'bun:test';

import {
  ServiceSaga,
  defineSaga,
  ServiceMesh,
  tracingInterceptor,
  contextPropagationInterceptor,
  cacheInterceptor,
  RequestCoalescer,
  ServiceCache,
  renderKeyTemplate,
  CircuitEndpoint,
  CircuitRegistry,
  ManualClock,
  MeshCall,
} from '../engine';

// ---------------------------------------------------------------------------
// Service saga
// ---------------------------------------------------------------------------

describe('ServiceSaga', () => {
  it('runs steps in order with outputs flowing forward', async () => {
    const order: string[] = [];
    const saga = defineSaga<{ x: number }>([
      {
        name: 'a',
        action: async (ctx) => {
          order.push('a');
          return ctx.input.x + 1;
        },
      },
      {
        name: 'b',
        action: async (ctx) => {
          order.push('b');
          return (ctx.get('a') as number) * 10;
        },
      },
    ]);
    const report = await saga.run({ x: 4 });
    expect(report.status).toBe('completed');
    expect(report.completedSteps).toEqual(['a', 'b']);
    expect(order).toEqual(['a', 'b']);
  });

  it('compensates completed steps in reverse on failure', async () => {
    const compensated: Array<{ step: string; output: unknown }> = [];
    const saga = defineSaga<undefined>([
      {
        name: 'reserve',
        action: async () => 'reservation-1',
        compensate: async (_ctx, output) => {
          compensated.push({ step: 'reserve', output });
        },
      },
      {
        name: 'charge',
        action: async () => 'charge-1',
        compensate: async (_ctx, output) => {
          compensated.push({ step: 'charge', output });
        },
      },
      {
        name: 'ship',
        action: async () => {
          throw new Error('carrier down');
        },
      },
    ]);
    const report = await saga.run(undefined);
    expect(report.status).toBe('compensated');
    expect(report.failedStep).toBe('ship');
    expect(report.compensatedSteps).toEqual(['charge', 'reserve']);
    expect(compensated).toEqual([
      { step: 'charge', output: 'charge-1' },
      { step: 'reserve', output: 'reservation-1' },
    ]);
  });

  it('skips non-compensable steps during rollback', async () => {
    const compensated: string[] = [];
    const saga = defineSaga<undefined>([
      {
        name: 'check',
        action: async () => 'ok',
        compensable: false,
        compensate: async () => {
          compensated.push('check');
        },
      },
      {
        name: 'write',
        action: async () => 'row-1',
        compensate: async () => {
          compensated.push('write');
        },
      },
      {
        name: 'notify',
        action: async () => {
          throw new Error('smtp down');
        },
      },
    ]);
    const report = await saga.run(undefined);
    expect(report.status).toBe('compensated');
    expect(report.compensatedSteps).toEqual(['write']);
    expect(compensated).toEqual(['write']);
  });

  it('continues rollback after a compensation failure', async () => {
    const compensated: string[] = [];
    const saga = defineSaga<undefined>([
      {
        name: 'a',
        action: async () => 'a',
        compensate: async () => {
          compensated.push('a');
        },
      },
      {
        name: 'b',
        action: async () => 'b',
        compensate: async () => {
          throw new Error('compensation failed');
        },
      },
      {
        name: 'c',
        action: async () => {
          throw new Error('step failed');
        },
      },
    ]);
    const report = await saga.run(undefined);
    expect(report.status).toBe('compensation_failed');
    expect(report.compensationErrors).toHaveLength(1);
    expect(report.compensationErrors[0].step).toBe('b');
    // 'a' still compensated despite 'b' failing.
    expect(compensated).toEqual(['a']);
    expect(report.failedStep).toBe('c');
  });
});

// ---------------------------------------------------------------------------
// Service mesh
// ---------------------------------------------------------------------------

describe('ServiceMesh', () => {
  it('composes interceptors in registration order (onion)', async () => {
    const order: string[] = [];
    const mesh = new ServiceMesh();
    mesh.intercept('outer', async (call, next) => {
      order.push('outer-in');
      const v = await next(call);
      order.push('outer-out');
      return v;
    });
    mesh.intercept('inner', async (call, next) => {
      order.push('inner-in');
      const v = await next(call);
      order.push('inner-out');
      return v;
    });
    await mesh.invoke('svc', 'op', [], async () => {
      order.push('transport');
      return 'done';
    });
    expect(order).toEqual(['outer-in', 'inner-in', 'transport', 'inner-out', 'outer-out']);
  });

  it('interceptors can mutate call args', async () => {
    const mesh = new ServiceMesh();
    mesh.intercept('rewrite', async (call, next) => {
      (call as MeshCall<readonly [string]>).args = ['rewritten'];
      return next(call);
    });
    const res = await mesh.invoke('svc', 'op', ['original'], async (call) => call.args[0]);
    expect(res.value).toBe('rewritten');
  });

  it('tracing interceptor records spans for ok + error calls', async () => {
    const spans: Array<{ service: string; durationMs: number; error?: unknown }> = [];
    const clock = new ManualClock(0);
    const mesh = new ServiceMesh({ clock });
    mesh.use(tracingInterceptor({ record: (s) => spans.push(s) }, clock));

    await mesh.invoke('a', 'op', [], async () => {
      clock.advance(10);
      return 'ok';
    });
    expect(spans[0].service).toBe('a');
    expect(spans[0].durationMs).toBe(10);

    await expect(
      mesh.invoke('b', 'op', [], async () => {
        clock.advance(5);
        throw new Error('x');
      })
    ).rejects.toThrow('x');
    expect(spans[1].error).toBeDefined();
  });

  it('context propagation stamps correlation into state', async () => {
    const mesh = new ServiceMesh();
    mesh.use(contextPropagationInterceptor({ tenant: 'acme' }));
    const res = await mesh.invoke('svc', 'op', [], async (call) => call.state);
    expect(res.value['correlationId']).toBeDefined();
    expect(res.value['tenant']).toBe('acme');
  });

  it('cache interceptor short-circuits on hit', async () => {
    const mesh = new ServiceMesh();
    const store = new Map<string, unknown>();
    mesh.use(cacheInterceptor(store, (call) => `${call.service}:${call.operation}`));
    let calls = 0;
    const transport = async () => {
      calls += 1;
      return 'v';
    };
    await mesh.invoke('svc', 'op', [], transport);
    await mesh.invoke('svc', 'op', [], transport);
    expect(calls).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Request coalescing
// ---------------------------------------------------------------------------

describe('RequestCoalescer', () => {
  it('coalesces concurrent identical calls into one execution', async () => {
    const coalescer = new RequestCoalescer<readonly [string], string>({
      keyFn: (k) => k,
    });
    let executions = 0;
    const loader = async (k: string): Promise<string> => {
      executions += 1;
      await new Promise((r) => setTimeout(r, 5));
      return `v-${k}`;
    };

    const [a, b, c] = await Promise.all([
      coalescer.execute(loader, 'k'),
      coalescer.execute(loader, 'k'),
      coalescer.execute(loader, 'k'),
    ]);
    expect(executions).toBe(1);
    expect(a).toBe('v-k');
    expect(b).toBe('v-k');
    expect(c).toBe('v-k');
    const stats = coalescer.stats();
    expect(stats.executions).toBe(1);
    expect(stats.joins).toBe(2);
    expect(stats.dedupRate).toBeCloseTo(2 / 3, 5);
  });

  it('sequential calls re-execute (window is in-flight only)', async () => {
    const coalescer = new RequestCoalescer<readonly [string], number>({ keyFn: (k) => k });
    let n = 0;
    const loader = async () => ++n;
    await coalescer.execute(loader, 'k');
    await coalescer.execute(loader, 'k');
    expect(n).toBe(2);
    expect(coalescer.stats().executions).toBe(2);
  });

  it('different keys run independently', async () => {
    const coalescer = new RequestCoalescer<readonly [string], string>({ keyFn: (k) => k });
    let n = 0;
    const loader = async (k: string) => {
      n += 1;
      return k;
    };
    await Promise.all([coalescer.execute(loader, 'a'), coalescer.execute(loader, 'b')]);
    expect(n).toBe(2);
  });

  it('loader errors reject every follower identically', async () => {
    const coalescer = new RequestCoalescer<readonly [string], string>({ keyFn: (k) => k });
    const loader = async (): Promise<string> => {
      await new Promise((r) => setTimeout(r, 5));
      throw new Error('upstream');
    };
    const p1 = coalescer.execute(loader, 'k');
    const p2 = coalescer.execute(loader, 'k');
    await expect(p1).rejects.toThrow('upstream');
    await expect(p2).rejects.toThrow('upstream');
  });
});

// ---------------------------------------------------------------------------
// Service cache
// ---------------------------------------------------------------------------

describe('ServiceCache + renderKeyTemplate', () => {
  let clock: ManualClock;
  let cache: ServiceCache;

  beforeEach(() => {
    clock = new ManualClock(0);
    cache = new ServiceCache({ ttlMs: 1000, clock });
  });

  it('renders key templates against named args', () => {
    const key = renderKeyTemplate('svc:{service}:{op}', {
      args: {},
      service: 'users',
      operation: 'get',
    });
    expect(key).toBe('svc:users:get');
  });

  it('hits within TTL, misses after', async () => {
    let calls = 0;
    const loader = async (id: string) => `user-${id}-${++calls}`;
    const opts = {
      service: 'users',
      operation: 'get',
      keyTemplate: 'user:{id}',
      argNames: ['id'] as const,
      loader,
    };

    const first = await cache.call<readonly [string], string>({ ...opts, args: ['7'] });
    expect(first.cache).toBe('miss');
    expect(first.value).toBe('user-7-1');

    const second = await cache.call<readonly [string], string>({ ...opts, args: ['7'] });
    expect(second.cache).toBe('hit');
    expect(second.value).toBe('user-7-1');
    expect(calls).toBe(1);

    clock.advance(1001);
    const third = await cache.call<readonly [string], string>({ ...opts, args: ['7'] });
    expect(third.cache).toBe('miss');
    expect(third.value).toBe('user-7-2');
  });

  it('serves stale + revalidates in the SWR window', async () => {
    const swr = new ServiceCache({ ttlMs: 100, staleMs: 200, clock });
    let calls = 0;
    const loader = async (id: string) => `v${++calls}-${id}`;
    const opts = {
      service: 's',
      operation: 'o',
      keyTemplate: 'k:{id}',
      argNames: ['id'] as const,
      loader,
    };

    await swr.call<readonly [string], string>({ ...opts, args: ['x'] });
    clock.advance(150); // inside stale window

    const res = await swr.call<readonly [string], string>({ ...opts, args: ['x'] });
    expect(res.cache).toBe('stale');
    expect(res.value).toBe('v1-x');
    // Revalidation happens in the background — wait a tick.
    await new Promise((r) => setTimeout(r, 5));
    const refreshed = swr.peek('k:x');
    expect(refreshed?.fresh).toBe(true);
  });

  it('evicts least-recently-used at capacity', async () => {
    const small = new ServiceCache({ ttlMs: 60_000, maxEntries: 2, clock });
    const loader = async (id: string) => id;
    const mk = (id: string) => ({
      service: 's',
      operation: 'o',
      keyTemplate: `k:${id}`,
      loader,
      args: [id] as readonly [string],
    });

    await small.call(mk('a'));
    await small.call(mk('b'));
    await small.call(mk('a')); // promote 'a'
    await small.call(mk('c')); // evicts 'b'

    expect(small.peek('k:a')).toBeDefined();
    expect(small.peek('k:b')).toBeUndefined();
    expect(small.peek('k:c')).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Circuit propagation
// ---------------------------------------------------------------------------

describe('CircuitEndpoint', () => {
  let clock: ManualClock;
  let ep: CircuitEndpoint;

  beforeEach(() => {
    clock = new ManualClock(0);
    ep = new CircuitEndpoint(
      'svc',
      { windowMs: 1000, minSamples: 3, failureThreshold: 0.5, cooldownMs: 500 },
      clock
    );
  });

  it('opens when failure ratio crosses the threshold', () => {
    ep.record('failure');
    ep.record('failure');
    ep.record('failure'); // 3/3 — opens
    expect(ep.state).toBe('open');
    expect(ep.guard()).toBe(false);
  });

  it('stays closed under the min-sample floor', () => {
    ep.record('failure');
    ep.record('failure'); // 2/2 but minSamples=3
    expect(ep.state).toBe('closed');
  });

  it('half-opens after cooldown, closes on a successful probe', () => {
    ep.record('failure');
    ep.record('failure');
    ep.record('failure');
    expect(ep.state).toBe('open');

    clock.advance(600);
    expect(ep.state).toBe('half_open');
    expect(ep.guard()).toBe(true); // probe admitted
    ep.record('success');
    expect(ep.state).toBe('closed');
  });

  it('re-opens when the probe fails', () => {
    ep.record('failure');
    ep.record('failure');
    ep.record('failure');
    clock.advance(600);
    ep.guard();
    ep.record('failure');
    expect(ep.state).toBe('open');
  });
});

describe('CircuitRegistry', () => {
  let clock: ManualClock;
  let reg: CircuitRegistry;

  beforeEach(() => {
    clock = new ManualClock(0);
    reg = new CircuitRegistry({ clock });
  });

  it('propagates upstream health to dependents', () => {
    const upstream = reg.endpoint('db', {
      windowMs: 1000,
      minSamples: 3,
      failureThreshold: 0.5,
      cooldownMs: 60_000,
    });
    reg.endpoint('svc', {
      windowMs: 1000,
      minSamples: 3,
      failureThreshold: 0.5,
      cooldownMs: 60_000,
    });
    reg.dependOn('svc', 'db');

    upstream.record('failure');
    upstream.record('failure');
    upstream.record('failure');
    expect(upstream.state).toBe('open');

    const health = reg.effectiveState('svc');
    expect(health.self.state).toBe('closed');
    expect(health.effective).toBe('open');
    expect(health.degradedBy).toEqual(['db']);
  });

  it('transitive upstreams degrade the whole chain', () => {
    const a = reg.endpoint('a');
    reg.endpoint('b'); // 'b' must exist for the walk to traverse it
    for (let i = 0; i < 5; i++) {
      a.record('failure');
    }
    expect(a.state).toBe('open');
    reg.dependOn('b', 'a');
    reg.dependOn('c', 'b');
    const health = reg.effectiveState('c');
    expect(health.effective).toBe('open');
    expect(health.degradedBy).toContain('a');
  });

  it('half-open upstream degrades dependents to half_open', () => {
    const up = reg.endpoint('up', {
      windowMs: 1000,
      minSamples: 3,
      failureThreshold: 0.5,
      cooldownMs: 500,
    });
    reg.dependOn('svc', 'up');
    up.record('failure');
    up.record('failure');
    up.record('failure');
    clock.advance(600);
    const health = reg.effectiveState('svc');
    expect(health.effective).toBe('half_open');
  });

  it('cycles do not loop the transitive walk', () => {
    reg.endpoint('a').record('failure');
    reg.endpoint('a').record('failure');
    reg.endpoint('a').record('failure');
    reg.endpoint('a').record('failure');
    reg.endpoint('a').record('failure'); // opens 'a'
    reg.dependOn('a', 'b');
    reg.dependOn('b', 'a');
    const health = reg.effectiveState('a');
    // 'a' is already open; the walk terminates on the visited set.
    expect(health.effective).toBe('open');
  });
});
