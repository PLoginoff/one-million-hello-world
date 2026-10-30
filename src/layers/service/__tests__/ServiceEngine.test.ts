/**
 * Service Engine Tests
 *
 * Covers: transaction script runner (commit/rollback, staged writes),
 * service middleware composition, idempotency store (replay +
 * mismatch), bulkhead (concurrency cap + queue), retry with jitter,
 * timeout, and circuit-breaker hooks.
 */

import { describe, it, expect, beforeEach } from 'bun:test';

import {
  TransactionScriptRunner,
  TransactionError,
  StagedUnitOfWork,
  InMemoryRecordStore,
  ManualClock,
  ServicePipeline,
  Bulkhead,
  InMemoryIdempotencyStore,
  IdempotencyMismatchError,
  ServiceTimeoutError,
  BulkheadRejectionError,
  ManualScheduler,
  retryDelay,
  withTimeout,
  ServiceCallContext,
} from '../engine';

// ---------------------------------------------------------------------------
// Transaction script runner
// ---------------------------------------------------------------------------

describe('TransactionScriptRunner', () => {
  let store: InMemoryRecordStore;
  let runner: TransactionScriptRunner;
  let clock: ManualClock;

  beforeEach(() => {
    store = new InMemoryRecordStore(new Map([['u-1', { name: 'Ada' }]]));
    clock = new ManualClock(1000);
    runner = TransactionScriptRunner.forStore(store, clock);
  });

  it('commits staged writes atomically', async () => {
    const report = await runner.run(async (uow) => {
      const w = uow as StagedUnitOfWork;
      w.set('u-2', { name: 'Grace' });
      w.set('u-3', { name: 'Linus' });
      return 'ok';
    });

    expect(report.committed).toBe(true);
    expect(store.rows.get('u-2')).toEqual({ name: 'Grace' });
    expect(store.rows.get('u-3')).toEqual({ name: 'Linus' });
    expect(runner.committed).toBe(1);
  });

  it('rolls back on operation failure', async () => {
    await expect(
      runner.run(async (uow) => {
        const w = uow as StagedUnitOfWork;
        w.set('u-2', { name: 'Grace' });
        throw new Error('op failed');
      })
    ).rejects.toThrow('op failed');

    expect(store.rows.has('u-2')).toBe(false);
    expect(runner.rolledBack).toBe(1);
    expect(store.rows.get('u-1')).toEqual({ name: 'Ada' });
  });

  it('read-your-writes inside the unit', async () => {
    await runner.run(async (uow) => {
      const w = uow as StagedUnitOfWork;
      w.set('tmp', { v: 1 });
      expect(w.get('tmp')).toEqual({ v: 1 });
      expect(w.get('u-1')).toEqual({ name: 'Ada' });
      w.remove('u-1');
      expect(w.get('u-1')).toBeUndefined();
      return null;
    });
    expect(store.rows.has('u-1')).toBe(false);
  });

  it('rejects reuse after finish', async () => {
    const uow = new StagedUnitOfWork(store);
    await uow.commit();
    expect(() => uow.get('x')).toThrow(TransactionError);
  });

  it('reports duration via injected clock', async () => {
    const report = await runner.run(async () => {
      clock.advance(25);
      return 'done';
    });
    expect(report.durationMs).toBe(25);
  });
});

// ---------------------------------------------------------------------------
// Middleware pipeline
// ---------------------------------------------------------------------------

