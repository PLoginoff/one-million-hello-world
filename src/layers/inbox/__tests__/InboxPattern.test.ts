/**
 * Inbox pattern tests — dedup, state machine, retry/backoff, parking,
 * lease recovery, retention, ordered delivery.
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { InboxEngine } from '../pattern/InboxEngine';
import { InboxStateMachine } from '../pattern/InboxStateMachine';
import { BackoffStrategy } from '../pattern/BackoffStrategy';
import {
  InboxState,
  ProcessOutcome,
  InboxRecord,
  InboxPatternError,
} from '../pattern/types';

function rec(state: InboxState, over: Partial<InboxRecord> = {}): InboxRecord {
  return {
    id: 'r1', consumer: 'c', messageId: 'm1', payload: {},
    state, attempts: 0, receivedAt: 0, ...over,
  };
}

describe('InboxStateMachine', () => {
  it('enforces legal transitions', () => {
    const r = rec(InboxState.RECEIVED);
    InboxStateMachine.acquire(r, 0, 1_000);
    expect(r.state).toBe(InboxState.PROCESSING);
    expect(r.leaseUntil).toBe(1_000);
    InboxStateMachine.complete(r, 100);
    expect(r.state).toBe(InboxState.PROCESSED);
    expect(() => InboxStateMachine.acquire(r, 0, 1_000)).toThrow(InboxPatternError);
  });

  it('PARKED can only be re-driven to RECEIVED', () => {
    const r = rec(InboxState.PARKED);
    expect(() => InboxStateMachine.complete(r, 0)).toThrow(InboxPatternError);
    InboxStateMachine.release(r);
    expect(r.state).toBe(InboxState.RECEIVED);
  });

  it('lease expiry detected', () => {
    const r = rec(InboxState.PROCESSING, { leaseUntil: 5_000 });
    expect(InboxStateMachine.leaseExpired(r, 4_999)).toBe(false);
    expect(InboxStateMachine.leaseExpired(r, 5_000)).toBe(true);
  });
});

describe('BackoffStrategy', () => {
  it('exponential delay capped, with deterministic jitter', () => {
    const b = new BackoffStrategy({ backoffBaseMs: 100, backoffFactor: 2, backoffCapMs: 1_000, jitterFraction: 0 }, () => 0.5);
    expect(b.delay(1)).toBe(100);
    expect(b.delay(2)).toBe(200);
    expect(b.delay(3)).toBe(400);
    expect(b.delay(20)).toBe(1_000); // capped
  });

  it('jitter stays inside ±fraction', () => {
    const b = new BackoffStrategy({ backoffBaseMs: 100, backoffFactor: 1, backoffCapMs: 10_000, jitterFraction: 0.5 }, () => 1.0);
    expect(b.delay(1)).toBe(150); // +50%
    const b2 = new BackoffStrategy({ backoffBaseMs: 100, backoffFactor: 1, backoffCapMs: 10_000, jitterFraction: 0.5 }, () => 0.0);
    expect(b2.delay(1)).toBe(50); // -50%
  });
});

describe('InboxEngine dedup', () => {
  let engine: InboxEngine;
  beforeEach(() => { engine = new InboxEngine(); });

  it('redelivery of same messageId is idempotent', () => {
    const a = engine.receive('c1', 'msg-1', { v: 1 });
    const b = engine.receive('c1', 'msg-1', { v: 1 });
    expect(b.duplicate).toBe(true);
    expect(b.record.id).toBe(a.record.id);
    expect(engine.size()).toBe(1);
    expect(engine.stats('c1').duplicates).toBe(1);
  });

  it('same messageId under different consumers is independent', () => {
    engine.receive('c1', 'msg-1', {});
    const r2 = engine.receive('c2', 'msg-1', {});
    expect(r2.duplicate).toBe(false);
    expect(engine.size()).toBe(2);
  });
});

describe('InboxEngine processing', () => {
  let engine: InboxEngine;
  beforeEach(() => {
    engine = new InboxEngine({ retry: { maxAttempts: 3, backoffBaseMs: 100, backoffFactor: 2, backoffCapMs: 10_000, jitterFraction: 0 } });
  });

  it('processes to completion', async () => {
    engine.receive('c', 'm1', { n: 1 });
    const seen: unknown[] = [];
    const outcome = await engine.processNext('c', (p) => { seen.push(p); });
    expect(outcome).toBe(ProcessOutcome.PROCESSED);
    expect(seen).toEqual([{ n: 1 }]);
    expect(engine.stats('c').processed).toBe(1);
  });

  it('nothing pending when empty', async () => {
    expect(await engine.processNext('c', () => {})).toBe(ProcessOutcome.NOTHING_PENDING);
  });

  it('failed handler schedules retry with backoff; succeeds on re-drive', async () => {
    let now = 1_000_000;
    const e = new InboxEngine(
      { retry: { maxAttempts: 3, backoffBaseMs: 100, backoffFactor: 2, backoffCapMs: 10_000, jitterFraction: 0 } },
      () => now
    );
    e.receive('c', 'm1', {});
    let calls = 0;
    const outcome1 = await e.processNext('c', () => { calls++; throw new Error('boom'); });
    expect(outcome1).toBe(ProcessOutcome.RETRY_SCHEDULED);
    // Retry not due yet — nothing actionable
    expect(await e.processNext('c', () => {})).toBe(ProcessOutcome.NOTHING_PENDING);
    now += 101; // backoff 100ms elapsed
    const outcome2 = await e.processNext('c', () => { calls++; });
    expect(outcome2).toBe(ProcessOutcome.PROCESSED);
    expect(calls).toBe(2);
  });

  it('parks after maxAttempts', async () => {
    let now = 0;
    const e = new InboxEngine(
      { retry: { maxAttempts: 3, backoffBaseMs: 10, backoffFactor: 2, backoffCapMs: 1_000, jitterFraction: 0 } },
      () => now
    );
    e.receive('c', 'm1', {});
    const fail = () => { throw new Error('always'); };
    expect(await e.processNext('c', fail)).toBe(ProcessOutcome.RETRY_SCHEDULED); // attempt 1
    now += 100;
    expect(await e.processNext('c', fail)).toBe(ProcessOutcome.RETRY_SCHEDULED); // attempt 2
    now += 100;
    expect(await e.processNext('c', fail)).toBe(ProcessOutcome.PARKED); // attempt 3 -> park
    const parked = e.parked('c');
    expect(parked).toHaveLength(1);
    expect(parked[0].parkedReason).toBe('always');
    expect(parked[0].attempts).toBe(3);
  });

  it('redrive returns a parked record to RECEIVED', async () => {
    let now = 0;
    const e = new InboxEngine(
      { retry: { maxAttempts: 1, backoffBaseMs: 10, backoffFactor: 2, backoffCapMs: 1_000, jitterFraction: 0 } },
      () => now
    );
    const r = e.receive('c', 'm1', {}).record;
    await e.processNext('c', () => { throw new Error('x'); });
    expect(e.get(r.id)?.state).toBe(InboxState.PARKED);
    e.redrive(r.id);
    expect(e.get(r.id)?.state).toBe(InboxState.RECEIVED);
    expect(await e.processNext('c', () => {})).toBe(ProcessOutcome.PROCESSED);
  });

  it('lease expiry releases crashed-consumer records', async () => {
    let now = 1_000;
    const e = new InboxEngine({ leaseMs: 500 }, () => now);
    e.receive('c', 'm1', {});
    // Simulate a consumer that acquires but never finishes
    const r = e.get(e.findByMessageId('c', 'm1')!.id)!;
    InboxStateMachine.acquire(r, now, 500);
    expect(r.state).toBe(InboxState.PROCESSING);
    now += 600; // lease expired
    const outcome = await e.processNext('c', () => {});
    expect(outcome).toBe(ProcessOutcome.PROCESSED); // reaped + processed
  });

  it('retention cleanup drops old PROCESSED records', async () => {
    let now = 1_000;
    const e = new InboxEngine({ retentionMs: 100 }, () => now);
    e.receive('c', 'm1', {});
    await e.processNext('c', () => {});
    now += 200;
    expect(e.cleanup()).toBe(1);
    expect(e.size()).toBe(0);
  });

  it('processAll drains a batch', async () => {
    engine.receive('c', 'a', {});
    engine.receive('c', 'b', {});
    engine.receive('c', 'c', {});
    const result = await engine.processAll('c', () => {});
    expect(result.processed).toBe(3);
  });
});

describe('InboxEngine ordered delivery', () => {
  it('defers out-of-order messages until predecessor processed', async () => {
    let now = 0;
    const e = new InboxEngine({ ordered: true }, () => now);
    // Arrive out of order: 2 then 1
    e.receive('c', 'm2', {}, 2);
    e.receive('c', 'm1', {}, 1);
    const seen: number[] = [];
    // Oldest received first = m2, but it's seq 2 and expected is 1 -> deferred
    const o1 = await e.processNext('c', (p) => { seen.push((p as { s?: number }).s ?? -1); });
    expect(o1).toBe(ProcessOutcome.DEFERRED_ORDERING);
    // Now m1 processes; its completion promotes m2
    const o2 = await e.processNext('c', () => {});
    expect(o2).toBe(ProcessOutcome.PROCESSED);
    const o3 = await e.processNext('c', () => {});
    expect(o3).toBe(ProcessOutcome.PROCESSED);
    void seen;
  });

  it('gap tolerance jumps over missing predecessor', async () => {
    let now = 0;
    const e = new InboxEngine({ ordered: true, maxSequenceGapWait: 2 }, () => now);
    e.receive('c', 'm3', {}, 3);
    e.receive('c', 'm4', {}, 4);
    // seq 1,2 never arrive. Defer both, then trigger promotion logic via a processed record
    await e.processNext('c', () => {}); // defer m3
    await e.processNext('c', () => {}); // defer m4 — now gap threshold (2) met
    // Process an unsequenced record to trigger _promoteDeferred
    e.receive('c', 'mX', {});
    const outcomes = await e.processAll('c', () => {});
    expect(outcomes.processed).toBeGreaterThanOrEqual(3);
    void now;
  });
});
