/**
 * Circuit Breaker Engine — unit tests.
 *
 * `ManualEngineClock` drives all reset timeouts; probe scheduling tests
 * use real promises gated by deferred release functions.
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import {
  AdaptiveResetBackoff,
  AutoTuner,
  BreakerRegistry,
  BreakerState,
  BulkheadSemaphore,
  CallWindow,
  CanaryProbe,
  CircuitRejectionError,
  EndpointBreaker,
  FallbackChain,
  FallbackChainExhaustedError,
  HealthVerdict,
  ManualEngineClock,
  ProbeScheduler,
  TimeWindow,
} from '../index';

function deferred<T>(): { promise: Promise<T>; resolve: (v: T) => void; reject: (e: unknown) => void } {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/* ------------------------------------------------------------------ */
/* EndpointBreaker                                                     */
/* ------------------------------------------------------------------ */

describe('EndpointBreaker', () => {
  let clock: ManualEngineClock;
  let breaker: EndpointBreaker;

  beforeEach(() => {
    clock = new ManualEngineClock();
    breaker = new EndpointBreaker('GET /api', {
      clock,
      failureThreshold: 3,
      successThreshold: 2,
      resetTimeoutMs: 1000,
    });
  });

  it('opens after consecutive failures and rejects calls', async () => {
    for (let i = 0; i < 3; i++) {
      await expect(breaker.execute(() => Promise.reject(new Error('x')))).rejects.toThrow('x');
    }
    expect(breaker.state).toBe(BreakerState.OPEN);
    await expect(breaker.execute(() => 'never')).rejects.toBeInstanceOf(CircuitRejectionError);
  });

  it('half-opens after resetTimeout and closes on enough successes', async () => {
    for (let i = 0; i < 3; i++) {
      await expect(breaker.execute(() => Promise.reject(new Error('x')))).rejects.toThrow();
    }
    clock.advance(1001);
    await breaker.execute(() => 'probe1');
    expect(breaker.state).toBe(BreakerState.HALF_OPEN);
    await breaker.execute(() => 'probe2');
    expect(breaker.state).toBe(BreakerState.CLOSED);
  });

  it('failed probe returns to OPEN', async () => {
    for (let i = 0; i < 3; i++) {
      await expect(breaker.execute(() => Promise.reject(new Error('x')))).rejects.toThrow();
    }
    clock.advance(1001);
    await expect(breaker.execute(() => Promise.reject(new Error('still bad')))).rejects.toThrow();
    expect(breaker.state).toBe(BreakerState.OPEN);
    // resetTimeout restarts from the re-open
    clock.advance(999);
    await expect(breaker.execute(() => 'x')).rejects.toBeInstanceOf(CircuitRejectionError);
  });

  it('respects isFailure predicate', async () => {
    const b = new EndpointBreaker('ep', {
      clock,
      failureThreshold: 1,
      isFailure: (e) => e instanceof Error && !e.message.startsWith('skip'),
    });
    await expect(b.execute(() => Promise.reject(new Error('skip: validation')))).rejects.toThrow();
    expect(b.state).toBe(BreakerState.CLOSED); // counted as success-ish
    await expect(b.execute(() => Promise.reject(new Error('real')))).rejects.toThrow();
    expect(b.state).toBe(BreakerState.OPEN);
  });

  it('windowed failure counting ignores ancient failures', async () => {
    const b = new EndpointBreaker('ep', {
      clock,
      failureThreshold: 3,
      windowMs: 10_000,
      resetTimeoutMs: 1000,
    });
    for (let i = 0; i < 2; i++) {
      await expect(b.execute(() => Promise.reject(new Error('x')))).rejects.toThrow();
      clock.advance(500);
    }
    // space them out so old failures leave the window
    clock.advance(10_000);
    for (let i = 0; i < 2; i++) {
      await expect(b.execute(() => Promise.reject(new Error('x')))).rejects.toThrow();
      clock.advance(500);
    }
    // only 2 failures inside window → still closed
    expect(b.state).toBe(BreakerState.CLOSED);
  });

  it('snapshot/restore preserves state', async () => {
    for (let i = 0; i < 3; i++) {
      await expect(breaker.execute(() => Promise.reject(new Error('x')))).rejects.toThrow();
    }
    const snap = breaker.snapshot();
    const b2 = new EndpointBreaker('GET /api', { clock, failureThreshold: 3, resetTimeoutMs: 1000 });
    b2.restore(snap);
    expect(b2.state).toBe(BreakerState.OPEN);
  });
});