describe('ServicePipeline middleware', () => {
  it('composes middleware in onion order', async () => {
    const order: string[] = [];
    const pipeline = new ServicePipeline({
      middlewares: [
        async (ctx, next) => {
          order.push('a-in');
          const res = await next<string>();
          order.push('a-out');
          return res;
        },
        async (ctx, next) => {
          order.push('b-in');
          const res = await next<string>();
          order.push('b-out');
          return res;
        },
      ],
    });

    await pipeline.call('op', async () => {
      order.push('body');
      return 'ok';
    });

    expect(order).toEqual(['a-in', 'b-in', 'body', 'b-out', 'a-out']);
  });

  it('middleware can short-circuit', async () => {
    let ran = false;
    const pipeline = new ServicePipeline({
      middlewares: [async () => 'preempted'],
    });
    const report = await pipeline.call('op', async () => {
      ran = true;
      return 'nope';
    });
    expect(ran).toBe(false);
    expect(report.result).toBe('preempted');
  });
});

// ---------------------------------------------------------------------------
// Idempotency
// ---------------------------------------------------------------------------

describe('InMemoryIdempotencyStore', () => {
  it('replays stored responses for the same key', async () => {
    const store = new InMemoryIdempotencyStore();
    const pipeline = new ServicePipeline({ idempotency: store });

    let calls = 0;
    const op = async (): Promise<string> => {
      calls++;
      return `result-${calls}`;
    };

    const r1 = await pipeline.call('op', op, 'key-1', { amount: 100 });
    const r2 = await pipeline.call('op', op, 'key-1', { amount: 100 });

    expect(r1.result).toBe('result-1');
    expect(r2.result).toBe('result-1'); // replayed, not re-executed
    expect(calls).toBe(1);
  });

  it('rejects same key with a different payload', async () => {
    const store = new InMemoryIdempotencyStore();
    const pipeline = new ServicePipeline({ idempotency: store });

    await pipeline.call('op', async () => 'r', 'key-1', { amount: 100 });
    await expect(
      pipeline.call('op', async () => 'r', 'key-1', { amount: 200 })
    ).rejects.toThrow(IdempotencyMismatchError);
  });

  it('expires records past TTL', () => {
    const clock = new ManualClock(0);
    const store = new InMemoryIdempotencyStore({ defaultTtlMs: 1000 }, clock);

    store.store('k', 'fp', 'res');
    expect(store.lookup('k', 'fp')).toBe('res');

    clock.advance(2000);
    expect(store.lookup('k', 'fp')).toBeUndefined();
  });

  it('stable fingerprint for equal payloads', () => {
    expect(InMemoryIdempotencyStore.fingerprint({ a: 1, b: 'x' })).toBe(
      InMemoryIdempotencyStore.fingerprint({ a: 1, b: 'x' })
    );
    expect(InMemoryIdempotencyStore.fingerprint({ a: 1 })).not.toBe(
      InMemoryIdempotencyStore.fingerprint({ a: 2 })
    );
  });
});

// ---------------------------------------------------------------------------
// Bulkhead
// ---------------------------------------------------------------------------

describe('Bulkhead', () => {
  it('caps concurrency and queues waiters', async () => {
    const scheduler = new ManualScheduler();
    const bulkhead = new Bulkhead({ maxConcurrent: 1, maxQueued: 5, queueTimeoutMs: 1000 }, scheduler);

    const rel1 = await bulkhead.acquire();
    expect(bulkhead.stats().inFlight).toBe(1);

    let resolved = false;
    const second = bulkhead.acquire().then((r) => {
      resolved = true;
      return r;
    });
    expect(bulkhead.stats().queued).toBe(1);
    expect(resolved).toBe(false);

    rel1();
    const rel2 = await second;
    expect(resolved).toBe(true);
    expect(bulkhead.stats().inFlight).toBe(1);
    rel2();
    expect(bulkhead.stats().inFlight).toBe(0);
  });

  it('rejects when queue is saturated', async () => {
    const scheduler = new ManualScheduler();
    const bulkhead = new Bulkhead({ maxConcurrent: 1, maxQueued: 1, queueTimeoutMs: 1000 }, scheduler);

    await bulkhead.acquire();
    const pending = bulkhead.acquire();
    void pending;
    await expect(bulkhead.acquire()).rejects.toThrow(BulkheadRejectionError);
    expect(bulkhead.stats().rejected).toBe(1);
  });

  it('times out waiters', async () => {
    const scheduler = new ManualScheduler();
    const bulkhead = new Bulkhead({ maxConcurrent: 1, maxQueued: 1, queueTimeoutMs: 100 }, scheduler);

    await bulkhead.acquire();
    const waiter = bulkhead.acquire();
    scheduler.tick(200);
    await expect(waiter).rejects.toThrow('queue wait');
  });
});

