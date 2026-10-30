/**
 * Facade Engine — unit tests.
 *
 * Aggregation timeouts use an injected `timeoutFn` so nothing waits in
 * real time; the cached facade runs on `ManualEngineClock`.
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import {
  AggregationEngine,
  BatchFacade,
  BulkheadRouter,
  CachedFacade,
  CollapseLimitError,
  CompensationStack,
  EarlyExit,
  LoadShedder,
  ManualEngineClock,
  OrchestrationFacade,
  RequestCollapser,
  RequiredSubsystemError,
  ResponseComposer,
  StepFailedError,
  SubsystemTimeoutError,
} from '../index';
import type { Step, Subsystem } from '../index';

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
/* AggregationEngine                                                   */
/* ------------------------------------------------------------------ */

describe('AggregationEngine', () => {
  let clock: ManualEngineClock;

  beforeEach(() => {
    clock = new ManualEngineClock();
  });

  it('fans out in parallel and merges all results', async () => {
    const engine = new AggregationEngine({ clock });
    const r = await engine.aggregate(
      [
        { name: 'a', call: () => Promise.resolve(1) },
        { name: 'b', call: () => Promise.resolve(2) },
        { name: 'c', call: () => Promise.resolve(3) },
      ],
      (results) => Array.from(results.values()).reduce<number>((s, v) => s + (v as number ?? 0), 0),
    );
    expect(r.value).toBe(6);
    expect(r.errors.size).toBe(0);
  });

  it('optional subsystem failure produces null + error entry', async () => {
    const engine = new AggregationEngine({ clock });
    const r = await engine.aggregate(
      [
        { name: 'good', call: () => Promise.resolve('ok') },
        { name: 'bad', call: () => Promise.reject(new Error('down')) },
      ],
      (results, errors) => ({ results: Object.fromEntries(results), errors: errors.size }),
    );
    expect(r.value.results['good']).toBe('ok');
    expect(r.value.results['bad']).toBeNull();
    expect(r.value.errors).toBe(1);
  });

  it('required subsystem failure throws RequiredSubsystemError', async () => {
    const engine = new AggregationEngine({ clock });
    await expect(
      engine.aggregate(
        [
          { name: 'required', required: true, call: () => Promise.reject(new Error('dead')) },
          { name: 'opt', call: () => Promise.resolve('x') },
        ],
        () => 'merged',
      ),
    ).rejects.toBeInstanceOf(RequiredSubsystemError);
  });

  it('times out a slow optional subsystem', async () => {
    const never = deferred<unknown>();
    // injected timeout fires on next microtask — after fast resolves
    const engine = new AggregationEngine({
      clock,
      timeoutFn: (ms, label) =>
        new Promise((_, reject) =>
          setTimeout(() => reject(new SubsystemTimeoutError(label, ms)), 0),
        ),
    });
    const r = await engine.aggregate(
      [
        { name: 'fast', call: () => Promise.resolve('v') },
        { name: 'slow', call: () => never.promise, timeoutMs: 50 },
      ],
      (results) => results.get('slow'),
    );
    expect(r.value).toBeNull();
    expect(r.abandoned).toEqual(['slow']);
  });

  it('respects maxConcurrency bound', async () => {
    let inFlight = 0;
    let max = 0;
    const engine = new AggregationEngine({ clock, maxConcurrency: 2 });
    const subs: Subsystem[] = Array.from({ length: 8 }, (_, i) => ({
      name: `s${i}`,
      call: async () => {
        inFlight++;
        max = Math.max(max, inFlight);
        await new Promise((r) => setTimeout(r, 5));
        inFlight--;
        return i;
      },
    }));
    await engine.aggregate(subs, () => 'ok');
    expect(max).toBeLessThanOrEqual(2);
  });
});

/* ------------------------------------------------------------------ */
/* BatchFacade                                                         */
/* ------------------------------------------------------------------ */

