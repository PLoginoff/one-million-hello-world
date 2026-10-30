/**
 * ProxyEngine unit tests.
 *
 * Covers: virtual proxy lazy-init, protection proxy policies,
 * caching proxy TTL + SWR, remote stub serialize/hop/deserialize,
 * smart-reference refcounting, interceptor chain ordering +
 * short-circuit, and per-method introspection statistics.
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';

import { InterceptorChain, shortCircuit } from '../engine/InterceptorChain';
import { VirtualProxy } from '../engine/VirtualProxy';
import { ProtectionProxy } from '../engine/ProtectionProxy';
import { CachingProxy, stableStringify } from '../engine/CachingProxy';
import { RemoteProxyStub, LocalTransport } from '../engine/RemoteProxyStub';
import { SmartReference, ReleasedHandleError } from '../engine/SmartReference';
import { ProxyEngine } from '../engine/ProxyEngine';
import { ProxyStatistics } from '../engine/ProxyStatistics';
import {
  Invocation,
  ProxyAccessDeniedError,
  RemoteInvocationError,
  Principal,
} from '../engine/types';

/** Deterministic fake clock. */
function fakeClock(start = 1_000_000): { clock: () => number; advance: (ms: number) => void } {
  let now = start;
  return {
    clock: () => now,
    advance: (ms: number) => {
      now += ms;
    },
  };
}

/** Yield several microtasks so background async work can progress. */
async function flush(times = 10): Promise<void> {
  for (let i = 0; i < times; i++) {
    await Promise.resolve();
  }
}

const invocation = (method: string): Invocation => ({
  method,
  args: [],
  startedAt: 0,
  context: { attributes: {} },
});

const admin: Principal = { id: 'u-admin', roles: ['admin'], claims: {} };
const user: Principal = { id: 'u-user', roles: ['user'], claims: {} };

// ---------------------------------------------------------------------------

describe('InterceptorChain', () => {
  it('runs before hooks in order and after hooks in reverse order', async () => {
    const log: string[] = [];
    const chain = new InterceptorChain()
      .use({ name: 'a', before: () => { log.push('a-before'); return { kind: 'continue' }; }, after: (_i, o) => { log.push('a-after'); return o; } })
      .use({ name: 'b', before: () => { log.push('b-before'); return { kind: 'continue' }; }, after: (_i, o) => { log.push('b-after'); return o; } });

    const result = await chain.run(invocation('m'), async () => {
      log.push('target');
      return 42;
    });

    expect(result.value).toBe(42);
    expect(log).toEqual(['a-before', 'b-before', 'target', 'b-after', 'a-after']);
  });

  it('short-circuits before the target and skips later before-hooks', async () => {
    const log: string[] = [];
    let targetCalled = false;
    const chain = new InterceptorChain()
      .use({ name: 'first', before: () => { log.push('first'); return { kind: 'continue' }; } })
      .use({ name: 'sc', before: () => { log.push('sc'); return shortCircuit('cached!'); }, after: (_i, o) => { log.push('sc-after'); return o; } })
      .use({ name: 'never', before: () => { log.push('never'); return { kind: 'continue' }; } });

    const result = await chain.run(invocation('m'), async () => {
      targetCalled = true;
      return 'real';
    });

    expect(targetCalled).toBe(false);
    expect(result.shortCircuited).toBe(true);
    expect(result.value).toBe('cached!');
    expect(log).toEqual(['first', 'sc', 'sc-after']);
  });

  it('propagates target errors through after hooks', async () => {
    const seen: string[] = [];
    const chain = new InterceptorChain().use({
      name: 'observer',
      after: (_i, outcome) => {
        seen.push(String(outcome.error));
        return outcome;
      },
    });

    await expect(
      chain.run(invocation('m'), async () => {
        throw new Error('boom');
      })
    ).rejects.toThrow('boom');
    expect(seen).toEqual(['Error: boom']);
  });

  it('after hook can recover an error into a value', async () => {
    const chain = new InterceptorChain().use({
      name: 'recovery',
      after: (_i, outcome) => (outcome.error !== undefined ? { value: 'fallback' } : outcome),
    });

    const result = await chain.run(invocation('m'), async () => {
      throw new Error('downstream dead');
    });
    expect(result.value).toBe('fallback');
  });

  it('is immutable — use() returns a new chain', () => {
    const a = new InterceptorChain();
    const b = a.use({ name: 'x' });
    expect(a.size).toBe(0);
    expect(b.size).toBe(1);
    expect(b.names).toEqual(['x']);
  });

  it('rateLimit factory enforces minimum interval', async () => {
    const { clock, advance } = fakeClock();
    const chain = new InterceptorChain().use(InterceptorChain.rateLimit(100, clock));

    await chain.run(invocation('m'), async () => 1);
    await expect(chain.run(invocation('m'), async () => 2)).rejects.toThrow(/Rate limit/);
    advance(150);
    await chain.run(invocation('m'), async () => 3);
  });
});

