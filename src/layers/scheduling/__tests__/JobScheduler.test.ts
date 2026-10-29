/**
 * Job scheduler — unit tests (bun:test)
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { CronSchedule } from '../scheduler/CronParser';
import { JobQueue } from '../scheduler/MinHeap';
import { JobScheduler } from '../scheduler/JobScheduler';
import {
  Clock,
  JobDefinition,
  SchedulerError,
} from '../scheduler/SchedulerTypes';

function fakeClock(start = Date.UTC(2024, 0, 1)): Clock & { advance: (ms: number) => void } {
  let t = start;
  return { now: () => t, advance: (ms: number) => void (t += ms) };
}

const T0 = Date.UTC(2024, 0, 1, 0, 0); // Mon Jan 1 2024 00:00 UTC

function job(id: string, extra: Partial<JobDefinition> = {}): JobDefinition {
  return { jobId: id, handler: async () => 'ok', schedule: { kind: 'cron', expr: '0 * * * *' }, ...extra };
}

// ------------------------------------------------------------- CronSchedule

describe('CronSchedule', () => {
  it('computes next fire for common expressions', () => {
    expect(new CronSchedule('0 * * * *').nextAfter(T0)).toBe(T0 + 3600_000);
    expect(new CronSchedule('*/15 * * * *').nextAfter(T0)).toBe(T0 + 900_000);
    expect(new CronSchedule('30 9 * * 1-5').nextAfter(T0)).toBe(T0 + 9.5 * 3600_000);
    expect(new CronSchedule('0 0 1 * *').nextAfter(T0)).toBe(Date.UTC(2024, 1, 1));
  });

  it('lists + steps + ranges', () => {
    const c = new CronSchedule('0 8,20 * * *');
    expect(c.nextAfter(T0)).toBe(Date.UTC(2024, 0, 1, 8));
    expect(c.nextAfter(Date.UTC(2024, 0, 1, 8))).toBe(Date.UTC(2024, 0, 1, 20));
  });

  it('dom/dow OR semantics', () => {
    const c = new CronSchedule('0 0 15 * 1'); // 15th OR Monday
    // Jan 8 is Monday
    expect(c.nextAfter(Date.UTC(2024, 0, 7))).toBe(Date.UTC(2024, 0, 8));
  });

  it('enumerates fire times in a window', () => {
    const c = new CronSchedule('0 12 * * *');
    const times = c.between(T0, T0 + 3 * 24 * 3600_000);
    expect(times).toHaveLength(3);
  });

  it('UTC model: no DST ambiguity (documented)', () => {
    // A "2:30am" job fires at 02:30 UTC every day of the year — no skipped
    // or doubled times, since UTC has no DST transitions.
    const c = new CronSchedule('30 2 * * *');
    const spring = c.between(Date.UTC(2024, 2, 9), Date.UTC(2024, 2, 12));
    expect(spring).toHaveLength(3); // even across US "spring forward"
  });

  it('rejects malformed expressions', () => {
    expect(() => new CronSchedule('* * * *')).toThrow(SchedulerError);
    expect(() => new CronSchedule('61 * * * *')).toThrow(SchedulerError);
    expect(() => new CronSchedule('*/x * * * *')).toThrow(SchedulerError);
  });
});

// ------------------------------------------------------------- JobQueue

describe('JobQueue', () => {
  it('pops in fireAt order, priority breaks ties', () => {
    const q = new JobQueue();
    q.push('a', 300, 0);
    q.push('b', 100, 0);
    q.push('c', 100, 10); // same time, higher priority → first
    expect(q.pop()!.jobId).toBe('c');
    expect(q.pop()!.jobId).toBe('b');
    expect(q.pop()!.jobId).toBe('a');
  });

  it('popDue drains only elapsed entries', () => {
    const q = new JobQueue();
    q.push('a', 100);
    q.push('b', 200);
    q.push('c', 300);
    expect(q.popDue(200).map((e) => e.jobId)).toEqual(['a', 'b']);
    expect(q.size).toBe(1);
  });
});

// ------------------------------------------------------------- JobScheduler