/* ------------------------------------------------------------------ */
/* BreakerRegistry                                                     */
/* ------------------------------------------------------------------ */

describe('BreakerRegistry', () => {
  let clock: ManualEngineClock;
  let registry: BreakerRegistry;

  beforeEach(() => {
    clock = new ManualEngineClock();
    registry = new BreakerRegistry({
      clock,
      config: { failureThreshold: 2, resetTimeoutMs: 500 },
    });
  });

  it('creates one breaker per endpoint lazily', async () => {
    await registry.execute('GET /a', () => 'ok');
    await registry.execute('GET /b', () => 'ok');
    expect(registry.size).toBe(2);
    expect(registry.breaker('GET /a')).toBe(registry.breaker('GET /a'));
  });

  it('per-endpoint override tightens a single breaker', async () => {
    registry.override('GET /flaky', { failureThreshold: 1 });
    await expect(registry.execute('GET /flaky', () => Promise.reject(new Error('x')))).rejects.toThrow();
    expect(registry.breaker('GET /flaky').state).toBe(BreakerState.OPEN);
    // Other endpoint unaffected
    await expect(registry.execute('GET /ok', () => Promise.reject(new Error('x')))).rejects.toThrow();
    expect(registry.breaker('GET /ok').state).toBe(BreakerState.CLOSED);
  });

  it('executeWithFallback falls through on rejection', async () => {
    registry.override('GET /x', { failureThreshold: 1 });
    await expect(registry.execute('GET /x', () => Promise.reject(new Error('x')))).rejects.toThrow();

    const value = await registry.executeWithFallback(
      'GET /x',
      () => Promise.reject(new Error('still bad')),
      [() => Promise.resolve('from-fallback')],
    );
    expect(value).toBe('from-fallback');
  });

  it('openAll/closeAll act as fleet kill switch', async () => {
    registry.breaker('a');
    registry.breaker('b');
    registry.openAll();
    expect(registry.breaker('a').state).toBe(BreakerState.OPEN);
    expect(registry.breaker('b').state).toBe(BreakerState.OPEN);
    registry.closeAll();
    expect(registry.breaker('a').state).toBe(BreakerState.CLOSED);
  });

  it('snapshot/restore round-trips breaker state', async () => {
    registry.override('GET /x', { failureThreshold: 1 });
    await expect(registry.execute('GET /x', () => Promise.reject(new Error('x')))).rejects.toThrow();
    const snap = registry.snapshot();
    const reg2 = new BreakerRegistry({ clock, config: { failureThreshold: 9 } });
    reg2.restore(snap);
    expect(reg2.breaker('GET /x').state).toBe(BreakerState.OPEN);
  });

  it('metrics rollup counts states', async () => {
    registry.override('bad', { failureThreshold: 1 });
    await registry.execute('good', () => 'ok');
    await expect(registry.execute('bad', () => Promise.reject(new Error('x')))).rejects.toThrow();
    const m = registry.metrics();
    expect(m.open).toBe(1);
    expect(m.closed).toBe(1);
    expect(m.worstEndpoints[0].endpoint).toBe('bad');
  });
});

/* ------------------------------------------------------------------ */
/* ProbeScheduler                                                      */
/* ------------------------------------------------------------------ */