// ---------------------------------------------------------------------------

describe('VirtualProxy', () => {
  it('does not call the factory until first use', async () => {
    let calls = 0;
    const proxy = new VirtualProxy(() => {
      calls++;
      return { greet: (name: unknown) => `hi ${name}` };
    });

    expect(calls).toBe(0);
    expect(proxy.isLoaded).toBe(false);
    const result = await proxy.invoke<string>('greet', ['bob']);
    expect(result).toBe('hi bob');
    expect(calls).toBe(1);
    expect(proxy.isLoaded).toBe(true);
  });

  it('realizes exactly once under concurrent first calls', async () => {
    let calls = 0;
    const proxy = new VirtualProxy(async () => {
      calls++;
      await flush(3); // widen the race window
      return { n: () => calls };
    });

    const [a, b, c] = await Promise.all([proxy.get(), proxy.get(), proxy.get()]);
    expect(a).toBe(b);
    expect(b).toBe(c);
    expect(calls).toBe(1);
  });

  it('retries after a failed factory call', async () => {
    let calls = 0;
    const proxy = new VirtualProxy(() => {
      calls++;
      if (calls === 1) throw new Error('init failed');
      return { ok: () => true };
    });

    await expect(proxy.get()).rejects.toThrow('init failed');
    const target = await proxy.get();
    expect(target.ok()).toBe(true);
    expect(calls).toBe(2);
  });

  it('reset() unloads and reinitializes on next use', async () => {
    let calls = 0;
    const unloaded: object[] = [];
    const proxy = new VirtualProxy(
      () => {
        calls++;
        return { id: calls };
      },
      { onUnload: (t) => { unloaded.push(t); } }
    );

    const first = await proxy.get();
    expect(await proxy.reset()).toBe(true);
    expect(proxy.isLoaded).toBe(false);
    expect(unloaded).toEqual([first]);

    const second = await proxy.get();
    expect(second).not.toBe(first);
    expect(calls).toBe(2);
    expect(await proxy.reset()).toBe(true);
    expect(await proxy.reset()).toBe(false); // already unloaded
  });

  it('rejects non-callable methods', async () => {
    const proxy = new VirtualProxy(() => ({ value: 5 }));
    await expect(proxy.invoke('value')).rejects.toThrow(TypeError);
  });
});

// ---------------------------------------------------------------------------

