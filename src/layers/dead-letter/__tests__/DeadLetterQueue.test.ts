/**
 * Dead-Letter Queue Manager Tests
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import {
  DeadLetterQueue,
  computeBackoff,
  isPoisonMessage,
  failFastOnErrorClass,
  alwaysRetryOn,
  type WorkItem,
  type RetryPolicy,
} from '../implementations/DeadLetterQueue';

let n = 0;
function item<T>(payload: T, queue = 'q'): WorkItem<T> {
  return { id: `i-${n++}`, queue, payload, headers: {}, priorFailures: [] };
}

const failHandler = <T>(msg: string) => (_i: WorkItem<T>): Promise<void> => {
  return Promise.reject(new Error(msg));
};

class TransientError extends Error {
  constructor(m: string) {
    super(m);
    this.name = 'TransientError';
  }
}

class PermanentError extends Error {
  constructor(m: string) {
    super(m);
    this.name = 'PermanentError';
  }
}

describe('computeBackoff', () => {
  const base: RetryPolicy = { maxRetries: 5, baseDelayMs: 100, multiplier: 2, jitter: 'none' };

  it('grows exponentially without jitter', () => {
    expect(computeBackoff(1, base)).toBe(100);
    expect(computeBackoff(2, base)).toBe(200);
    expect(computeBackoff(3, base)).toBe(400);
  });

  it('caps at maxDelayMs', () => {
    const p: RetryPolicy = { ...base, maxDelayMs: 250 };
    expect(computeBackoff(5, p)).toBe(250);
  });

  it('full jitter stays within [0, exponential]', () => {
    const p: RetryPolicy = { ...base, jitter: 'full', random: () => 0.5 };
    expect(computeBackoff(3, p)).toBe(200); // 0.5 * 400
    const p2: RetryPolicy = { ...base, jitter: 'full', random: () => 0 };
    expect(computeBackoff(3, p2)).toBe(0);
  });

  it('equal jitter is [exp/2, exp]', () => {
    const p: RetryPolicy = { ...base, jitter: 'equal', random: () => 0 };
    expect(computeBackoff(2, p)).toBe(100); // 200/2
    const p2: RetryPolicy = { ...base, jitter: 'equal', random: () => 1 };
    expect(computeBackoff(2, p2)).toBe(200);
  });

  it('decorrelated jitter uses previous delay', () => {
    const p: RetryPolicy = { ...base, jitter: 'decorrelated', random: () => 1 };
    // random=1 → base + 1*(prev*3 - base) = prev*3
    expect(computeBackoff(2, p, 150)).toBe(Math.min(Number.MAX_SAFE_INTEGER, 450));
  });
});

describe('isPoisonMessage', () => {
  const failures = (classes: string[]) =>
    classes.map((c, i) => ({ at: i, error: `e${i}`, errorClass: c }));

  it('detects via total failure count', () => {
    expect(
      isPoisonMessage(failures(['A', 'B', 'C']), {
        enabled: true,
        totalFailuresThreshold: 3,
      })
    ).toBe(true);
    expect(
      isPoisonMessage(failures(['A', 'B']), { enabled: true, totalFailuresThreshold: 3 })
    ).toBe(false);
  });

  it('detects via distinct error classes', () => {
    expect(
      isPoisonMessage(failures(['A', 'B', 'A']), {
        enabled: true,
        distinctErrorClassesThreshold: 2,
      })
    ).toBe(true);
    expect(
      isPoisonMessage(failures(['A', 'A']), {
        enabled: true,
        distinctErrorClassesThreshold: 2,
      })
    ).toBe(false);
  });

  it('detects via error message pattern', () => {
    expect(
      isPoisonMessage([{ at: 0, error: 'FATAL: corrupt payload' }], {
        enabled: true,
        errorMessagePattern: 'corrupt|fatal',
      })
    ).toBe(true);
  });

  it('disabled config never flags poison', () => {
    expect(
      isPoisonMessage(failures(['A', 'B', 'C', 'D']), { enabled: false, totalFailuresThreshold: 1 })
    ).toBe(false);
  });
});

describe('DeadLetterQueue', () => {
  let dlq: DeadLetterQueue<number>;

  beforeEach(() => {
    n = 0;
    dlq = new DeadLetterQueue<number>({
      retryPolicy: {
        maxRetries: 2,
        baseDelayMs: 100,
        multiplier: 2,
        jitter: 'none',
      },
    });
  });

  it('processes successfully on first try', async () => {
    const result = await dlq.process(item(5), async () => {});
    expect(result).toBe('processed');
    expect(dlq.depth).toBe(0);
    expect(dlq.pendingRetryCount).toBe(0);
  });

  it('schedules retries with backoff then dead-letters after maxRetries', async () => {
    // maxRetries=2 → attempt1 fails→retry(100ms), attempt2 fails→retry(200ms), attempt3 fails→DLQ
    const r1 = await dlq.process(item(1), failHandler('x'), 0);
    expect(r1).toBe('retry-scheduled');
    expect(dlq.pendingRetryCount).toBe(1);

    // Not yet due at t=50
    expect(await dlq.processRetries(failHandler('x'), 50)).toHaveLength(0);
    // Due at t=100 → attempt2 fails → reschedule (delay 200)
    expect(await dlq.processRetries(failHandler('x'), 100)).toHaveLength(1);
    // attempt3 at t=300 → dead-lettered
    const third = await dlq.processRetries(failHandler('x'), 300);
    expect(third).toHaveLength(1);
    expect(dlq.depth).toBe(1);
    expect(dlq.browse()[0].reason).toBe('max-retries');
    expect(dlq.browse()[0].failures).toHaveLength(3);
  });

  it('retry succeeds before maxRetries → no DLQ entry', async () => {
    let calls = 0;
    const flaky = async (_i: WorkItem<number>) => {
      calls++;
      if (calls < 2) throw new Error('once');
    };
    await dlq.process(item(9), flaky, 0);
    await dlq.processRetries(flaky, 1000);
    expect(dlq.depth).toBe(0);
    expect(calls).toBe(2);
  });

  it('fail-fast rule dead-letters immediately on matching error class', async () => {
    const q = new DeadLetterQueue<number>({
      retryPolicy: { maxRetries: 5, baseDelayMs: 10, jitter: 'none' },
      rules: [failFastOnErrorClass('PermanentError')],
    });
    const res = await q.process(
      item(1),
      async () => {
        throw new PermanentError('bad input');
      },
      0
    );
    expect(res).toBe('dead-lettered');
    expect(q.depth).toBe(1);
    expect(q.browse()[0].reason).toBe('rule');
    expect(q.pendingRetryCount).toBe(0);
  });

  it('always-retry rule retries past the default maxRetries', async () => {
    const q = new DeadLetterQueue<number>({
      retryPolicy: { maxRetries: 0, baseDelayMs: 10, jitter: 'none' },
      rules: [
        alwaysRetryOn('TransientError', { maxRetries: 10, baseDelayMs: 5, jitter: 'none' }),
      ],
    });
    const res = await q.process(
      item(1),
      async () => {
        throw new TransientError('net blip');
      },
      0
    );
    expect(res).toBe('retry-scheduled');
  });

  it('poison detection dead-letters on distinct error classes', async () => {
    const q = new DeadLetterQueue<number>({
      retryPolicy: { maxRetries: 10, baseDelayMs: 1, jitter: 'none' },
      poisonDetection: { enabled: true, distinctErrorClassesThreshold: 2 },
    });
    let step = 0;
    const handler = async (_i: WorkItem<number>) => {
      step++;
      if (step === 1) throw new TransientError('t');
      throw new PermanentError('p');
    };
    await q.process(item(1), handler, 0);
    // retry fires at t>=1; second failure is a different class → poison
    await q.processRetries(handler, 100);
    expect(q.depth).toBe(1);
    expect(q.browse()[0].reason).toBe('poison');
  });

  it('browse filters by queue/reason without dequeuing', async () => {
    for (let i = 0; i < 3; i++) {
      await dlq.recordFailure(item(i, 'alpha'), { message: 'e' }, 0);
      await dlq.recordFailure(item(i, 'beta'), { message: 'e' }, 0);
    }
    // maxRetries=2 so single failure doesn't DLQ; force by using recordFailure thrice
    const q2 = new DeadLetterQueue<number>({ retryPolicy: { maxRetries: 0, baseDelayMs: 1 } });
    await q2.recordFailure(item(1, 'alpha'), { message: 'a' }, 10);
    await q2.recordFailure(item(2, 'beta'), { message: 'b' }, 20);
    await q2.recordFailure(item(3, 'alpha'), { message: 'c' }, 30);
    expect(q2.browse({ sourceQueue: 'alpha' })).toHaveLength(2);
    expect(q2.browse({ deadLetteredAfter: 15 })).toHaveLength(2);
    expect(q2.browse({ limit: 1 })).toHaveLength(1);
    expect(q2.depth).toBe(3); // browse doesn't remove
  });

  it('replayOne succeeds → record removed and headers stamped', async () => {
    const q2 = new DeadLetterQueue<number>({ retryPolicy: { maxRetries: 0, baseDelayMs: 1 } });
    const bad = item(42, 'src');
    await q2.recordFailure(bad, { message: 'x' }, 100);
    const rec = q2.browse()[0];
    let seen: WorkItem<number> | undefined;
    const res = await q2.replayOne(rec.id, async (w) => {
      seen = w;
    }, 200);
    expect(res.ok).toBe(true);
    expect(q2.depth).toBe(0);
    expect(seen?.headers['x-dlq-replayed']).toBe('true');
    expect(seen?.headers['x-dlq-original-dead-lettered-at']).toBe('100');
    expect(seen?.queue).toBe('src');
  });

  it('replayOne failure keeps record and appends failure', async () => {
    const q2 = new DeadLetterQueue<number>({ retryPolicy: { maxRetries: 0, baseDelayMs: 1 } });
    await q2.recordFailure(item(1), { message: 'orig' }, 0);
    const rec = q2.browse()[0];
    const res = await q2.replayOne(rec.id, failHandler('still bad'), 10);
    expect(res.ok).toBe(false);
    expect(q2.depth).toBe(1);
    expect(q2.browse()[0].failures).toHaveLength(2);
    expect(q2.browse()[0].failures[1].error).toContain('replay');
  });

  it('replayBatch processes all matching records independently', async () => {
    const q2 = new DeadLetterQueue<number>({ retryPolicy: { maxRetries: 0, baseDelayMs: 1 } });
    for (let i = 0; i < 5; i++) await q2.recordFailure(item(i), { message: 'x' }, 0);
    let attempts = 0;
    const res = await q2.replayBatch(async (w) => {
      attempts++;
      if ((w.payload as number) % 2 === 0) throw new Error('even fails');
    });
    expect(res.replayed).toBe(5);
    expect(res.succeeded).toBe(2); // payloads 1,3
    expect(res.failed).toBe(3);
    expect(res.errors).toHaveLength(3);
    expect(q2.depth).toBe(3);
  });

  it('TTL purge removes old records', async () => {
    const q2 = new DeadLetterQueue<number>({
      retryPolicy: { maxRetries: 0, baseDelayMs: 1 },
      recordTtlMs: 100,
    });
    await q2.recordFailure(item(1), { message: 'a' }, 1000);
    await q2.recordFailure(item(2), { message: 'b' }, 1050);
    expect(q2.depth).toBe(2);
    // at t=1101: cutoff = 1001; record@1000 purged, record@1050 kept
    const removed = q2.enforcePurge(1101);
    expect(removed).toBe(1);
    expect(q2.depth).toBe(1);
    expect(q2.browse()[0].payload).toBe(2);
  });

  it('maxRecords evicts oldest on insert', async () => {
    const q2 = new DeadLetterQueue<number>({
      retryPolicy: { maxRetries: 0, baseDelayMs: 1 },
      maxRecords: 3,
    });
    for (let i = 0; i < 5; i++) await q2.recordFailure(item(i), { message: 'x' }, i);
    expect(q2.depth).toBe(3);
    const payloads = q2.browse().map((r) => r.payload);
    expect(payloads).toEqual([2, 3, 4]); // oldest two evicted
  });

  it('alert hooks fire on threshold crossing (up and down)', async () => {
    const q2 = new DeadLetterQueue<number>({
      retryPolicy: { maxRetries: 0, baseDelayMs: 1 },
      alertThresholds: [{ depth: 2, name: 'warn' }, { depth: 4, name: 'crit' }],
    });
    const events: Array<{ name?: string; depth: number; crossed: string }> = [];
    q2.onAlert((e) => events.push({ name: e.threshold.name, depth: e.currentDepth, crossed: e.crossed }));

    await q2.recordFailure(item(1), { message: 'x' }); // depth 1
    expect(events).toHaveLength(0);
    await q2.recordFailure(item(2), { message: 'x' }); // depth 2 → warn
    await q2.recordFailure(item(3), { message: 'x' }); // depth 3
    await q2.recordFailure(item(4), { message: 'x' }); // depth 4 → crit
    expect(events.map((e) => e.name)).toEqual(['warn', 'crit']);
    expect(events.every((e) => e.crossed === 'up')).toBe(true);

    // Replay 3 out → depth 1 → both fire 'down'
    await q2.replayBatch(async () => {}, { limit: 3 });
    const downs = events.filter((e) => e.crossed === 'down');
    expect(downs).toHaveLength(2);
  });

  it('stats aggregate by reason and queue', async () => {
    const q2 = new DeadLetterQueue<number>({ retryPolicy: { maxRetries: 0, baseDelayMs: 1 } });
    await q2.recordFailure(item(1, 'a'), { message: 'x' });
    await q2.recordFailure(item(2, 'a'), { message: 'x' });
    await q2.recordFailure(item(3, 'b'), { message: 'x' });
    const s = q2.stats();
    expect(s.depth).toBe(3);
    expect(s.bySourceQueue).toEqual({ a: 2, b: 1 });
    expect(s.byReason).toEqual({ 'max-retries': 3 });
  });
});