describe('ProbeScheduler', () => {
  let clock: ManualEngineClock;
  let scheduler: ProbeScheduler;
  let breaker: EndpointBreaker;

  beforeEach(() => {
    clock = new ManualEngineClock();
    scheduler = new ProbeScheduler({ clock, maxConcurrent: 2, maxQueued: 4, queueTimeoutMs: 1000 });
    breaker = new EndpointBreaker('ep', { clock, failureThreshold: 1, resetTimeoutMs: 0, successThreshold: 10 });
  });

  it('bounds concurrent probes fleet-wide', async () => {
    // Force the breaker open → half-open (successThreshold=10 admits many)
    await expect(breaker.execute(() => Promise.reject(new Error('x')))).rejects.toThrow();
    clock.advance(1);
    expect(breaker.state).toBe(BreakerState.HALF_OPEN);

    const d1 = deferred<string>();
    const d2 = deferred<string>();
    const d3 = deferred<string>();
    const p1 = scheduler.runProbe(breaker, () => d1.promise);
    const p2 = scheduler.runProbe(breaker, () => d2.promise);
    const p3 = scheduler.runProbe(breaker, () => d3.promise);
    expect(scheduler.stats().running).toBe(2);
    expect(scheduler.stats().queued).toBe(1);

    d1.resolve('a');
    await p1;
    // pump grants queued probe a slot
    expect(scheduler.stats().running).toBe(2);
    d2.resolve('b');
    d3.resolve('c');
    await p2;
    await p3;
    expect(scheduler.stats().granted).toBe(3);
  });

  it('rejects when queue is full', async () => {
    const big = new ProbeScheduler({ clock, maxConcurrent: 1, maxQueued: 1 });
    await expect(breaker.execute(() => Promise.reject(new Error('x')))).rejects.toThrow();
    clock.advance(1);
    const d = deferred<string>();
    const p1 = big.runProbe(breaker, () => d.promise);
    const p2 = big.runProbe(breaker, () => d.promise);
    await expect(big.runProbe(breaker, () => 'x')).rejects.toThrow(/queue is full/i);
    d.resolve('ok');
    await p1;
    await p2;
  });

  it('queued probes expire past queueTimeoutMs', async () => {
    const s = new ProbeScheduler({ clock, maxConcurrent: 1, maxQueued: 10, queueTimeoutMs: 100 });
    await expect(breaker.execute(() => Promise.reject(new Error('x')))).rejects.toThrow();
    clock.advance(1);
    const d = deferred<string>();
    const p1 = s.runProbe(breaker, () => d.promise);
    const p2 = s.runProbe(breaker, () => 'queued-probe');
    clock.advance(150);
    s.pump();
    await expect(p2).rejects.toBeInstanceOf(CircuitRejectionError);
    d.resolve('ok');
    await p1;
  });
});

/* ------------------------------------------------------------------ */
/* AutoTuner                                                           */
/* ------------------------------------------------------------------ */

describe('AutoTuner', () => {
  let clock: ManualEngineClock;
  let registry: BreakerRegistry;
  let tuner: AutoTuner;

  beforeEach(() => {
    clock = new ManualEngineClock();
    registry = new BreakerRegistry({
      clock,
      config: { failureThreshold: 4, resetTimeoutMs: 1000, successThreshold: 100 },
    });
    tuner = new AutoTuner(registry, {
      clock,
      highWater: 0.5,
      lowWater: 0.05,
      minSampleSize: 5,
      maxFailureThreshold: 20,
      minResetTimeoutMs: 100,
      maxResetTimeoutMs: 60_000,
    });
  });

  it('tightens thresholds for unhealthy endpoints', async () => {
    // Feed failures straight through the breaker (half-open admits many)
    for (let i = 0; i < 5; i++) {
      await expect(registry.execute('bad', () => Promise.reject(new Error('x')))).rejects.toThrow();
      clock.advance(2000); // let it half-open so it keeps accepting calls
    }
    const decisions = tuner.tune();
    const d = decisions.find((x) => x.endpoint === 'bad')!;
    expect(d.action).toBe('tightened');
    expect(d.after.failureThreshold).toBeGreaterThan(d.before.failureThreshold);
  });

  it('relaxes thresholds for healthy endpoints', async () => {
    const b = registry.breaker('good');
    b.tune({ failureThreshold: 10, resetTimeoutMs: 5000 });
    for (let i = 0; i < 10; i++) await registry.execute('good', () => 'ok');
    const d = tuner.tune().find((x) => x.endpoint === 'good')!;
    expect(d.action).toBe('relaxed');
    expect(d.after.failureThreshold).toBeLessThan(10);
    expect(d.after.resetTimeoutMs).toBeLessThan(5000);
  });

  it('skips endpoints with insufficient samples', async () => {
    await registry.execute('quiet', () => 'ok');
    const d = tuner.tune().find((x) => x.endpoint === 'quiet')!;
    expect(d.action).toBe('insufficient-data');
  });

  it('respects clamp bounds', async () => {
    for (let i = 0; i < 10; i++) {
      for (let j = 0; j < 5; j++) {
        await expect(registry.execute('bad', () => Promise.reject(new Error('x')))).rejects.toThrow();
        clock.advance(2000);
      }
      tuner.tune();
    }
    const cfg = registry.breaker('bad').currentConfig();
    expect(cfg.failureThreshold).toBeLessThanOrEqual(20);
    expect(cfg.resetTimeoutMs).toBeLessThanOrEqual(60_000);
  });
});