describe('BatchFacade', () => {
  let clock: ManualEngineClock;
  let facade: BatchFacade;

  beforeEach(() => {
    clock = new ManualEngineClock();
    facade = new BatchFacade({ clock, maxConcurrency: 3 });
  });

  it('maps results to input indices', async () => {
    const r = await facade.batch([10, 20, 30], (x) => x * 2);
    expect(r.succeeded).toBe(3);
    expect(r.results.map((x) => x.value)).toEqual([20, 40, 60]);
  });

  it('collects per-item errors without failing the batch', async () => {
    const r = await facade.batch([1, 2, 3, 4], (x) =>
      x === 3 ? Promise.reject(new Error('bad item')) : Promise.resolve(x),
    );
    expect(r.succeeded).toBe(3);
    expect(r.failed).toBe(1);
    expect(r.firstErrorIndex).toBe(2);
    expect(r.results[2].ok).toBe(false);
  });

  it('abortOnError skips remaining items', async () => {
    const r = await facade.batch(
      [1, 2, 3, 4, 5, 6],
      async (x) => {
        if (x === 2) throw new Error('stop');
        await new Promise((res) => setTimeout(res, 1));
        return x;
      },
      { abortOnError: true },
    );
    expect(r.failed).toBe(1);
    expect(r.skipped + r.succeeded + r.failed).toBe(6);
    expect(r.skipped).toBeGreaterThan(0);
  });

  it('bounds concurrency', async () => {
    let inFlight = 0;
    let max = 0;
    await facade.batch(Array.from({ length: 20 }, (_, i) => i), async () => {
      inFlight++;
      max = Math.max(max, inFlight);
      await new Promise((r) => setTimeout(r, 2));
      inFlight--;
    });
    expect(max).toBeLessThanOrEqual(3);
  });

  it('batchChunks maps chunk results back to items', async () => {
    const r = await facade.batchChunks([1, 2, 3, 4, 5], 2, (chunk) => chunk.map((x) => x * 10));
    expect(r.results.map((x) => x.value)).toEqual([10, 20, 30, 40, 50]);
  });

  it('collectValues returns only successes in order', async () => {
    const vals = await facade.collectValues([1, 2, 3], (x) =>
      x === 2 ? Promise.reject(new Error('no')) : Promise.resolve(x),
    );
    expect(vals).toEqual([1, 3]);
  });
});

/* ------------------------------------------------------------------ */
/* CachedFacade                                                        */
/* ------------------------------------------------------------------ */

describe('CachedFacade', () => {
  let clock: ManualEngineClock;

  beforeEach(() => {
    clock = new ManualEngineClock();
  });

  it('caches by computed key and serves hits', async () => {
    let calls = 0;
    const f = new CachedFacade<[string], string>({
      keyFn: (id) => id,
      fn: async (id) => {
        calls++;
        return `val:${id}`;
      },
      clock,
      ttlMs: 1000,
    });
    expect(await f.call('a')).toBe('val:a');
    expect(await f.call('a')).toBe('val:a');
    expect(calls).toBe(1);
    expect(f.stats().hits).toBe(1);
  });

  it('expires entries by TTL', async () => {
    let calls = 0;
    const f = new CachedFacade<[string], string>({
      keyFn: (id) => id,
      fn: async (id) => `v${++calls}:${id}`,
      clock,
      ttlMs: 100,
    });
    await f.call('a');
    clock.advance(150);
    await f.call('a');
    expect(calls).toBe(2);
  });

  it('does not cache undefined unless cacheNulls', async () => {
    let calls = 0;
    const f = new CachedFacade<[string], string | undefined>({
      keyFn: (id) => id,
      fn: async () => {
        calls++;
        return undefined;
      },
      clock,
    });
    await f.call('a');
    await f.call('a');
    expect(calls).toBe(2);

    const g = new CachedFacade<[string], string | undefined>({
      keyFn: (id) => id,
      fn: async () => undefined,
      clock,
      cacheNulls: true,
    });
    await g.call('a');
    await g.call('a');
    expect(g.stats().hits).toBe(1);
  });

  it('invalidatePrefix removes matching keys', async () => {
    const f = new CachedFacade<[string], string>({
      keyFn: (id) => id,
      fn: async (id) => id,
      clock,
    });
    await f.call('user:1');
    await f.call('user:2');
    await f.call('order:1');
    expect(f.invalidatePrefix('user:')).toBe(2);
    expect(f.stats().size).toBe(1);
  });

  it('SWR serves stale while refreshing', async () => {
    let version = 0;
    const f = new CachedFacade<[string], string>({
      keyFn: (id) => id,
      fn: async () => `v${++version}`,
      clock,
      ttlMs: 100,
      swrMs: 500,
    });
    await f.call('k'); // v1
    clock.advance(300); // expired but inside swr
    const v = await f.call('k');
    expect(v).toBe('v1');
    await new Promise((r) => setTimeout(r, 0)); // let refresh land
    const v2 = await f.call('k');
    expect(v2).toBe('v2');
  });
});

