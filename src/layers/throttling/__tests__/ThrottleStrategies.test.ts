/**
 * Tests for the throttling strategies: concurrency semaphore, token bucket,
 * AIMD, priority heap, queue throttle with timeouts, request coalescing.
 */

import { describe, it, expect } from 'bun:test';
import { ManualTimerSource, QueueTimeoutError, ThrottleRejectedError } from '../domain/throttle-model';
import { ConcurrencyLimiterStrategy } from '../strategies/ConcurrencyLimiterStrategy';
import { TokenBucketStrategy } from '../strategies/TokenBucketStrategy';
import { AimdStrategy } from '../strategies/AimdStrategy';
import { PriorityThrottleStrategy } from '../strategies/PriorityThrottleStrategy';
import { QueueThrottleStrategy } from '../strategies/QueueThrottleStrategy';
import { CoalescingStrategy } from '../strategies/CoalescingStrategy';

const tick = async (n = 5) => {
  for (let i = 0; i < n; i++) {
    await Promise.resolve();
  }
};

describe('ConcurrencyLimiterStrategy', () => {
  it('caps in-flight work at maxConcurrent', async () => {
    const limiter = new ConcurrencyLimiterStrategy({ maxConcurrent: 2 });
    let active = 0;
    let maxSeen = 0;
    const job = () =>
      limiter.run(async () => {
        active++;
        maxSeen = Math.max(maxSeen, active);
        await tick(10);
        active--;
      });
    await Promise.all([job(), job(), job(), job()]);
    expect(maxSeen).toBe(2);
    expect(limiter.metrics().admitted).toBe(2); // 2 direct, 2 dequeued
    expect(limiter.metrics().dequeued).toBe(2);
  });

  it('waiters acquire in FIFO order', async () => {
    const limiter = new ConcurrencyLimiterStrategy({ maxConcurrent: 1 });
    const order: string[] = [];
    await limiter.acquire();
    const p1 = limiter.acquire().then(() => order.push('w1'));
    const p2 = limiter.acquire().then(() => order.push('w2'));
    const p3 = limiter.acquire().then(() => order.push('w3'));
    await tick();
    limiter.release();
    await tick();
    limiter.release();
    await tick();
    limiter.release();
    await Promise.all([p1, p2, p3]);
    expect(order).toEqual(['w1', 'w2', 'w3']);
  });

  it('queue overflow rejects immediately', async () => {
    const limiter = new ConcurrencyLimiterStrategy({ maxConcurrent: 1, maxQueue: 1 });
    await limiter.acquire();
    const queued = limiter.acquire();
    await tick();
    await expect(limiter.acquire()).rejects.toBeInstanceOf(ThrottleRejectedError);
    limiter.release();
    await queued;
    limiter.release();
  });

  it('waiter timeout rejects with QueueTimeoutError', async () => {
    const timer = new ManualTimerSource();
    const limiter = new ConcurrencyLimiterStrategy({ maxConcurrent: 1, queueTimeoutMs: 100, timer });
    await limiter.acquire();
    const waiting = limiter.acquire();
    timer.advance(200);
    timer.flush();
    // Assertion must be created after the promise has rejected — bun's
    // `.rejects` matcher awaits the promise at creation time and hangs
    // if the rejection source (manual timer) hasn't fired yet.
    await expect(waiting).rejects.toBeInstanceOf(QueueTimeoutError);
    expect(limiter.metrics().timedOut).toBe(1);
    limiter.release();
  });
});