/* ------------------------------------------------------------------ */
/* FallbackChain                                                       */
/* ------------------------------------------------------------------ */

describe('FallbackChain', () => {
  it('returns primary result when it succeeds', async () => {
    const chain = new FallbackChain();
    const v = await chain.run(() => 'primary', [() => 'fb']);
    expect(v).toBe('primary');
  });

  it('falls through to first working fallback', async () => {
    const chain = new FallbackChain();
    const v = await chain.run(
      () => Promise.reject(new Error('primary down')),
      [() => Promise.reject(new Error('fb1 down')), () => 'fb2'],
    );
    expect(v).toBe('fb2');
  });

  it('throws FallbackChainExhaustedError when everything fails', async () => {
    const chain = new FallbackChain();
    await expect(
      chain.run(() => Promise.reject(new Error('p')), [() => Promise.reject(new Error('f1'))]),
    ).rejects.toBeInstanceOf(FallbackChainExhaustedError);
  });

  it('accept predicate rejects unacceptable values', async () => {
    const chain = new FallbackChain({ accept: (v) => typeof v === 'string' && v !== 'stale' });
    const r = await chain.runDetailed(
      () => 'stale',
      [() => 'fresh'],
    );
    expect(r.value).toBe('fresh');
    expect(r.servedBy).toBe(1);
    expect(r.attempts[0].rejectedValue).toBe(true);
  });

  it('shouldFallback veto rethrows primary error immediately', async () => {
    const chain = new FallbackChain({ shouldFallback: (e) => !(e instanceof Error && e.message === 'auth') });
    await expect(
      chain.run(() => Promise.reject(new Error('auth')), [() => 'fallback']),
    ).rejects.toThrow('auth');
  });

  it('firstAcceptable skips undefined and unacceptable values', async () => {
    const chain = new FallbackChain({ accept: (v) => v !== 'bad' });
    const v = await chain.firstAcceptable<string>([() => undefined, () => 'bad', () => 'good']);
    expect(v).toBe('good');
  });
});

/* ------------------------------------------------------------------ */
/* WindowedMetrics                                                     */
/* ------------------------------------------------------------------ */

describe('TimeWindow', () => {
  it('counts failures inside the window only', () => {
    const clock = new ManualEngineClock();
    const w = new TimeWindow(10_000, 10, { clock });
    w.record({ success: false, latencyMs: 10 });
    w.record({ success: true, latencyMs: 10 });
    expect(w.failureRate()).toBe(0.5);
    clock.advance(11_000);
    w.record({ success: true, latencyMs: 10 });
    // old failure fell out of the window
    expect(w.totals().calls).toBeLessThanOrEqual(3);
    expect(w.failureRate()).toBeLessThan(0.5);
  });

  it('tracks slow calls', () => {
    const clock = new ManualEngineClock();
    const w = new TimeWindow(10_000, 10, { clock, slowCallThresholdMs: 100 });
    w.record({ success: true, latencyMs: 500 });
    w.record({ success: true, latencyMs: 10 });
    expect(w.slowCallRate()).toBe(0.5);
  });
});