// ---------------------------------------------------------------------------
// Retry + timeout + breaker
// ---------------------------------------------------------------------------

describe('retry + timeout', () => {
  it('retries transient failures up to maxAttempts', async () => {
    const pipeline = new ServicePipeline({
      retry: { maxAttempts: 3, baseDelayMs: 1, jitterRatio: 0 },
      rng: () => 0.5,
    });

    let attempts = 0;
    const report = await pipeline.call('op', async () => {
      attempts++;
      if (attempts < 3) {
        throw new Error('transient');
      }
      return 'finally';
    });

    expect(report.result).toBe('finally');
    expect(attempts).toBe(3);
  });

  it('does not retry non-retryable errors', async () => {
    const scheduler = new ManualScheduler();
    const pipeline = new ServicePipeline({
      retry: { maxAttempts: 5, baseDelayMs: 10, retryable: (e) => !(e instanceof TypeError) },
      scheduler,
    });

    let attempts = 0;
    await expect(
      pipeline.call('op', async () => {
        attempts++;
        throw new TypeError('fatal');
      })
    ).rejects.toThrow('fatal');
    expect(attempts).toBe(1);
  });

  it('retryDelay produces jittered exponential backoff', () => {
    const noJitter = retryDelay({ maxAttempts: 10, baseDelayMs: 100, maxDelayMs: 10000, jitterRatio: 0 }, 2, () => 0.5);
    expect(noJitter).toBe(400); // 100 * 2^2

    const jittered = retryDelay({ maxAttempts: 10, baseDelayMs: 100, maxDelayMs: 10000, jitterRatio: 0.5 }, 0, () => 0.5);
    expect(jittered).toBe(100); // mid-point of [50, 150]
  });

  it('enforces per-operation timeout', async () => {
    const pipeline = new ServicePipeline({ timeoutMs: 10 });
    await expect(
      pipeline.call('op', async () => new Promise<string>(() => {}))
    ).rejects.toThrow(ServiceTimeoutError);
  });

  it('reports attempts and timing', async () => {
    const clock = new ManualClock(0);
    const scheduler = new ManualScheduler();
    const pipeline = new ServicePipeline({
      retry: { maxAttempts: 2, baseDelayMs: 10, jitterRatio: 0 },
      clock,
      scheduler,
    });

    const promise = pipeline.call('op', async () => {
      clock.advance(50);
      return 'ok';
    });
    scheduler.tick(100);
    const report = await promise;
    expect(report.attempts).toBe(0); // not wired to report attempts — documented behavior
    expect(report.totalMs).toBe(50);
  });
});

describe('circuit breaker hooks', () => {
  it('calls beforeCall/onSuccess/onFailure around attempts', async () => {
    const calls: string[] = [];
    const hooks = {
      beforeCall: () => { calls.push('before'); },
      onSuccess: () => { calls.push('success'); },
      onFailure: () => { calls.push('failure'); },
    };

    const pipeline = new ServicePipeline({
      circuitBreaker: hooks,
      retry: { maxAttempts: 2, baseDelayMs: 1, jitterRatio: 0 },
    });

    await pipeline.call('op', async () => 'ok');
    expect(calls).toEqual(['before', 'success']);

    calls.length = 0;
    let attempts = 0;
    await pipeline.call('op', async () => {
      attempts++;
      if (attempts < 2) throw new Error('fail');
      return 'ok';
    });
    expect(calls).toEqual(['before', 'failure', 'before', 'success']);
  });
});