describe('ProtectionProxy', () => {
  const service = {
    read: (k: unknown) => `value:${k}`,
    write: (k: unknown, v: unknown) => `${k}=${v}`,
    drop: () => 'dropped!',
  };

  it('allows when the policy passes', async () => {
    const proxy = new ProtectionProxy(service);
    const ctx = { principal: admin, attributes: {} };
    expect(await proxy.invoke<string>('read', ['k1'], ctx)).toBe('value:k1');
  });

  it('denies unauthenticated calls with requireAuthenticated', async () => {
    const proxy = new ProtectionProxy(service).protect('write', ProtectionProxy.requireAuthenticated());
    await expect(proxy.invoke('write', ['k', 'v'], { attributes: {} })).rejects.toThrow(
      ProxyAccessDeniedError
    );
  });

  it('enforces role requirements per method', async () => {
    const proxy = new ProtectionProxy(service)
      .protect('drop', ProtectionProxy.requireRole('admin'));

    await expect(proxy.invoke('drop', [], { principal: user, attributes: {} })).rejects.toThrow(
      /Access denied/
    );
    expect(await proxy.invoke<string>('drop', [], { principal: admin, attributes: {} })).toBe('dropped!');
  });

  it('and/or/not combinators compose policies', async () => {
    const policy = ProtectionProxy.and(
      ProtectionProxy.requireAuthenticated(),
      ProtectionProxy.or(
        ProtectionProxy.requireRole('admin'),
        ProtectionProxy.requireArg((args) => args[0] === 'own', 'only own resource')
      )
    );
    const proxy = new ProtectionProxy(service).protect('write', policy);

    // admin can write anything
    await expect(proxy.invoke('write', ['any', 1], { principal: admin, attributes: {} })).resolves.toBe('any=1');
    // user can only write 'own'
    await expect(proxy.invoke('write', ['own', 1], { principal: user, attributes: {} })).resolves.toBe('own=1');
    await expect(proxy.invoke('write', ['other', 1], { principal: user, attributes: {} })).rejects.toThrow(
      ProxyAccessDeniedError
    );
    // not() denies the negation: allowPrincipals('u-user') allows only
    // u-user, so the negation denies u-user and allows everyone else.
    const banned = ProtectionProxy.not(ProtectionProxy.allowPrincipals('u-user'));
    expect(banned(admin, 'm', []).allowed).toBe(true);
    expect(banned(user, 'm', []).allowed).toBe(false);
  });

  it('records denials in the denial log', async () => {
    const proxy = new ProtectionProxy(service).protect('drop', ProtectionProxy.requireRole('admin'));
    await expect(proxy.invoke('drop', [], { principal: user, attributes: {} })).rejects.toThrow();
    expect(proxy.denialLog.length).toBe(1);
    expect(proxy.denialLog[0].method).toBe('drop');
    expect(proxy.denialLog[0].principalId).toBe('u-user');
  });

  it('check() queries capabilities without side effects', () => {
    const proxy = new ProtectionProxy(service).protect('drop', ProtectionProxy.requireRole('admin'));
    expect(proxy.check('drop', { principal: user, attributes: {} }).allowed).toBe(false);
    expect(proxy.check('drop', { principal: admin, attributes: {} }).allowed).toBe(true);
    expect(proxy.denialLog.length).toBe(0); // no logging on check
  });
});

// ---------------------------------------------------------------------------

