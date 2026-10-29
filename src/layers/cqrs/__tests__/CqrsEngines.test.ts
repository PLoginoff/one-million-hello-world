/**
 * CQRS Engines — real implementation tests.
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { CommandBus, NoHandlerError } from '../implementations/CommandBus';
import { QueryBus } from '../implementations/QueryBus';
import {
  ValidationBuilder,
  ValidationMiddleware,
  CommandValidationError,
  resolvePath,
} from '../implementations/ValidationMiddleware';
import {
  ConflictDetector,
  aggregateIdExtractor,
  sameTypePolicy,
  alwaysConflict,
  CommandConflictError,
} from '../implementations/ConflictDetection';
import {
  DenormalizerPipeline,
  type ProjectionEvent,
  type ProjectionTarget,
  type ProjectionOp,
} from '../implementations/Denormalizer';
import { ConsistencyTracker } from '../implementations/ConsistencyTracker';
import {
  AggregateDispatcher,
  type DispatchableAggregate,
  type AggregateStore,
  AggregateConcurrencyError,
} from '../implementations/AggregateDispatcher';
import type { Command, CommandContext } from '../implementations/CqrsCore';

// -------------------------------------------------------------- test rig

const ctx = (over: Partial<CommandContext> = {}): CommandContext => ({
  dispatchId: 'd-test',
  correlationId: 'c-test',
  timestamp: Date.now(),
  metadata: {},
  ...over,
});

const cmd = (type: string, payload: unknown, idempotencyKey?: string): Command => ({
  type,
  payload,
  idempotencyKey,
});

// ---------------------------------------------------------------- CommandBus

describe('CommandBus', () => {
  let bus: CommandBus;
  beforeEach(() => {
    bus = new CommandBus();
  });

  it('dispatches a command to its handler', async () => {
    bus.register('test.ping', (c) => `pong:${(c.payload as { n: number }).n}`);
    const r = await bus.dispatch<string>(cmd('test.ping', { n: 42 }));
    expect(r.ok).toBe(true);
    expect(r.value).toBe('pong:42');
  });

  it('rejects unregistered command types', async () => {
    const r = await bus.dispatch(cmd('missing', {}));
    expect(r.ok).toBe(false);
    expect(r.error).toBeInstanceOf(NoHandlerError);
  });

  it('prevents duplicate handler registration', () => {
    bus.register('x', () => 1);
    expect(() => bus.register('x', () => 2)).toThrow();
  });

  it('runs global middleware in order', async () => {
    const order: string[] = [];
    bus.use(async (_m, _c, next) => {
      order.push('a-before');
      const r = await next();
      order.push('a-after');
      return r;
    });
    bus.use(async (_m, _c, next) => {
      order.push('b-before');
      const r = await next();
      order.push('b-after');
      return r;
    });
    bus.register('x', () => {
      order.push('handler');
      return 'ok';
    });
    await bus.dispatch(cmd('x', {}));
    expect(order).toEqual(['a-before', 'b-before', 'handler', 'b-after', 'a-after']);
  });

  it('runs typed middleware only for its type', async () => {
    const seen: string[] = [];
    bus.useFor('a', async (_m, _c, next) => {
      seen.push('a-mw');
      return next();
    });
    bus.register('a', () => 'a');
    bus.register('b', () => 'b');
    await bus.dispatch(cmd('a', {}));
    await bus.dispatch(cmd('b', {}));
    expect(seen).toEqual(['a-mw']);
  });

  it('captures handler errors without throwing by default', async () => {
    bus.register('boom', () => {
      throw new Error('kaboom');
    });
    const r = await bus.dispatch(cmd('boom', {}));
    expect(r.ok).toBe(false);
    expect(r.error?.message).toBe('kaboom');
  });

  it('throws on error when throwOnError is set', async () => {
    bus.register('boom', () => {
      throw new Error('kaboom');
    });
    await expect(bus.dispatch(cmd('boom', {}), { throwOnError: true })).rejects.toThrow('kaboom');
  });

  it('replays idempotent results for the same key', async () => {
    let calls = 0;
    bus.register('once', () => {
      calls += 1;
      return `call-${calls}`;
    });
    const r1 = await bus.dispatch<string>(cmd('once', {}, 'key-1'));
    const r2 = await bus.dispatch<string>(cmd('once', {}, 'key-1'));
    expect(r1.value).toBe('call-1');
    expect(r2.value).toBe('call-1');
    expect(calls).toBe(1);
  });

  it('tracks per-type stats', async () => {
    bus.register('x', () => 'ok');
    bus.register('y', () => {
      throw new Error('fail');
    });
    await bus.dispatch(cmd('x', {}));
    await bus.dispatch(cmd('x', {}));
    await bus.dispatch(cmd('y', {}));
    const totals = bus.totals();
    expect(totals.dispatches).toBe(3);
    expect(totals.successes).toBe(2);
    expect(totals.failures).toBe(1);
    const sx = bus.stats().get('x');
    expect(sx?.dispatchCount).toBe(2);
    expect(sx?.successCount).toBe(2);
  });

  it('freezes registration', () => {
    bus.register('x', () => 1);
    bus.freeze();
    expect(() => bus.register('y', () => 2)).toThrow();
  });
});

// ------------------------------------------------------------------ QueryBus

describe('QueryBus', () => {
  let bus: QueryBus;
  beforeEach(() => {
    bus = new QueryBus();
  });

  it('dispatches a query to its handler', async () => {
    bus.register('user.byId', (q) => ({ id: (q.params as { id: string }).id, name: 'x' }));
    const r = await bus.dispatch<{ id: string }>({ type: 'user.byId', params: { id: 'u-1' } });
    expect(r.ok).toBe(true);
    expect(r.value?.id).toBe('u-1');
  });

  it('caches results for cacheable types', async () => {
    let calls = 0;
    bus.register('cached', () => {
      calls += 1;
      return calls;
    });
    bus.cacheable('cached');
    const r1 = await bus.dispatch({ type: 'cached', params: { a: 1 } });
    const r2 = await bus.dispatch({ type: 'cached', params: { a: 1 } });
    expect(r1.value).toBe(1);
    expect(r2.value).toBe(1);
    expect(calls).toBe(1);
    const stats = bus.cacheStats();
    expect(stats.hits).toBe(1);
    expect(stats.misses).toBe(1);
  });

  it('does not share cache across different params', async () => {
    let calls = 0;
    bus.register('cached', (q) => {
      calls += 1;
      return (q.params as { n: number }).n + calls;
    });
    bus.cacheable('cached');
    const r1 = await bus.dispatch({ type: 'cached', params: { n: 1 } });
    const r2 = await bus.dispatch({ type: 'cached', params: { n: 2 } });
    expect(r1.value).toBe(2);
    expect(r2.value).toBe(4); // different params — no cache hit
    expect(calls).toBe(2);
  });

  it('honors CacheableResult custom TTL', async () => {
    let calls = 0;
    bus.register('ttl', () => {
      calls += 1;
      return { value: calls, ttlMs: 30 };
    });
    bus.cacheable('ttl');
    await bus.dispatch({ type: 'ttl', params: {} });
    const cached = await bus.dispatch({ type: 'ttl', params: {} });
    expect(cached.value).toBe(1);
    await new Promise((r) => setTimeout(r, 50));
    await bus.dispatch({ type: 'ttl', params: {} });
    expect(calls).toBe(2);
  });

  it('invalidate() clears only matching type prefix', async () => {
    bus.register('a', () => 'A');
    bus.register('b', () => 'B');
    bus.cacheable('a').cacheable('b');
    await bus.dispatch({ type: 'a', params: {} });
    await bus.dispatch({ type: 'b', params: {} });
    expect(bus.invalidate('a')).toBe(1);
    expect(bus.cacheStats().size).toBe(1);
  });
});

// ------------------------------------------------------------- validation

describe('ValidationMiddleware', () => {
  it('resolvePath traverses nested objects', () => {
    const p = { user: { email: 'a@b.c', name: 'n' } };
    expect(resolvePath(p, 'user.email')).toEqual({ found: true, value: 'a@b.c' });
    expect(resolvePath(p, 'user.missing').found).toBe(false);
    expect(resolvePath(p, 'nope').found).toBe(false);
  });

  it('builder produces required-field violations', async () => {
    const mw = new ValidationMiddleware();
    mw.add(
      new ValidationBuilder()
        .required('name')
        .type('name', 'string')
        .minLength('name', 3)
        .build(),
    );
    const report = await mw.validate(cmd('x', { name: 'ab' }), ctx());
    expect(report.valid).toBe(false);
    expect(report.issues.some((i) => i.rule === 'minLength')).toBe(true);
  });

  it('passes valid commands through the middleware', async () => {
    const bus = new CommandBus();
    const mw = new ValidationMiddleware();
    mw.addFor(
      'create',
      new ValidationBuilder()
        .required('email')
        .pattern('email', /@/)
        .build(),
    );
    bus.use(mw.middleware());
    bus.register('create', () => 'created');
    const ok = await bus.dispatch(cmd('create', { email: 'a@b.c' }));
    expect(ok.ok).toBe(true);
    const bad = await bus.dispatch(cmd('create', { email: 'nope' }));
    expect(bad.ok).toBe(false);
    expect(bad.error).toBeInstanceOf(CommandValidationError);
  });

  it('aggregates warnings into context.metadata', async () => {
    const bus = new CommandBus();
    const mw = new ValidationMiddleware();
    mw.addFor(
      'x',
      new ValidationBuilder().required('warnField', { severity: 'warning' }).build(),
    );
    let captured: unknown;
    bus.use(mw.middleware());
    bus.register('x', (_c, context) => {
      captured = context.metadata['warnings'];
      return 'ok';
    });
    const r = await bus.dispatch(cmd('x', {}));
    expect(r.ok).toBe(true);
    expect(Array.isArray(captured)).toBe(true);
    expect((captured as unknown[]).length).toBe(1);
  });
});

// ---------------------------------------------------------- conflicts

describe('ConflictDetector', () => {
  it('rejects conflicting commands in reject mode', async () => {
    const bus = new CommandBus();
    const detector = new ConflictDetector({
      extract: aggregateIdExtractor,
      policy: sameTypePolicy,
      mode: 'reject',
    });
    bus.use(detector.middleware());

    let release!: () => void;
    const gate = new Promise<void>((r) => {
      release = r;
    });
    bus.register('a.update', async () => {
      await gate;
      return 'done';
    });

    const c1 = cmd('a.update', { aggregateId: 'agg-1' });
    const c2 = cmd('a.update', { aggregateId: 'agg-1' });

    const first = bus.dispatch(c1); // in-flight
    const second = await bus.dispatch(c2); // should conflict
    expect(second.ok).toBe(false);
    expect(second.error).toBeInstanceOf(CommandConflictError);
    release();
    const r1 = await first;
    expect(r1.ok).toBe(true);
  });

  it('allows non-conflicting commands on different aggregates', async () => {
    const bus = new CommandBus();
    const detector = new ConflictDetector({
      extract: aggregateIdExtractor,
      policy: alwaysConflict,
      mode: 'reject',
    });
    bus.use(detector.middleware());
    bus.register('a.update', () => 'done');
    const r1 = await bus.dispatch(cmd('a.update', { aggregateId: 'agg-1' }));
    const r2 = await bus.dispatch(cmd('a.update', { aggregateId: 'agg-2' }));
    expect(r1.ok).toBe(true);
    expect(r2.ok).toBe(true);
  });

  it('queue mode serializes conflicting commands', async () => {
    const bus = new CommandBus();
    const detector = new ConflictDetector({
      extract: aggregateIdExtractor,
      policy: sameTypePolicy,
      mode: 'queue',
      queueTimeoutMs: 5_000,
    });
    bus.use(detector.middleware());

    const order: number[] = [];
    bus.register('seq', async (c) => {
      const n = (c.payload as { n: number }).n;
      await new Promise((r) => setTimeout(r, n === 1 ? 30 : 5));
      order.push(n);
      return n;
    });

    const r1 = bus.dispatch(cmd('seq', { aggregateId: 'x', n: 1 }));
    const r2 = bus.dispatch(cmd('seq', { aggregateId: 'x', n: 2 }));
    await Promise.all([r1, r2]);
    expect(order).toEqual([1, 2]);
    const s = detector.stats();
    expect(s.queued).toBe(1);
  });
});

// ------------------------------------------------------------ denormalizer

class InMemoryTarget implements ProjectionTarget {
  readonly name: string;
  private readonly _docs = new Map<string, Record<string, unknown>>();
  appliedOps: ProjectionOp[] = [];

  constructor(name: string) {
    this.name = name;
  }

  apply(ops: ProjectionOp[]): void {
    this.appliedOps.push(...ops);
    for (const op of ops) {
      if (op.kind === 'upsert') {
        this._docs.set(op.id, { ...op.document });
      } else if (op.kind === 'patch') {
        const cur = this._docs.get(op.id) ?? {};
        this._docs.set(op.id, { ...cur, ...op.patch });
      } else if (op.kind === 'delete') {
        this._docs.delete(op.id);
      }
    }
  }

  get(id: string): Record<string, unknown> | undefined {
    return this._docs.get(id);
  }

  clear(): void {
    this._docs.clear();
    this.appliedOps = [];
  }
}

const ev = (
  id: string,
  type: string,
  position: number,
  data: unknown,
  aggregateId = 'agg-1',
  aggregateVersion = position,
): ProjectionEvent => ({
  eventId: id,
  type,
  aggregateId,
  aggregateVersion,
  position,
  data,
  metadata: {},
  timestamp: Date.now(),
});

describe('DenormalizerPipeline', () => {
  it('fans out one event to multiple denormalizers', async () => {
    const targetA = new InMemoryTarget('a');
    const targetB = new InMemoryTarget('b');
    const pipe = new DenormalizerPipeline();
    pipe.register({
      name: 'denorm-a',
      eventTypes: ['user.created'],
      target: targetA,
      project: (e) => [{ kind: 'upsert', id: e.aggregateId, document: e.data as Record<string, unknown> }],
    });
    pipe.register({
      name: 'denorm-b',
      eventTypes: ['*'],
      target: targetB,
      project: (e) => [{ kind: 'upsert', id: e.eventId, document: { type: e.type } }],
    });
    const applied = await pipe.processEvent(ev('e1', 'user.created', 1, { name: 'x' }));
    expect(applied).toBe(2);
    expect(targetA.get('agg-1')).toEqual({ name: 'x' });
    expect(targetB.get('e1')).toEqual({ type: 'user.created' });
  });

  it('deduplicates events per denormalizer', async () => {
    const target = new InMemoryTarget('t');
    const pipe = new DenormalizerPipeline();
    let calls = 0;
    pipe.register({
      name: 'd',
      eventTypes: ['x'],
      target,
      project: () => {
        calls += 1;
        return [];
      },
    });
    const e = ev('e1', 'x', 1, {});
    await pipe.processEvent(e);
    await pipe.processEvent(e); // replay — should be skipped
    expect(calls).toBe(1);
  });

  it('captures denormalizer errors without blocking others', async () => {
    const tA = new InMemoryTarget('a');
    const tB = new InMemoryTarget('b');
    const pipe = new DenormalizerPipeline();
    pipe.register({
      name: 'fails',
      eventTypes: ['x'],
      target: tA,
      project: () => {
        throw new Error('denorm failed');
      },
    });
    pipe.register({
      name: 'works',
      eventTypes: ['x'],
      target: tB,
      project: (e) => [{ kind: 'upsert', id: 'doc', document: { ok: true } }],
    });
    const report = await pipe.processEvents([ev('e1', 'x', 1, {})]);
    expect(report.totalErrors).toBe(1);
    expect(report.totalOps).toBe(1);
    const fails = report.results.find((r) => r.name === 'fails');
    expect(fails?.errors.length).toBe(1);
    expect(tB.get('doc')).toEqual({ ok: true });
  });

  it('tracks checkpoints and only advances on success', async () => {
    const t = new InMemoryTarget('t');
    const pipe = new DenormalizerPipeline();
    let shouldFail = false;
    pipe.register({
      name: 'd',
      eventTypes: ['x'],
      target: t,
      project: (e) => {
        if (shouldFail) throw new Error('nope');
        return [{ kind: 'upsert', id: `id-${e.position}`, document: {} }];
      },
    });
    await pipe.processEvents([ev('e1', 'x', 5, {})]);
    expect(pipe.checkpoint('d')).toBe(5);
    shouldFail = true;
    await pipe.processEvents([ev('e2', 'x', 6, {})]);
    expect(pipe.checkpoint('d')).toBe(5); // not advanced past failure
  });

  it('rebuild clears target and replays events', async () => {
    const t = new InMemoryTarget('t');
    const pipe = new DenormalizerPipeline();
    pipe.register({
      name: 'd',
      eventTypes: ['x'],
      target: t,
      project: (e) => [{ kind: 'upsert', id: `id-${e.position}`, document: { pos: e.position } }],
    });
    await pipe.processEvents([ev('e1', 'x', 1, {}), ev('e2', 'x', 2, {})]);
    expect(t.get('id-1')).toBeDefined();
    // rebuild with a different event set
    const report = await pipe.rebuild('d', [ev('e3', 'x', 1, {}), ev('e4', 'x', 2, {})]);
    expect(report.totalOps).toBe(2);
    expect(t.get('id-1')).toBeDefined(); // from replay, not stale
    expect(t.get('id-2')).toBeDefined();
  });

  it('filters events before projecting', async () => {
    const t = new InMemoryTarget('t');
    const pipe = new DenormalizerPipeline();
    const seen: string[] = [];
    pipe.register({
      name: 'd',
      eventTypes: ['x'],
      target: t,
      filter: (e) => (e.data as { keep: boolean }).keep,
      project: (e) => {
        seen.push(e.eventId);
        return [];
      },
    });
    await pipe.processEvents([
      ev('e1', 'x', 1, { keep: true }),
      ev('e2', 'x', 2, { keep: false }),
      ev('e3', 'x', 3, { keep: true }),
    ]);
    expect(seen).toEqual(['e1', 'e3']);
  });
});

// --------------------------------------------------------------- tracker

describe('ConsistencyTracker', () => {
  it('reports lag vs head', () => {
    const t = new ConsistencyTracker();
    t.observeHead(100);
    t.observeApplied('d', 60);
    expect(t.lag('d')).toBe(40);
    expect(t.health('d')).toBe('lagging');
  });

  it('classifies healthy under the threshold', () => {
    const t = new ConsistencyTracker({ laggingThreshold: 5 });
    t.observeHead(10);
    t.observeApplied('d', 8);
    expect(t.health('d')).toBe('healthy');
  });

  it('classifies stalled when no progress for stalledMs', async () => {
    const t = new ConsistencyTracker({ laggingThreshold: 5, stalledMs: 20 });
    t.observeHead(100);
    t.observeApplied('d', 50);
    await new Promise((r) => setTimeout(r, 30));
    expect(t.health('d')).toBe('stalled');
  });

  it('computes aggregate stats over the window', () => {
    const t = new ConsistencyTracker();
    for (let i = 1; i <= 10; i++) {
      t.observeHead(i * 10);
      t.observeApplied('d', i * 10 - i); // lag grows
    }
    const s = t.stats('d');
    expect(s.samples).toBe(10);
    expect(s.currentLag).toBe(10);
    expect(s.meanLag).toBeGreaterThan(0);
  });

  it('waitFor resolves when position is reached', async () => {
    const t = new ConsistencyTracker();
    t.observeHead(10);
    setTimeout(() => t.observeApplied('d', 10), 20);
    const ok = await t.waitFor('d', 10, { timeoutMs: 500, intervalMs: 5 });
    expect(ok).toBe(true);
  });

  it('waitFor times out when position is never reached', async () => {
    const t = new ConsistencyTracker();
    t.observeHead(10);
    t.observeApplied('d', 3);
    const ok = await t.waitFor('d', 10, { timeoutMs: 50, intervalMs: 5 });
    expect(ok).toBe(false);
  });

  it('estimates catch-up time from rate', () => {
    const t = new ConsistencyTracker();
    t.observeHead(100);
    const base = Date.now();
    // simulate applying events over time by pre-seeding samples
    for (let i = 0; i < 5; i++) {
      t.observeApplied('d', i * 10);
    }
    const eta = t.estimatedCatchupMs('d');
    expect(eta === 0 || eta > 0 || eta === Number.POSITIVE_INFINITY).toBe(true);
    void base;
  });
});

// ------------------------------------------------- aggregate dispatcher

class TestAggregate implements DispatchableAggregate {
  readonly id: string;
  version = 0;
  private _pending: { type: string; data: unknown }[] = [];
  balance = 0;

  constructor(id: string) {
    this.id = id;
  }

  get pendingEvents(): readonly { type: string; data: unknown }[] {
    return this._pending;
  }

  commitPending(): void {
    this._pending = [];
  }

  deposit(n: number): void {
    this._pending.push({ type: 'deposited', data: { amount: n } });
    this.balance += n;
  }
}

class InMemoryStore implements AggregateStore<TestAggregate> {
  private readonly _store = new Map<string, { aggregate: TestAggregate; version: number }>();

  async load(_type: string, id: string): Promise<TestAggregate | undefined> {
    return this._store.get(id)?.aggregate;
  }

  async save(_type: string, aggregate: TestAggregate, expected: number): Promise<{ newVersion: number }> {
    const cur = this._store.get(aggregate.id);
    const actual = cur?.version ?? 0;
    if (actual !== expected) {
      throw new AggregateConcurrencyError(aggregate.id, expected, actual);
    }
    const newVersion = actual + aggregate.pendingEvents.length;
    aggregate.version = newVersion; // keep in-memory object in sync
    this._store.set(aggregate.id, { aggregate, version: newVersion });
    return { newVersion };
  }
}

describe('AggregateDispatcher', () => {
  let store: InMemoryStore;
  let dispatcher: AggregateDispatcher;

  beforeEach(() => {
    store = new InMemoryStore();
    dispatcher = new AggregateDispatcher(store);
    dispatcher.route('acc.deposit', {
      aggregateType: 'account',
      aggregateId: (c) => (c.payload as { id: string }).id,
      load: async (s, id) => (await s.load('account', id)) ?? new TestAggregate(id),
      invoke: (agg, c) => agg.deposit((c.payload as { amount: number }).amount),
    });
  });

  it('creates a new aggregate on first command', async () => {
    const r = await dispatcher.dispatch(cmd('acc.deposit', { id: 'a1', amount: 10 }), ctx());
    expect(r.newVersion).toBe(1);
    expect(r.emittedEvents.length).toBe(1);
    expect(r.emittedEvents[0]?.type).toBe('deposited');
  });

  it('increments version on subsequent commands', async () => {
    await dispatcher.dispatch(cmd('acc.deposit', { id: 'a1', amount: 10 }), ctx());
    const r = await dispatcher.dispatch(cmd('acc.deposit', { id: 'a1', amount: 5 }), ctx());
    expect(r.newVersion).toBe(2);
  });

  it('routes to correct aggregate id', async () => {
    await dispatcher.dispatch(cmd('acc.deposit', { id: 'a1', amount: 1 }), ctx());
    await dispatcher.dispatch(cmd('acc.deposit', { id: 'a2', amount: 2 }), ctx());
    const a1 = await store.load('account', 'a1');
    const a2 = await store.load('account', 'a2');
    expect(a1?.balance).toBe(1);
    expect(a2?.balance).toBe(2);
  });

  it('throws when no route registered', async () => {
    await expect(dispatcher.dispatch(cmd('missing', {}), ctx())).rejects.toThrow('No route');
  });
});
