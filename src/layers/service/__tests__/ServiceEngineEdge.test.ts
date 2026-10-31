/**
 * Service Engine — Edge Case Tests
 *
 * Boundary conditions for sagas (empty, single-step, ctx.put/get),
 * mesh interceptors (short-circuit, mutation, correlation), coalescing
 * under burst load, template caching quirks, circuit cooldown edges,
 * and the operation registry wiring.
 */

import { describe, it, expect, beforeEach } from 'bun:test';

import {
  ServiceSaga,
  defineSaga,
  ServiceMesh,
  RequestCoalescer,
  ServiceCache,
  renderKeyTemplate,
  CircuitEndpoint,
  CircuitRegistry,
  ServiceOperationRegistry,
  ManualClock,
} from '../engine';

// ---------------------------------------------------------------------------
// Saga edges
// ---------------------------------------------------------------------------

describe('ServiceSaga — edges', () => {
  it('empty saga completes immediately', async () => {
    const saga = defineSaga<undefined>([]);
    const report = await saga.run(undefined);
    expect(report.status).toBe('completed');
    expect(report.completedSteps).toHaveLength(0);
  });

  it('ctx.put/get share state across steps', async () => {
    const saga = defineSaga<undefined>([
      {
        name: 'produce',
        action: async (ctx) => {
          ctx.put('intermediate', 42);
          return 'p';
        },
      },
      {
        name: 'consume',
        action: async (ctx) => ctx.get('intermediate'),
      },
    ]);
    const report = await saga.run(undefined);
    expect(report.status).toBe('completed');
    expect(report.outputs.get('intermediate')).toBe(42);
    expect(report.outputs.get('consume')).toBe(42);
  });

  it('single failing step reports failedStep with empty compensation', async () => {
    const saga = defineSaga<undefined>([
      {
        name: 'only',
        action: async () => {
          throw new Error('boom');
        },
      },
    ]);
    const report = await saga.run(undefined);
    expect(report.status).toBe('compensated');
    expect(report.failedStep).toBe('only');
    expect(report.compensatedSteps).toHaveLength(0);
  });

  it('compensation receives its own step output, not the aggregate', async () => {
    const received: unknown[] = [];
    const saga = defineSaga<undefined>([
      {
        name: 'a',
        action: async () => 'A-OUT',
        compensate: async (_ctx, output) => {
          received.push(output);
        },
      },
      {
        name: 'b',
        action: async () => {
          throw new Error('x');
        },
      },
    ]);
    await saga.run(undefined);
    expect(received).toEqual(['A-OUT']);
  });
});

// ---------------------------------------------------------------------------
// Mesh edges
// ---------------------------------------------------------------------------

describe('ServiceMesh — edges', () => {
  it('interceptor that never calls next short-circuits', async () => {
    const mesh = new ServiceMesh();
    mesh.intercept('gate', async () => 'short-circuited');
    const res = await mesh.invoke('svc', 'op', [], async () => 'transport');
    expect(res.value).toBe('short-circuited');
  });

  it('chain lists every interceptor that ran', async () => {
    const mesh = new ServiceMesh();
    mesh.intercept('a', async (call, next) => next(call));
    mesh.intercept('b', async (call, next) => next(call));
    const res = await mesh.invoke('svc', 'op', [], async () => 'x');
    expect(res.chain).toEqual(['a', 'b']);
  });

  it('correlation ids are unique per call', async () => {
    const mesh = new ServiceMesh();
    const r1 = await mesh.invoke('s', 'o', [], async (call) => call.correlationId);
    const r2 = await mesh.invoke('s', 'o', [], async (call) => call.correlationId);
    expect(r1.value).not.toBe(r2.value);
  });
});

// ---------------------------------------------------------------------------
// Coalescer edges
// ---------------------------------------------------------------------------