describe('CachingProxy', () => {
  let calls: number;
  let proxies: CachingProxy<{ compute: (x: unknown) => unknown; mutate: (x: unknown) => unknown }>[];
  let service: { compute: (x: unknown) => unknown; mutate: (x: unknown) => unknown };

  beforeEach(() => {
    calls = 0;
    proxies = [];
    service = {
      compute: (x: unknown) => {
        calls++;
        return (x as number) * 2;
      },
      mutate: (x: unknown) => {
        calls++;
        return x;
      },
    };
  });

  // Stale-while-revalidate fires background revalidations; without cleanup
  // a still-pending revalidation from a previous test would land in this
  // test's fresh `service` and corrupt the shared `calls` counter.
  afterEach(async () => {
    for (const proxy of proxies) {
      proxy.invalidate();
    }
    await flush();
  });

  function track<P extends CachingProxy<typeof service>>(proxy: P): P {
    proxies.push(proxy);
    return proxy;
  }

  it('serves fresh hits without re-calling the target', async () => {
    const { clock } = fakeClock();
    const proxy = track(new CachingProxy(service, { ttl: 1000, clock })).cacheMethod('compute');

    const r1 = await proxy.invoke<number>('compute', [5]);
    const r2 = await proxy.invoke<number>('compute', [5]);

    expect(r1.cacheStatus).toBe('miss');
    expect(r2.cacheStatus).toBe('fresh');
    expect(r2.value).toBe(10);
    expect(calls).toBe(1);
  });

  it('bypasses non-cached methods', async () => {
    const proxy = track(new CachingProxy(service, { ttl: 1000 })).cacheMethod('compute');
    await proxy.invoke('mutate', [1]);
    await proxy.invoke('mutate', [1]);
    expect(calls).toBe(2);
    const r = await proxy.invoke('mutate', [1]);
    expect(r.cacheStatus).toBe('bypass');
    expect(calls).toBe(3);
  });

  it('refetches after TTL expiry', async () => {
    const { clock, advance } = fakeClock();
    const proxy = track(new CachingProxy(service, { ttl: 1000, clock })).cacheMethod('compute');

    await proxy.invoke('compute', [5]);
    advance(1001);
    const r = await proxy.invoke('compute', [5]);
    expect(r.cacheStatus).toBe('miss');
    expect(calls).toBe(2);
  });

  it('serves stale within SWR window and revalidates in background', async () => {
    const { clock, advance } = fakeClock();
    const proxy = track(
      new CachingProxy(service, { ttl: 1000, staleWhileRevalidateMs: 500, clock })
    ).cacheMethod('compute');

    await proxy.invoke('compute', [5]); // miss, stores at t0
    advance(1200); // past ttl, within ttl+swr
    const stale = await proxy.invoke('compute', [5]);
    expect(stale.cacheStatus).toBe('stale');
    expect(stale.value).toBe(10);
    // The synchronous target returns immediately, so the background
    // revalidation may already have completed — assert the contract
    // (stale was served) rather than an exact timing-dependent count.

    await flush();
    expect(calls).toBe(2); // background revalidation ran
    expect(proxy.counters.revalidations).toBe(1);

    const fresh = await proxy.invoke('compute', [5]);
    expect(fresh.cacheStatus).toBe('fresh');
  });

  it('single-flights concurrent misses for the same key', async () => {
    let resolveGate: (() => void) | null = null;
    const gated = {
      slow: async () => {
        calls++;
        await new Promise<void>((r) => { resolveGate = r; });
        return 'done';
      },
    };
    const proxy = new CachingProxy(gated, { ttl: 1000 }).cacheMethod('slow');
    proxies.push(proxy as unknown as CachingProxy<typeof service>);
    const p1 = proxy.invoke('slow');
    const p2 = proxy.invoke('slow');
    resolveGate!();
    await Promise.all([p1, p2]);
    expect(calls).toBe(1);
  });

  it('per-method TTL overrides the default', async () => {
    const { clock, advance } = fakeClock();
    const proxy = track(new CachingProxy(service, { ttl: 10_000, clock })).cacheMethod('compute', 500);
    await proxy.invoke('compute', [1]);
    advance(600);
    const r = await proxy.invoke('compute', [1]);
    expect(r.cacheStatus).toBe('miss');
    expect(calls).toBe(2);
  });

  it('invalidate() drops entries selectively and globally', async () => {
    const proxy = track(new CachingProxy(service, { ttl: 1000 })).cacheMethod('compute');
    await proxy.invoke('compute', [1]);
    await proxy.invoke('compute', [2]);
    expect(proxy.size).toBe(2);
    expect(calls).toBe(2);

    expect(proxy.invalidate('compute', [1])).toBe(1);
    await proxy.invoke('compute', [1]);
    expect(calls).toBe(3); // [1] was invalidated → refetched
    await proxy.invoke('compute', [2]);
    expect(calls).toBe(3); // [2] still cached → no extra call

    expect(proxy.invalidate()).toBe(2);
  });

  it('evicts least-recently-used beyond maxEntries', async () => {
    const { clock } = fakeClock();
    const proxy = track(
      new CachingProxy(service, { ttl: 10_000, maxEntries: 2, clock })
    ).cacheMethod('compute');
    await proxy.invoke('compute', [1]);
    await proxy.invoke('compute', [2]);
    await proxy.invoke('compute', [1]); // touch [1] — [2] is now LRU
    await proxy.invoke('compute', [3]); // evicts [2] (LRU after [1] was touched)

    expect(proxy.size).toBe(2);
    // [1] survived eviction (was touched most recently before [3] arrived)
    expect((await proxy.invoke('compute', [1])).cacheStatus).toBe('fresh');
    // [2] was evicted → miss (and its store evicts [3], now the LRU)
    expect((await proxy.invoke('compute', [2])).cacheStatus).toBe('miss');
    expect((await proxy.invoke('compute', [3])).cacheStatus).toBe('miss');
  });

  it('stableStringify is key-order insensitive', () => {
    expect(stableStringify({ a: 1, b: [2, { c: 3 }] })).toBe(stableStringify({ b: [2, { c: 3 }], a: 1 }));
    expect(stableStringify([1, 'x', null])).toBe('[1,"x",null]');
  });
});