/* ------------------------------------------------------------------ */
/* OrchestrationFacade                                                 */
/* ------------------------------------------------------------------ */

describe('OrchestrationFacade', () => {
  let clock: ManualEngineClock;
  let orch: OrchestrationFacade;

  interface Ctx {
    log: string[];
    inventory?: string;
    chargeId?: string;
  }

  beforeEach(() => {
    clock = new ManualEngineClock();
    orch = new OrchestrationFacade({ clock });
  });

  it('runs steps in order and completes', async () => {
    const steps: Step<Ctx, string>[] = [
      { name: 'validate', run: (ctx) => { ctx.log.push('validate'); return 'v-ok'; } },
      { name: 'reserve', run: (ctx) => { ctx.log.push('reserve'); ctx.inventory = 'r1'; return 'r-ok'; } },
      { name: 'charge', run: (ctx) => { ctx.log.push('charge'); ctx.chargeId = 'c1'; return 'done'; } },
    ];
    const r = await orch.run(steps, { log: [] });
    expect(r.ok).toBe(true);
    expect(r.exitKind).toBe('completed');
    expect(r.value).toBe('done');
  });

  it('early exit skips remaining steps', async () => {
    const steps: Step<Ctx, string>[] = [
      { name: 'check', run: () => new EarlyExit('short-circuit') },
      { name: 'never', run: () => 'should-not-run' },
    ];
    const r = await orch.run(steps, { log: [] });
    expect(r.ok).toBe(true);
    expect(r.exitKind).toBe('early-exit');
    expect(r.value).toBe('short-circuit');
    expect(r.stoppedAt).toBe(0);
    expect(r.audit.length).toBe(1);
  });

  it('failed step compensates completed steps newest-first', async () => {
    const compensated: string[] = [];
    const steps: Step<Ctx, string>[] = [
      {
        name: 'reserve',
        run: () => 'reserved',
        compensate: () => { compensated.push('reserve'); },
      },
      {
        name: 'charge',
        run: () => 'charged',
        compensate: () => { compensated.push('charge'); },
      },
      { name: 'notify', run: () => Promise.reject(new Error('smtp down')) },
    ];
    const r = await orch.run(steps, { log: [] });
    expect(r.ok).toBe(false);
    expect(r.exitKind).toBe('failed');
    expect(r.error).toBeInstanceOf(StepFailedError);
    expect(r.error!.step).toBe('notify');
    expect(compensated).toEqual(['charge', 'reserve']);
    expect(r.compensated).toEqual(['charge', 'reserve']);
  });

  it('compensation failure does not mask the original error', async () => {
    const steps: Step<Ctx, string>[] = [
      {
        name: 'a',
        run: () => 'a-ok',
        compensate: () => Promise.reject(new Error('rollback broken')),
      },
      { name: 'b', run: () => Promise.reject(new Error('the real error')) },
    ];
    const r = await orch.run(steps, { log: [] });
    expect(r.ok).toBe(false);
    expect(r.error!.cause).toBeInstanceOf(Error);
    expect((r.error!.cause as Error).message).toBe('the real error');
    expect(r.audit.some((e) => e.outcome === 'compensation-failed')).toBe(true);
  });

  it('steps share context', async () => {
    const steps: Step<Ctx, string>[] = [
      { name: 's1', run: (ctx) => { ctx.inventory = 'inv-9'; return 'x'; } },
      { name: 's2', run: (ctx) => `got:${ctx.inventory}` },
    ];
    const r = await orch.run(steps, { log: [] });
    expect(r.value).toBe('got:inv-9');
  });
});

/* ------------------------------------------------------------------ */
/* RequestCollapser                                                    */
/* ------------------------------------------------------------------ */