describe('RequestCoalescer — edges', () => {
  it('burst joins stay bounded — all followers share the leader result', async () => {
    const c = new RequestCoalescer<readonly [string], string>({ keyFn: (k) => k });
    let runs = 0;
    const loader = async (k: string) => {
      runs += 1;
      await new Promise((r) => setTimeout(r, 10));
      return `v-${k}`;
    };
    const results = await Promise.all(
      Array.from({ length: 50 }, () => c.execute(loader, 'hot'))
    );
    expect(runs).toBe(1);
    expect(results.every((r) => r === 'v-hot')).toBe(true);
    expect(c.stats().joins).toBe(49);
  });

  it('keyFn differences keep executions separate', async () => {
    const c = new RequestCoalescer<readonly [string, number], string>({
      keyFn: (a, b) => `${a}:${b}`,
    });
    let runs = 0;
    const loader = async () => {
      runs += 1;
      return 'x';
    };
    await Promise.all([c.execute(loader, 'a', 1), c.execute(loader, 'a', 2)]);
    expect(runs).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Cache edges
// ---------------------------------------------------------------------------

describe('ServiceCache — edges', () => {
  it('unresolved placeholders stay literal in the key', () => {
    const key = renderKeyTemplate('u:{id}:{missing}', {
      args: { id: '1' },
      service: 's',
      operation: 'o',
    });
    expect(key).toBe('u:1:{missing}');
  });

  it('fallback syntax renders the default', () => {
    const key = renderKeyTemplate('{x:default}', {
      args: {},
      service: 's',
      operation: 'o',
    });
    expect(key).toBe('default');
  });

  it('peek reports fresh/stale windows correctly', async () => {
    const clock = new ManualClock(0);
    const cache = new ServiceCache({ ttlMs: 100, staleMs: 100, clock });
    const loader = async () => 'v';
    await cache.call<readonly [], string>({
      service: 's',
      operation: 'o',
      keyTemplate: 'k',
      loader,
      args: [],
    });
    expect(cache.peek('k')?.fresh).toBe(true);
    clock.advance(150);
    const p = cache.peek('k');
    expect(p?.fresh).toBe(false);
    expect(p?.stale).toBe(true);
    clock.advance(100); // past stale window — peek still reports age
    expect(cache.peek('k')?.stale).toBe(false);
  });

  it('invalidate removes a specific key', async () => {
    const cache = new ServiceCache({ ttlMs: 1000 });
    await cache.call<readonly [], string>({
      service: 's',
      operation: 'o',
      keyTemplate: 'k',
      loader: async () => 'v',
      args: [],
    });
    expect(cache.invalidate('k')).toBe(true);
    expect(cache.peek('k')).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Circuit edges
// ---------------------------------------------------------------------------

describe('CircuitEndpoint — edges', () => {
  it('window evicts old samples — past failures stop counting', () => {
    const clock = new ManualClock(0);
    // Threshold above the eventual ratio — the point is sample
    // eviction, not tripping the breaker.
    const ep = new CircuitEndpoint(
      'x',
      { windowMs: 100, minSamples: 2, failureThreshold: 0.9, cooldownMs: 1000 },
      clock
    );
    ep.record('failure');
    ep.record('failure'); // ratio 1.0 — but still closed (threshold 0.9 < 1.0? no, 1.0 > 0.9) → opens
    expect(ep.state).toBe('open');
    clock.advance(200);
    // Old failures evicted from the window; the breaker stays open
    // until cooldown — eviction is about the *window*, not the state.
    expect(ep.windowCounts().total).toBe(0);
  });

  it('half_open admits only one concurrent probe', () => {
    const clock = new ManualClock(0);
    const ep = new CircuitEndpoint(
      'x',
      { windowMs: 1000, minSamples: 2, failureThreshold: 0.5, cooldownMs: 100 },
      clock
    );
    ep.record('failure');
    ep.record('failure');
    ep.record('failure');
    clock.advance(150);
    expect(ep.guard()).toBe(true);  // probe admitted
    expect(ep.guard()).toBe(false); // second concurrent probe rejected
  });
});

describe('CircuitRegistry — edges', () => {
  it('unregistered endpoint reports closed self-state', () => {
    const reg = new CircuitRegistry();
    const health = reg.effectiveState('ghost');
    expect(health.self.state).toBe('closed');
    expect(health.degradedBy).toHaveLength(0);
  });

  it('mixed closed+open upstreams degrade to open', () => {
    const clock = new ManualClock(0);
    const reg = new CircuitRegistry({ clock });
    const bad = reg.endpoint('bad', {
      windowMs: 1000,
      minSamples: 2,
      failureThreshold: 0.5,
      cooldownMs: 60_000,
    });
    reg.endpoint('good');
    reg.dependOn('svc', 'bad');
    reg.dependOn('svc', 'good');
    bad.record('failure');
    bad.record('failure');
    const health = reg.effectiveState('svc');
    expect(health.effective).toBe('open');
    expect(health.degradedBy).toEqual(['bad']);
  });
});

// ---------------------------------------------------------------------------
// Operation registry
// ---------------------------------------------------------------------------

describe('ServiceOperationRegistry', () => {
  let clock: ManualClock;
  let registry: ServiceOperationRegistry;

  beforeEach(() => {
    clock = new ManualClock(0);
    registry = new ServiceOperationRegistry({ clock });
  });

  it('invoke with cache+coalesce dedups concurrent misses', async () => {
    let loads = 0;
    registry.register('getUser', {
      loader: async (id: string) => `u${id}-${++loads}`,
      keyTemplate: 'user:{id}',
      argNames: ['id'],
      cacheTtlMs: 1000,
      coalesce: true,
    });

    const [a, b] = await Promise.all([
      registry.invoke<readonly [string], string>('getUser', '7'),
      registry.invoke<readonly [string], string>('getUser', '7'),
    ]);
    expect(a.value).toBe(b.value);
    expect(loads).toBe(1);
    const stats = registry.coalescerStats('getUser');
    expect(stats?.executions).toBe(1);
    expect(stats?.joins).toBe(1);
  });

  it('cache hit skips the loader on second call', async () => {
    let loads = 0;
    registry.register('expensive', {
      loader: async () => `v${++loads}`,
      keyTemplate: 'k',
      cacheTtlMs: 1000,
    });
    await registry.invoke('expensive');
    const res = await registry.invoke('expensive');
    expect(res.cache).toBe('hit');
    expect(loads).toBe(1);
  });

  it('unregistered invoke throws', async () => {
    await expect(registry.invoke('nope')).rejects.toThrow();
  });

  it('saga operations return the last step output + report', async () => {
    registry.register('checkout', {
      loader: async () => 'unreachable',
      saga: [
        { name: 'reserve', action: async () => 'r-1' },
        { name: 'charge', action: async (ctx) => `charged-${ctx.get('reserve')}` },
      ],
    });
    const res = await registry.invoke('checkout');
    expect(res.servedBy).toEqual(['saga']);
    expect(res.value).toBe('charged-r-1');
    expect(res.sagaReport?.status).toBe('completed');
  });

  it('upstreamState surfaces circuit propagation', async () => {
    const circuits = new CircuitRegistry({ clock });
    const reg = new ServiceOperationRegistry({ clock, circuits });
    const up = circuits.endpoint('db', {
      windowMs: 1000,
      minSamples: 2,
      failureThreshold: 0.5,
      cooldownMs: 60_000,
    });
    reg.register('svc-op', {
      loader: async () => 'v',
      dependsOn: ['db'],
    });
    up.record('failure');
    up.record('failure');
    const res = await reg.invoke('svc-op');
    expect(res.upstreamState).toBe('open');
  });
});

// ---------------------------------------------------------------------------
// Service health probe
// ---------------------------------------------------------------------------

describe('ServiceHealthProbe', () => {
  it('probes open endpoints and feeds recovery', async () => {
    const clock = new ManualClock(0);
    const reg = new CircuitRegistry({ clock });
    const { ServiceHealthProbe } = await import('../engine');
    const probe = new ServiceHealthProbe({ clock, baseBackoffMs: 100, probeTimeoutMs: 50 });

    const ep = reg.endpoint('db', {
      windowMs: 1000,
      minSamples: 2,
      failureThreshold: 0.5,
      cooldownMs: 200,
    });
    ep.record('failure');
    ep.record('failure');
    expect(ep.state).toBe('open');

    // Cooldown elapsed → endpoint is half-open; a successful probe
    // drives it closed.
    clock.advance(300);
    const reports = await probe.run(reg, async () => 'success');
    expect(reports.length).toBe(1);
    expect(reports[0].outcome).toBe('success');
    expect(ep.state).toBe('closed');
  });

  it('consecutive failures grow the probe backoff', async () => {
    const clock = new ManualClock(0);
    const reg = new CircuitRegistry({ clock });
    const { ServiceHealthProbe } = await import('../engine');
    const probe = new ServiceHealthProbe({ clock, baseBackoffMs: 100, backoffFactor: 2 });

    reg.endpoint('dead', {
      windowMs: 1000,
      minSamples: 2,
      failureThreshold: 0.5,
      cooldownMs: 50,
    }).record('failure');
    reg.endpoint('dead').record('failure');

    await probe.run(reg, async () => 'failure');
    const s1 = probe.stateOf('dead');
    expect(s1?.consecutiveFailures).toBe(1);
    expect(s1?.backoffMs).toBe(200);

    clock.advance(250);
    await probe.run(reg, async () => 'failure');
    const s2 = probe.stateOf('dead');
    expect(s2?.consecutiveFailures).toBe(2);
    expect(s2?.backoffMs).toBe(400);
  });

  it('skips probes when backoff has not elapsed', async () => {
    const clock = new ManualClock(0);
    const reg = new CircuitRegistry({ clock });
    const { ServiceHealthProbe } = await import('../engine');
    const probe = new ServiceHealthProbe({ clock, baseBackoffMs: 1000 });

    reg.endpoint('x', {
      windowMs: 1000,
      minSamples: 2,
      failureThreshold: 0.5,
      cooldownMs: 100,
    }).record('failure');
    reg.endpoint('x').record('failure');

    await probe.run(reg, async () => 'failure');
    const before = probe.probesRun;
    clock.advance(100); // less than backoffMs=1000 → skipped
    const reports = await probe.run(reg, async () => 'failure');
    expect(reports.length).toBe(0);
    expect(probe.probesRun).toBe(before);
  });
});