// ---------------------------------------------------------------------------

describe('RemoteProxyStub + LocalTransport', () => {
  const remoteService = {
    add: (a: unknown, b: unknown) => (a as number) + (b as number),
    fail: () => {
      throw new Error('server exploded');
    },
  };

  it('round-trips an invocation through serialize→transport→deserialize', async () => {
    const transport = new LocalTransport(remoteService);
    const stub = new RemoteProxyStub(transport);
    const result = await stub.invoke<number>('add', [2, 3]);
    expect(result).toBe(5);
    expect(transport.counters.received).toBe(1);
    expect(stub.counters.ok).toBe(1);
  });

  it('propagates remote errors as RemoteInvocationError', async () => {
    const stub = new RemoteProxyStub(new LocalTransport(remoteService));
    await expect(stub.invoke('fail')).rejects.toThrow(RemoteInvocationError);
    await expect(stub.invoke('fail')).rejects.toThrow(/server exploded/);
  });

  it('rejects unknown methods', async () => {
    const stub = new RemoteProxyStub(new LocalTransport(remoteService));
    await expect(stub.invoke('missing')).rejects.toThrow(/NoSuchMethod/);
  });

  it('JSON serializer drops non-JSON args like a real wire', async () => {
    const echo = { echo: (x: unknown) => x };
    const stub = new RemoteProxyStub(new LocalTransport(echo));
    const result = await stub.invoke<Record<string, unknown>>('echo', [
      { a: 1, fn: () => 2, u: undefined },
    ]);
    // function and undefined fields are lost across the wire
    expect(result).toEqual({ a: 1 });
  });

  it('dropRate injects transport failures', async () => {
    const transport = new LocalTransport(remoteService, { dropRate: 1, random: () => 0 });
    const stub = new RemoteProxyStub(transport);
    await expect(stub.invoke('add', [1, 1])).rejects.toThrow(/dropped/);
    expect(transport.counters.dropped).toBe(1);
  });

  it('times out when the transport exceeds timeoutMs', async () => {
    const { clock } = fakeClock();
    // transport that never responds
    const slow: { send: (r: never) => Promise<never> } = {
      send: () => new Promise<never>(() => {}),
    };
    const stub = new RemoteProxyStub(slow, { timeoutMs: 100, clock });
    await expect(stub.invoke('add', [1, 2])).rejects.toThrow(/timed out/);
  });
});

// ---------------------------------------------------------------------------