describe('TokenBucketStrategy', () => {
  it('admits bursts up to capacity then rejects', () => {
    const timer = new ManualTimerSource();
    const bucket = new TokenBucketStrategy({ ratePerSec: 10, capacity: 5, timer });
    for (let i = 0; i < 5; i++) {
      expect(bucket.tryAcquire()).toBe(true);
    }
    expect(bucket.tryAcquire()).toBe(false);
    expect(bucket.available).toBeLessThan(1);
  });

  it('refills lazily at the configured rate', () => {
    const timer = new ManualTimerSource();
    const bucket = new TokenBucketStrategy({ ratePerSec: 10, capacity: 10, initialTokens: 0, timer });
    expect(bucket.tryAcquire()).toBe(false);
    timer.advance(500); // +5 tokens
    expect(bucket.tryAcquire()).toBe(true);
    expect(bucket.available).toBeCloseTo(4, 5);
    // Cap at capacity.
    timer.advance(10_000);
    expect(bucket.available).toBe(10);
  });

  it('blocking acquire waits the computed time', async () => {
    const timer = new ManualTimerSource();
    const bucket = new TokenBucketStrategy({ ratePerSec: 10, capacity: 5, timer });
    await bucket.acquire(); // drains to 4
    expect(bucket.tryAcquire(4)).toBe(true); // empty now
    const pending = bucket.acquire(5); // needs 5 → wait 500ms
    timer.advance(600);
    timer.flush();
    await pending;
    expect(bucket.available).toBe(0);
  });

  it('acquire beyond capacity rejects immediately', async () => {
    const bucket = new TokenBucketStrategy({ ratePerSec: 1, capacity: 2 });
    await expect(bucket.acquire(5)).rejects.toBeInstanceOf(ThrottleRejectedError);
  });
});

describe('AimdStrategy', () => {
  it('grows additively on success, halves on failure', () => {
    const aimd = new AimdStrategy({ minLimit: 2, maxLimit: 20, initialLimit: 10 });
    expect(aimd.limit).toBe(10);
    aimd.onFailure();
    expect(aimd.limit).toBe(5);
    aimd.onFailure();
    expect(aimd.limit).toBe(2); // floor
    aimd.onSuccess();
    aimd.onSuccess();
    aimd.onSuccess();
    expect(aimd.limit).toBe(5);
  });

  it('converges upward logarithmically toward maxLimit', () => {
    const aimd = new AimdStrategy({ minLimit: 1, maxLimit: 100, initialLimit: 1 });
    for (let i = 0; i < 200; i++) {
      aimd.onSuccess();
    }
    expect(aimd.limit).toBe(100);
    // Failure pulls back fast.
    aimd.onFailure();
    expect(aimd.limit).toBe(50);
  });

  it('admit respects current limit; run feeds back outcome', async () => {
    const aimd = new AimdStrategy({ minLimit: 1, maxLimit: 3, initialLimit: 2 });
    expect(aimd.admit(0)).toBe(true);
    expect(aimd.admit(2)).toBe(false); // at limit
    await expect(aimd.run(0, () => Promise.reject(new Error('x')))).rejects.toThrow();
    expect(aimd.limit).toBe(1);
    expect(aimd.admit(1)).toBe(false);
    expect(aimd.admit(0)).toBe(true);
  });

  it('successesPerIncrease smooths growth', () => {
    const aimd = new AimdStrategy({ minLimit: 1, maxLimit: 10, initialLimit: 5, successesPerIncrease: 3 });
    aimd.onSuccess();
    aimd.onSuccess();
    expect(aimd.limit).toBe(5);
    aimd.onSuccess();
    expect(aimd.limit).toBe(6);
  });
});

describe('PriorityThrottleStrategy', () => {
  it('dequeues higher priority first regardless of enqueue order', async () => {
    const timer = new ManualTimerSource();
    const th = new PriorityThrottleStrategy({ maxConcurrent: 1, maxQueue: 10, timer });
    const order: string[] = [];
    const done = th.run(0, async () => {
      await tick(20); // hold the permit
    });
    await tick(2);
    const low = th.run(5, () => order.push('low'));
    const high = th.run(1, () => order.push('high'));
    const mid = th.run(3, () => order.push('mid'));
    await done;
    await Promise.all([low, high, mid]);
    expect(order).toEqual(['high', 'mid', 'low']);
  });

  it('sheds lowest-priority waiter when queue is full and higher arrives', async () => {
    const timer = new ManualTimerSource();
    const th = new PriorityThrottleStrategy({ maxConcurrent: 1, maxQueue: 2, timer });
    const hold = th.run(0, async () => {
      await tick(30);
    });
    await tick(2);
    const low = th.run(9, () => 'low-ran');
    const mid = th.run(5, () => 'mid-ran');
    await tick();
    const high = th.run(1, () => 'high-ran');
    const lowAssert = expect(low).rejects.toBeInstanceOf(ThrottleRejectedError);
    await hold;
    await expect(mid).resolves.toBe('mid-ran');
    await expect(high).resolves.toBe('high-ran');
    await lowAssert;
  });

  it('load-sheds low priorities under high utilization', async () => {
    const th = new PriorityThrottleStrategy({
      maxConcurrent: 1,
      maxQueue: 1,
      levels: { midCutoffPercent: 40, strictCutoffPercent: 80, midMaxPriority: 3, strictMaxPriority: 1 },
    });
    const hold = th.run(0, async () => tick(10));
    await tick(2);
    // inFlight=1, queue=0 → utilization 50% → mid band → priority<3 only.
    await expect(th.run(5, () => 'x')).rejects.toBeInstanceOf(ThrottleRejectedError);
    const ok = th.run(2, () => 'mid-ok'); // queues
    await hold;
    await expect(ok).resolves.toBe('mid-ok');
  });
});