describe('RequestCollapser', () => {
  it('concurrent identical calls share one underlying invocation', async () => {
    let calls = 0;
    let release: (v: string) => void = () => undefined;
    const gate = new Promise<string>((r) => { release = r; });
    const c = new RequestCollapser<[string], string>({
      keyFn: (id) => id,
      fn: () => { calls++; return gate; },
    });
    const p1 = c.call('user:42');
    const p2 = c.call('user:42');
    const p3 = c.call('user:42');
    release('result');
    const [r1, r2, r3] = await Promise.all([p1, p2, p3]);
    expect(calls).toBe(1);
    expect(r1).toBe('result');
    expect(r2).toBe('result');
    expect(r3).toBe('result');
    expect(c.stats().joiners).toBe(2);
  });

  it('different keys do not collapse', async () => {
    let calls = 0;
    const c = new RequestCollapser<[string], string>({
      keyFn: (id) => id,
      fn: async (id) => { calls++; return `v:${id}`; },
    });
    await c.call('a');
    await c.call('b');
    expect(calls).toBe(2);
  });

  it('joiner cap rejects excess callers', async () => {
    const gate = new Promise<string>(() => undefined);
    const c = new RequestCollapser<[string], string>({
      keyFn: (id) => id,
      fn: () => gate,
      maxJoiners: 2,
    });
    void c.call('k');
    void c.call('k');
    void c.call('k');
    await expect(c.call('k')).rejects.toBeInstanceOf(CollapseLimitError);
  });
});

/* ------------------------------------------------------------------ */
/* LoadShedder                                                         */
/* ------------------------------------------------------------------ */

describe('LoadShedder', () => {
  let clock: ManualEngineClock;
  let shedder: LoadShedder;

  beforeEach(() => {
    clock = new ManualEngineClock();
    shedder = new LoadShedder({
      clock,
      maxConcurrent: 10,
      softUtilization: 0.5,
      normalShedUtilization: 0.8,
      hardUtilization: 1.0,
      minHeadroomMs: 10,
    });
  });

  it('admits low-priority below soft utilization', () => {
    for (let i = 0; i < 4; i++) shedder.begin(); // 40% loaded
    expect(shedder.admit({ priority: 'low' }).admitted).toBe(true);
  });

  it('sheds low-priority above soft utilization', () => {
    for (let i = 0; i < 6; i++) shedder.begin(); // 60%
    expect(shedder.admit({ priority: 'low' }).admitted).toBe(false);
    expect(shedder.admit({ priority: 'normal' }).admitted).toBe(true);
  });

  it('sheds normal above normalShedUtilization, keeps critical', () => {
    for (let i = 0; i < 9; i++) shedder.begin(); // 90%
    expect(shedder.admit({ priority: 'normal' }).admitted).toBe(false);
    expect(shedder.admit({ priority: 'critical' }).admitted).toBe(true);
  });

  it('sheds at hard utilization even critical', () => {
    for (let i = 0; i < 10; i++) shedder.begin(); // 100%
    expect(shedder.admit({ priority: 'critical' }).admitted).toBe(false);
  });

  it('sheds requests whose deadline leaves no headroom', () => {
    clock.set(1000);
    const d = shedder.admit({ priority: 'critical', deadlineMs: 1005 });
    expect(d.admitted).toBe(false);
    expect((d as { reason: string }).reason).toBe('deadline-expired');
  });
});

/* ------------------------------------------------------------------ */
/* ResponseComposer                                                    */
/* ------------------------------------------------------------------ */

describe('ResponseComposer', () => {
  const composer = new ResponseComposer();

  it('fields maps subsystem paths to output fields', () => {
    const results = new Map<string, unknown | null>([
      ['profile', { user: { name: 'ada', age: 36 } }],
      ['prefs', { theme: 'dark' }],
      ['missing', null],
    ]);
    const out = composer.fields(results, {
      displayName: { source: 'profile', pick: 'user.name' },
      theme: { source: 'prefs', pick: 'theme' },
      status: { source: 'missing', default: 'unknown' },
    });
    expect(out).toEqual({ displayName: 'ada', theme: 'dark', status: 'unknown' });
  });

  it('overlay merges later sources over earlier', () => {
    const results = new Map<string, unknown | null>([
      ['base', { a: 1, b: 2 }],
      ['override', { b: 20, c: 30 }],
    ]);
    expect(composer.overlay(results, ['base', 'override'])).toEqual({ a: 1, b: 20, c: 30 });
  });

  it('zipBy joins arrays on a shared key', () => {
    const results = new Map<string, unknown | null>([
      ['orders', [{ id: 1, item: 'book' }, { id: 2, item: 'pen' }]],
      ['payments', [{ id: 2, paid: true }]],
    ]);
    const rows = composer.zipBy(results, 'orders', 'payments', 'id', 'payment');
    expect(rows.length).toBe(2);
    expect((rows[0] as Record<string, unknown>)['payment']).toBeNull();
    expect(((rows[1] as Record<string, unknown>)['payment'] as Record<string, unknown>)['paid']).toBe(true);
  });
});