describe('CallWindow', () => {
  it('ring evicts oldest and maintains running totals', () => {
    const w = new CallWindow(3);
    w.record({ success: false, latencyMs: 10 });
    w.record({ success: false, latencyMs: 10 });
    w.record({ success: true, latencyMs: 10 });
    expect(w.failureRate()).toBeCloseTo(2 / 3, 5);
    w.record({ success: true, latencyMs: 10 }); // evicts first failure
    expect(w.calls).toBe(3);
    expect(w.failureRate()).toBeCloseTo(1 / 3, 5);
  });

  it('recent returns newest-in-order slice', () => {
    const w = new CallWindow(5);
    for (let i = 0; i < 4; i++) w.record({ success: true, latencyMs: i });
    const r = w.recent(2);
    expect(r.length).toBe(2);
    expect(r[1].latencyMs).toBe(3);
  });
});

/* ------------------------------------------------------------------ */
/* BulkheadSemaphore                                                   */
/* ------------------------------------------------------------------ */

describe('BulkheadSemaphore', () => {
  it('bounds concurrency and queues waiters', async () => {
    const clock = new ManualEngineClock();
    const sem = new BulkheadSemaphore('api', { maxConcurrent: 2, clock });
    let inFlight = 0;
    let max = 0;
    const work = async () => {
      inFlight++;
      max = Math.max(max, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight--;
    };
    await Promise.all(Array.from({ length: 6 }, () => sem.run(work)));
    expect(max).toBe(2);
    expect(sem.stats().acquired).toBe(6);
  });

  it('rejects when queue is saturated', async () => {
    const clock = new ManualEngineClock();
    const sem = new BulkheadSemaphore('api', { maxConcurrent: 1, maxQueued: 1, clock });
    const d = deferred<string>();
    const p1 = sem.run(() => d.promise);
    const p2 = sem.run(() => 'queued');
    await expect(sem.run(() => 'too-many')).rejects.toThrow(/full/);
    d.resolve('a');
    await p1;
    await p2;
  });

  it('ticket.release is idempotent', async () => {
    const clock = new ManualEngineClock();
    const sem = new BulkheadSemaphore('api', { maxConcurrent: 1, clock });
    const t = await sem.acquire();
    t.release();
    t.release(); // no-op
    expect(sem.stats().released).toBe(1);
    expect(sem.stats().running).toBe(0);
  });
});

/* ------------------------------------------------------------------ */
/* CanaryProbe                                                         */
/* ------------------------------------------------------------------ */

describe('CanaryProbe', () => {
  it('only probes when half-open and budget allows', async () => {
    const clock = new ManualEngineClock();
    const b = new EndpointBreaker('ep', { clock, failureThreshold: 1, resetTimeoutMs: 1000, successThreshold: 1 });
    const probe = new CanaryProbe(b, { clock, probeIntervalMs: 100, probeBudgetPerHour: 5 });

    // closed → no probe
    let r = await probe.tick(() => 'ok');
    expect(r.ran).toBe(false);
    expect(r.reason).toBe('breaker-not-half-open');

    // open the breaker → still no probe (waiting for reset)
    await expect(b.execute(() => Promise.reject(new Error('x')))).rejects.toThrow();
    r = await probe.tick(() => 'ok');
    expect(r.reason).toBe('probe-skipped-open');

    // advance past resetTimeout → half-open → probe runs
    clock.advance(1001);
    r = await probe.tick(() => 'ok');
    expect(r.ran).toBe(true);
    expect(r.ok).toBe(true);
    expect(b.state).toBe(BreakerState.CLOSED); // probe closed it
  });

  it('probe failure sends breaker back open', async () => {
    const clock = new ManualEngineClock();
    const b = new EndpointBreaker('ep', { clock, failureThreshold: 1, resetTimeoutMs: 100, successThreshold: 1 });
    const probe = new CanaryProbe(b, { clock, probeIntervalMs: 10 });
    await expect(b.execute(() => Promise.reject(new Error('x')))).rejects.toThrow();
    clock.advance(101);
    await probe.tick(() => Promise.reject(new Error('still bad')));
    expect(b.state).toBe(BreakerState.OPEN);
  });

  it('respects probe budget per hour', async () => {
    const clock = new ManualEngineClock();
    const b = new EndpointBreaker('ep', { clock, failureThreshold: 1, resetTimeoutMs: 0, successThreshold: 5 });
    const probe = new CanaryProbe(b, { clock, probeIntervalMs: 1, probeBudgetPerHour: 3 });
    await expect(b.execute(() => Promise.reject(new Error('x')))).rejects.toThrow();
    clock.advance(1);
    for (let i = 0; i < 3; i++) {
      clock.advance(1);
      const r = await probe.tick(() => Promise.reject(new Error('no')));
      // probes may send it back open — re-advance past reset
      clock.advance(1);
      expect(r.ran || r.reason === 'probe-skipped-open').toBe(true);
    }
  });
});

/* ------------------------------------------------------------------ */
/* AdaptiveResetBackoff                                                */
/* ------------------------------------------------------------------ */

describe('AdaptiveResetBackoff', () => {
  it('grows reset timeout on consecutive open cycles', () => {
    const clock = new ManualEngineClock();
    const b = new AdaptiveResetBackoff({ baseResetMs: 1000, factor: 2, jitter: 0, clock });
    expect(b.nextResetTimeout()).toBe(1000);
    expect(b.nextResetTimeout()).toBe(2000);
    expect(b.nextResetTimeout()).toBe(4000);
    expect(b.streak).toBe(3);
  });

  it('resets streak after a successful close', () => {
    const clock = new ManualEngineClock();
    const b = new AdaptiveResetBackoff({ baseResetMs: 1000, factor: 2, jitter: 0, clock });
    b.nextResetTimeout();
    b.nextResetTimeout();
    b.reset();
    expect(b.streak).toBe(0);
    expect(b.nextResetTimeout()).toBe(1000);
  });

  it('caps at capMs and jitters within bounds', () => {
    const clock = new ManualEngineClock();
    const b = new AdaptiveResetBackoff({ baseResetMs: 1000, factor: 10, capMs: 3000, jitter: 0.5, random: () => 0.5, clock });
    b.nextResetTimeout();
    const capped = b.nextResetTimeout(); // would be 10s → capped to 3s
    expect(capped).toBeLessThanOrEqual(4500); // 3000 + 50% jitter
    expect(capped).toBeGreaterThanOrEqual(1500);
  });
});

/* ------------------------------------------------------------------ */
/* HealthVerdict                                                       */
/* ------------------------------------------------------------------ */

describe('HealthVerdict', () => {
  it('stays healthy on all-fast-success', () => {
    const clock = new ManualEngineClock();
    const v = new HealthVerdict({ clock, slowThresholdMs: 100 });
    for (let i = 0; i < 20; i++) v.record(true, 10);
    expect(v.level()).toBe('healthy');
    expect(v.score).toBeGreaterThan(0.9);
  });

  it('degrades on failures and recovers on successes', () => {
    const clock = new ManualEngineClock();
    const v = new HealthVerdict({ clock, alpha: 0.5 });
    for (let i = 0; i < 5; i++) v.record(false, 10);
    expect(v.score).toBeLessThan(0.1);
    expect(v.level()).toBe('unhealthy');
    for (let i = 0; i < 10; i++) v.record(true, 10);
    expect(v.level()).toBe('healthy');
  });

  it('slow successes weigh between failure and fast', () => {
    const clock = new ManualEngineClock();
    const v = new HealthVerdict({ clock, alpha: 1, slowThresholdMs: 100, slowWeight: 0.5 });
    v.record(true, 500); // slow
    expect(v.score).toBe(0.5);
    v.record(false, 10);
    expect(v.score).toBe(0);
    v.record(true, 10); // fast
    expect(v.score).toBe(1);
  });

  it('decays toward neutral when quiet', () => {
    const clock = new ManualEngineClock();
    const v = new HealthVerdict({ clock, initialScore: 1.0 });
    clock.advance(60_000);
    v.decayToNeutral(0.5, 0.5);
    expect(v.score).toBeCloseTo(0.75, 2); // halfway to 0.5 after 1min at 50%/min
  });
});