describe('QueueThrottleStrategy', () => {
  it('dispatches FIFO with bounded queue and collects metrics', async () => {
    const timer = new ManualTimerSource();
    const q = new QueueThrottleStrategy({ maxConcurrent: 1, maxQueue: 2, timer });
    const order: string[] = [];
    const j1 = q.submit(async () => {
      await tick(20);
      order.push('j1');
    });
    const j2 = q.submit(() => {
      order.push('j2');
    });
    const j3 = q.submit(() => {
      order.push('j3');
    });
    // Queue full — 4th rejects.
    await expect(q.submit(() => 'never')).rejects.toBeInstanceOf(ThrottleRejectedError);
    await Promise.all([j1, j2, j3]);
    expect(order).toEqual(['j1', 'j2', 'j3']);
    const m = q.metrics();
    expect(m.rejected).toBe(1);
    expect(m.queued).toBe(2);
    expect(m.dequeued).toBe(2);
  });

  it('queued job times out instead of running', async () => {
    const timer = new ManualTimerSource();
    const q = new QueueThrottleStrategy({ maxConcurrent: 1, maxQueue: 5, timeoutMs: 100, timer });
    const slow = q.submit(async () => {
      await tick(30);
    });
    const queued = q.submit(() => 'should-not-run');
    timer.advance(200);
    timer.flush();
    await expect(queued).rejects.toBeInstanceOf(QueueTimeoutError);
    await slow;
    expect(q.metrics().timedOut).toBe(1);
  });
});

describe('CoalescingStrategy', () => {
  it('concurrent identical requests share one execution', async () => {
    const c = new CoalescingStrategy();
    let calls = 0;
    const producer = async () => {
      calls++;
      await tick(10);
      return 'result';
    };
    const [a, b, d] = await Promise.all([
      c.getOrRun('k', producer),
      c.getOrRun('k', producer),
      c.getOrRun('k', producer),
    ]);
    expect(a).toBe('result');
    expect(b).toBe('result');
    expect(d).toBe('result');
    expect(calls).toBe(1);
    expect(c.metrics().coalesced).toBe(2);
  });

  it('after settle the key re-executes', async () => {
    const c = new CoalescingStrategy();
    let calls = 0;
    const p = () => Promise.resolve(++calls);
    expect(await c.getOrRun('x', p)).toBe(1);
    expect(await c.getOrRun('x', p)).toBe(2);
  });

  it('rejection propagates to all waiters and clears the slot', async () => {
    const c = new CoalescingStrategy();
    const boom = () => Promise.reject(new Error('nope'));
    const p1 = c.getOrRun('k', boom);
    const p2 = c.getOrRun('k', boom);
    await expect(p1).rejects.toThrow('nope');
    await expect(p2).rejects.toThrow('nope');
    // Slot cleared — a new producer runs.
    expect(await c.getOrRun('k', () => Promise.resolve('ok'))).toBe('ok');
  });

  it('keyFn canonicalizes keys', async () => {
    const c = new CoalescingStrategy<{ id: number }>({ keyFn: (k) => `id-${k.id}` });
    let calls = 0;
    const p = async () => {
      calls++;
      await tick(5);
      return calls;
    };
    const r = await Promise.all([c.getOrRun({ id: 1 }, p), c.getOrRun({ id: 1 }, p)]);
    expect(r[0]).toBe(r[1]);
    expect(calls).toBe(1);
  });
});