/* ------------------------------------------------------------------ */
/* CompensationStack                                                   */
/* ------------------------------------------------------------------ */

describe('CompensationStack', () => {
  it('unwinds LIFO on failure', async () => {
    const clock = new ManualEngineClock();
    const stack = new CompensationStack(clock);
    const order: string[] = [];
    stack.push('reserve', () => { order.push('release-reserve'); });
    stack.push('charge', () => { order.push('refund-charge'); });
    stack.push('notify', () => { order.push('cancel-notify'); });
    const r = await stack.unwind();
    expect(order).toEqual(['cancel-notify', 'refund-charge', 'release-reserve']);
    expect(r.compensated).toEqual(['notify', 'charge', 'reserve']);
    expect(r.ran).toBe(3);
  });

  it('commit prevents unwind', async () => {
    const clock = new ManualEngineClock();
    const stack = new CompensationStack(clock);
    const order: string[] = [];
    stack.push('a', () => { order.push('undo-a'); });
    stack.commit();
    const r = await stack.unwind();
    expect(r.ran).toBe(0);
    expect(order.length).toBe(0);
  });

  it('pop drops the latest compensation without running it', async () => {
    const stack = new CompensationStack();
    const order: string[] = [];
    stack.push('a', () => { order.push('a'); });
    stack.push('b', () => { order.push('b'); });
    stack.pop(); // b's compensation removed
    await stack.unwind();
    expect(order).toEqual(['a']);
  });

  it('collects compensation errors without throwing', async () => {
    const stack = new CompensationStack();
    stack.push('good', () => undefined);
    stack.push('bad', () => Promise.reject(new Error('rollback failed')));
    const r = await stack.unwind();
    expect(r.compensated).toEqual(['good']);
    expect(r.failed.length).toBe(1);
    expect(r.failed[0].name).toBe('bad');
  });

  it('unwind is idempotent', async () => {
    const stack = new CompensationStack();
    const order: string[] = [];
    stack.push('a', () => { order.push('a'); });
    await stack.unwind();
    const r2 = await stack.unwind();
    expect(r2.ran).toBe(0);
    expect(order.length).toBe(1);
  });
});

/* ------------------------------------------------------------------ */
/* BulkheadRouter                                                      */
/* ------------------------------------------------------------------ */

describe('BulkheadRouter', () => {
  it('picks least-loaded backend with capacity', async () => {
    const clock = new ManualEngineClock();
    const r = new BulkheadRouter(
      [
        { id: 'b1', maxConcurrent: 2 },
        { id: 'b2', maxConcurrent: 2 },
        { id: 'b3', maxConcurrent: 2 },
      ],
      clock,
    );
    const t1 = r.acquire()!;
    const t2 = r.acquire()!;
    const t3 = r.acquire()!;
    // first 3 spread across backends
    const ids = new Set([t1.backendId, t2.backendId, t3.backendId]);
    expect(ids.size).toBe(3);
    t1.release();
    t2.release();
    t3.release();
  });

  it('returns null when all backends saturated', async () => {
    const r = new BulkheadRouter([{ id: 'b1', maxConcurrent: 1 }]);
    const t = r.acquire();
    expect(t).not.toBeNull();
    expect(r.acquire()).toBeNull();
    t!.release();
    expect(r.acquire()).not.toBeNull();
  });

  it('run uses the picked backend and releases', async () => {
    const r = new BulkheadRouter([
      { id: 'b1', maxConcurrent: 1 },
      { id: 'b2', maxConcurrent: 1 },
    ]);
    const seen: string[] = [];
    await r.run((id) => { seen.push(id); return 'ok'; });
    await r.run((id) => { seen.push(id); return 'ok'; });
    expect(seen.length).toBe(2);
    expect(r.stats().every((b) => b.inFlight === 0)).toBe(true);
  });
});