describe('SmartReference', () => {
  it('loads lazily and unloads at refcount zero', async () => {
    const events: string[] = [];
    const sr = new SmartReference(
      () => ({ op: () => 'x' }),
      { onLoad: () => { events.push('load'); }, onUnload: () => { events.push('unload'); } }
    );

    expect(sr.isLoaded).toBe(false);
    const h = await sr.acquire();
    expect(sr.isLoaded).toBe(true);
    expect(sr.refCount).toBe(1);
    expect(events).toEqual(['load']);

    await h.release();
    expect(sr.refCount).toBe(0);
    expect(sr.isLoaded).toBe(false);
    expect(events).toEqual(['load', 'unload']);
  });

  it('shares one target across concurrent handles', async () => {
    let calls = 0;
    const sr = new SmartReference(() => {
      calls++;
      return { id: calls };
    });
    const h1 = await sr.acquire();
    const h2 = await sr.acquire();
    expect(sr.refCount).toBe(2);
    expect(calls).toBe(1);
    await h1.release();
    expect(sr.isLoaded).toBe(true); // h2 still holds it
    await h2.release();
    expect(sr.isLoaded).toBe(false);
  });

  it('released handles throw on use', async () => {
    const sr = new SmartReference(() => ({ go: () => 1 }));
    const h = await sr.acquire();
    await h.release();
    await expect(h.invoke('go')).rejects.toThrow(ReleasedHandleError);
    expect(await h.release()).toBe(false); // idempotent
  });

  it('with() releases even on error', async () => {
    const sr = new SmartReference(() => ({ go: () => 1 }));
    await expect(
      sr.with(async () => {
        throw new Error('user code failed');
      })
    ).rejects.toThrow('user code failed');
    expect(sr.refCount).toBe(0);
    expect(sr.isLoaded).toBe(false);
  });

  it('idle grace period defers unloading', async () => {
    const sr = new SmartReference(() => ({ go: () => 1 }), { idleMs: 30 });

    const h = await sr.acquire();
    await h.release();
    expect(sr.isLoaded).toBe(true); // grace period not elapsed

    await new Promise<void>((r) => setTimeout(r, 60));
    expect(sr.isLoaded).toBe(false); // grace elapsed → unloaded
  });

  it('flushPendingUnload() triggers the deferred unload immediately', async () => {
    const sr = new SmartReference(() => ({ go: () => 1 }), { idleMs: 60_000 });
    const h = await sr.acquire();
    await h.release();
    expect(sr.isLoaded).toBe(true);
    await sr.flushPendingUnload();
    expect(sr.isLoaded).toBe(false);
  });

  it('grace-period acquire cancels the pending unload', async () => {
    let calls = 0;
    const sr = new SmartReference(
      () => {
        calls++;
        return { go: () => calls };
      },
      { idleMs: 30 }
    );

    const h1 = await sr.acquire();
    await h1.release();
    const h2 = await sr.acquire(); // cancels pending unload
    await new Promise<void>((r) => setTimeout(r, 60));
    expect(sr.isLoaded).toBe(true); // still held by h2
    expect(calls).toBe(1); // never reloaded
    await h2.release();
    await sr.flushPendingUnload();
    expect(sr.isLoaded).toBe(false);
    expect(calls).toBe(1);
  });
});

// ---------------------------------------------------------------------------

describe('ProxyStatistics', () => {
  it('aggregates per-method and totals', () => {
    const stats = new ProxyStatistics();
    stats.record({ method: 'a', durationMs: 10, at: 1, outcome: 'success' });
    stats.record({ method: 'a', durationMs: 20, at: 2, outcome: 'cacheHit' });
    stats.record({ method: 'a', durationMs: 5, at: 3, outcome: 'failure', error: 'x' });
    stats.record({ method: 'b', durationMs: 7, at: 4, outcome: 'shortCircuit' });

    const a = stats.forMethod('a');
    expect(a.calls).toBe(3);
    expect(a.successes).toBe(2);
    expect(a.failures).toBe(1);
    expect(a.cacheHits).toBe(1);
    expect(a.lastInvokedAt).toBe(3);
    expect(a.lastError).toBe('x');
    // EWMA: first sample=10, then 0.2*20+0.8*10=12
    expect(a.avgDurationMs).toBeCloseTo(12, 5);

    const snap = stats.snapshot();
    expect(snap.totalCalls).toBe(4);
    expect(snap.totalSuccesses).toBe(3);
    expect(snap.totalFailures).toBe(1);
    expect(stats.knownMethods()).toEqual(['a', 'b']);
  });

  it('hottest() ranks by call count', () => {
    const stats = new ProxyStatistics();
    for (let i = 0; i < 5; i++) stats.record({ method: 'hot', durationMs: 1, at: i, outcome: 'success' });
    stats.record({ method: 'cold', durationMs: 1, at: 0, outcome: 'success' });
    const top = stats.hottest(1);
    expect(top[0].method).toBe('hot');
    expect(top[0].calls).toBe(5);
  });
});