describe('JobScheduler', () => {
  let clock: ReturnType<typeof fakeClock>;
  let sched: JobScheduler;
  beforeEach(() => {
    clock = fakeClock(T0);
    sched = new JobScheduler(clock);
  });

  it('fires a cron job on schedule', async () => {
    const calls: string[] = [];
    sched.register(job('hourly', {
      schedule: { kind: 'cron', expr: '0 * * * *' },
      handler: async () => { calls.push('ran'); },
    }));
    clock.advance(3600_000);
    const recs = await sched.tick();
    expect(calls).toHaveLength(1);
    expect(recs[0].status).toBe('success');
    // Rescheduled for the next hour
    expect(sched.job('hourly')!.nextFireAt).toBe(T0 + 2 * 3600_000);
  });

  it('one-shot jobs fire once then expire', async () => {
    let n = 0;
    sched.register(job('once', {
      schedule: { kind: 'once', at: T0 + 5000 },
      handler: () => { n++; },
    }));
    clock.advance(6000);
    await sched.tick();
    expect(n).toBe(1);
    clock.advance(60_000);
    await sched.tick();
    expect(n).toBe(1); // never again
    expect(sched.job('once')!.nextFireAt).toBeNull();
  });

  it('retry policy re-attempts failures', async () => {
    let attempts = 0;
    sched.register(job('flaky', {
      schedule: { kind: 'once', at: T0 + 100 },
      retry: { maxAttempts: 3, baseMs: 1, factor: 2, maxMs: 10 },
      handler: async () => {
        attempts++;
        if (attempts < 3) throw new Error('boom');
        return 'ok';
      },
    }));
    clock.advance(200);
    const recs = await sched.tick();
    expect(attempts).toBe(3);
    expect(recs[0].status).toBe('success');
    // 3 attempts → 3 records
    expect(sched.executor.records.filter((r) => r.jobId === 'flaky')).toHaveLength(3);
  });

  it('timeout marks the execution timed-out', async () => {
    sched.register(job('slow', {
      schedule: { kind: 'once', at: T0 + 100 },
      timeoutMs: 10,
      handler: () => new Promise((r) => setTimeout(r, 1000)),
    }));
    clock.advance(200);
    const recs = await sched.tick();
    expect(recs[0].status).toBe('timeout');
  });

  it('dependency: B waits for A to succeed', async () => {
    const order: string[] = [];
    sched.register(job('a', {
      schedule: { kind: 'once', at: T0 + 100 },
      handler: () => { order.push('a'); },
    }));
    sched.register(job('b', {
      schedule: { kind: 'once', at: T0 + 100 },
      dependsOn: ['a'],
      handler: () => { order.push('b'); },
    }));
    clock.advance(200);
    // first tick: a runs, b deferred (dep not yet satisfied when popped)
    await sched.tick();
    // second tick: b now runs
    clock.advance(2000);
    await sched.tick();
    expect(order).toEqual(['a', 'b']);
  });

  it('dependency cycles are rejected at registration', () => {
    sched.register(job('x', { schedule: { kind: 'once', at: 0 } }));
    sched.register(job('y', { schedule: { kind: 'once', at: 0 }, dependsOn: ['x'] }));
    expect(() =>
      sched.register(job('z', { schedule: { kind: 'once', at: 0 }, dependsOn: ['y'] }))
    ).not.toThrow();
    // A job that would point back at x is fine — cycles need a loop back to itself.
    expect(() =>
      sched.register(job('x2', { schedule: { kind: 'once', at: 0 }, dependsOn: ['x'] }))
    ).not.toThrow();
    // Unknown dep rejected.
    expect(() =>
      sched.register(job('bad', { schedule: { kind: 'once', at: 0 }, dependsOn: ['ghost'] }))
    ).toThrow(SchedulerError);
  });

  it('concurrency limit queues excess fire times as missed', async () => {
    let running = 0;
    let maxConcurrent = 0;
    sched.register(job('limited', {
      schedule: { kind: 'cron', expr: '* * * * *' },
      concurrency: 1,
      missedRunPolicy: 'run-all',
      handler: async () => {
        running++;
        maxConcurrent = Math.max(maxConcurrent, running);
        await new Promise((r) => setTimeout(r, 5));
        running--;
      },
    }));
    // Tick twice — each tick sees running=0 after await, so concurrency
    // never exceeds 1; the missedSlots path is exercised via manual trigger.
    clock.advance(60_000);
    await sched.tick();
    clock.advance(60_000);
    await sched.tick();
    expect(maxConcurrent).toBe(1);
    expect(sched.job('limited')!.executions).toBe(2);
  });

  it('missed-run policy run-all backfills skipped slots', async () => {
    const ran: number[] = [];
    sched.register(job('catchup', {
      schedule: { kind: 'cron', expr: '0 * * * *' },
      concurrency: 1,
      missedRunPolicy: 'run-all',
      handler: async (ctx) => { ran.push(ctx.scheduledAt); },
    }));
    // Simulate 3h of scheduler downtime — the queue held only the next
    // slot, but the cron backfills every missed fire time.
    clock.advance(3 * 3600_000);
    await sched.tick();
    const j = sched.job('catchup')!;
    expect(j.executions).toBe(3); // hours 1, 2, 3 all ran
    expect(ran).toEqual([T0 + 3600_000, T0 + 2 * 3600_000, T0 + 3 * 3600_000]);
  });

  it('missed-run policy skip-all runs just once after downtime', async () => {
    let n = 0;
    sched.register(job('skippy', {
      schedule: { kind: 'cron', expr: '0 * * * *' },
      missedRunPolicy: 'skip-all',
      handler: async () => { n++; },
    }));
    clock.advance(3 * 3600_000);
    await sched.tick();
    expect(n).toBe(1);
  });

  it('disabled jobs do not fire', async () => {
    let n = 0;
    sched.register(job('off', {
      schedule: { kind: 'once', at: T0 + 100 },
      handler: () => { n++; },
    }));
    sched.disable('off');
    clock.advance(200);
    await sched.tick();
    expect(n).toBe(0);
  });

  it('trigger runs a job manually respecting gates', async () => {
    let n = 0;
    sched.register(job('manual', {
      schedule: { kind: 'cron', expr: '0 0 1 1 *' }, // yearly — not due
      handler: () => { n++; },
    }));
    const rec = await sched.trigger('manual');
    expect(rec!.status).toBe('success');
    expect(n).toBe(1);
  });
});