// ---------------------------------------------------------------------------

describe('ProxyEngine (integration)', () => {
  it('full pipeline: protect → intercept → cache → target, with stats', async () => {
    const { clock } = fakeClock();
    let targetCalls = 0;
    const target = {
      fetch: (id: unknown) => {
        targetCalls++;
        return { id, ts: 'real' };
      },
    };

    const engine = new ProxyEngine({
      sink: { kind: 'direct', target },
      accessPolicy: ProtectionProxy.requireAuthenticated(),
      methodPolicies: { fetch: ProtectionProxy.requireRole('admin', 'service') },
      interceptors: new InterceptorChain().use({
        name: 'denyEvens',
        before: (inv) => (inv.args[0] === 2 ? shortCircuit({ id: 2, ts: 'intercepted' }) : { kind: 'continue' }),
      }),
      cachedMethods: ['fetch'],
      cacheTtlMs: 5000,
      clock,
    });

    const ctx = { principal: admin, attributes: {} };
    const r1 = await engine.invoke<{ id: unknown; ts: string }>('fetch', [1], ctx);
    const r2 = await engine.invoke<{ id: unknown; ts: string }>('fetch', [1], ctx);
    const r3 = await engine.invoke<{ id: unknown; ts: string }>('fetch', [2], ctx);

    expect(r1.servedBy).toBe('target');
    expect(r2.servedBy).toBe('cache');
    expect(r3.servedBy).toBe('shortCircuit');
    expect(r3.value.ts).toBe('intercepted');
    expect(targetCalls).toBe(1);

    const stats = engine.stats();
    const m = stats.methods['fetch'];
    expect(m.calls).toBe(3);
    expect(m.cacheHits).toBe(1);
    expect(m.shortCircuits).toBe(1);
    expect(m.successes).toBe(3);
  });

  it('records denials as failures without calling the target', async () => {
    let targetCalls = 0;
    const engine = new ProxyEngine({
      sink: { kind: 'direct', target: { secret: () => { targetCalls++; return 's'; } } },
      accessPolicy: ProtectionProxy.requireRole('admin'),
    });

    await expect(engine.invoke('secret', [], { principal: user, attributes: {} })).rejects.toThrow(
      ProxyAccessDeniedError
    );
    expect(targetCalls).toBe(0);
    expect(engine.stats().methods['secret'].failures).toBe(1);
  });

  it('virtual sink lazily creates the target', async () => {
    let factoryCalls = 0;
    const engine = new ProxyEngine({
      sink: {
        kind: 'virtual',
        factory: () => {
          factoryCalls++;
          return { ping: () => 'pong' };
        },
      },
    });
    expect(factoryCalls).toBe(0);
    const r = await engine.invoke<string>('ping');
    expect(r.value).toBe('pong');
    await engine.invoke('ping');
    expect(factoryCalls).toBe(1);
  });

  it('remote sink routes through the wire', async () => {
    const transport = new LocalTransport({ double: (n: unknown) => (n as number) * 2 });
    const engine = new ProxyEngine({
      sink: { kind: 'remote', stub: new RemoteProxyStub(transport) },
    });
    const r = await engine.invoke<number>('double', [21]);
    expect(r.value).toBe(42);
    expect(transport.counters.received).toBe(1);
  });

  it('target errors propagate and are counted', async () => {
    const engine = new ProxyEngine({
      sink: {
        kind: 'direct',
        target: {
          bad: () => {
            throw new Error('nope');
          },
        },
      },
    });
    await expect(engine.invoke('bad')).rejects.toThrow('nope');
    const m = engine.stats().methods['bad'];
    expect(m.failures).toBe(1);
    expect(m.lastError).toBe('nope');
  });
});
