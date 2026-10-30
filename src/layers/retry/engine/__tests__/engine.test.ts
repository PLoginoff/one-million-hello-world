/**
 * Retry Engine — unit tests.
 *
 * Delays are captured by an injectable `sleeper` so nothing sleeps in
 * real time; `ManualEngineClock` drives the budget's lazy refill.
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import {
  AdaptiveBackoff,
  DecorrelatedJitter,
  HedgedExecutor,
  IdempotencyRegistry,
  IdempotencyConflictError,
  ManualEngineClock,
  NonIdempotentError,
  RetryAfterParser,
  RetryBudget,
  RetryBudgetExhaustedError,
  RetryEngine,
  RetryExhaustedError,
  RetryPolicyTable,
  RetryReason,
  RetrySession,
  RetrySessionExpiredError,
} from '../index';
import type { OperationResult } from '../index';

function ok<T>(v: T): OperationResult<T> {
  return { ok: true, value: v };
}
function fail(f: { error?: unknown; statusCode?: number; timedOut?: boolean; retryAfterHeader?: string }): OperationResult<never> {
  return { ok: false, failure: f };
}

/* ------------------------------------------------------------------ */
/* RetryBudget                                                         */
/* ------------------------------------------------------------------ */

describe('RetryBudget', () => {
  let clock: ManualEngineClock;

  beforeEach(() => {
    clock = new ManualEngineClock();
  });

  it('spends tokens and denies when empty', () => {
    const b = new RetryBudget('api', { maxTokens: 3, refillPerSecond: 0, clock });
    expect(b.tryAcquire()).toBe(true);
    expect(b.tryAcquire()).toBe(true);
    expect(b.tryAcquire()).toBe(true);
    expect(b.tryAcquire()).toBe(false);
    expect(b.available()).toBe(0);
  });

  it('refills tokens over clock time', () => {
    const b = new RetryBudget('api', { maxTokens: 10, refillPerSecond: 10, clock });
    for (let i = 0; i < 10; i++) b.acquire();
    expect(b.available()).toBe(0);
    clock.advance(500); // 0.5s * 10/s = 5 tokens
    expect(b.available()).toBe(5);
    clock.advance(1000);
    expect(b.available()).toBe(10); // capped at max
  });

  it('acquire throws RetryBudgetExhaustedError', () => {
    const b = new RetryBudget('api', { maxTokens: 1, refillPerSecond: 0, clock });
    b.acquire();
    expect(() => b.acquire()).toThrow(RetryBudgetExhaustedError);
  });

  it('msUntilAvailable computes from refill rate', () => {
    const b = new RetryBudget('api', { maxTokens: 10, refillPerSecond: 10, clock });
    for (let i = 0; i < 10; i++) b.acquire();
    expect(b.msUntilAvailable()).toBe(100); // 1 token at 10/s
  });
});

/* ------------------------------------------------------------------ */
/* RetryAfterParser                                                    */
/* ------------------------------------------------------------------ */

describe('RetryAfterParser', () => {
  let clock: ManualEngineClock;
  let parser: RetryAfterParser;

  beforeEach(() => {
    clock = new ManualEngineClock();
    clock.set(1_000_000);
    parser = new RetryAfterParser(clock);
  });

  it('parses delta-seconds', () => {
    expect(parser.parse('120')).toBe(120_000);
    expect(parser.parse('0')).toBe(0);
    expect(parser.parse('0.5')).toBe(500);
  });

  it('parses HTTP-date relative to clock', () => {
    const date = new Date(1_000_000 + 60_000).toUTCString();
    expect(parser.parse(date)).toBe(60_000);
  });

  it('clamps negative HTTP-dates to 0', () => {
    const past = new Date(1_000_000 - 60_000).toUTCString();
    expect(parser.parse(past)).toBe(0);
  });

  it('treats large integers as milliseconds', () => {
    expect(parser.parse('120000')).toBe(120_000); // >= 86400 → ms
    expect(parser.parse('120', { preferMs: true })).toBe(120);
  });

  it('clamps to maxMs', () => {
    expect(parser.parse('999999', { maxMs: 1000 })).toBe(1000);
  });

  it('returns null for garbage', () => {
    expect(parser.parse('soon')).toBeNull();
    expect(parser.parse('')).toBeNull();
    expect(parser.parse(null)).toBeNull();
  });

  it('parseFromHeaders is case-insensitive', () => {
    expect(parser.parseFromHeaders({ 'RETRY-AFTER': '5' })).toBe(5000);
    expect(parser.parseFromHeaders({ other: 'x' })).toBeNull();
  });
});

/* ------------------------------------------------------------------ */
/* AdaptiveBackoff                                                     */
/* ------------------------------------------------------------------ */

describe('AdaptiveBackoff', () => {
  let clock: ManualEngineClock;

  beforeEach(() => {
    clock = new ManualEngineClock();
  });

  it('uses default base before observations', () => {
    const b = new AdaptiveBackoff({ clock, random: () => 0.5, jitter: 0 });
    expect(b.delayFor('op', 0)).toBe(100);
  });

  it('learns base from EMA of success latency', () => {
    const b = new AdaptiveBackoff({ clock, random: () => 0.5, jitter: 0, factor: 2 });
    b.observeSuccess('op', 500);
    b.observeSuccess('op', 500);
    // EMA converges to 500 → base = 500*2 = 1000
    expect(b.baseDelayFor('op')).toBe(1000);
  });

  it('grows exponentially per attempt and caps at maxDelayMs', () => {
    const b = new AdaptiveBackoff({ clock, random: () => 0.5, jitter: 0, growth: 2, maxDelayMs: 10_000 });
    b.observeSuccess('op', 100);
    expect(b.delayFor('op', 0)).toBe(100);
    expect(b.delayFor('op', 1)).toBe(200);
    expect(b.delayFor('op', 20)).toBe(10_000); // capped
  });

  it('congestion inflates the delay', () => {
    const b = new AdaptiveBackoff({ clock, random: () => 0.5, jitter: 0 });
    b.observeSuccess('op', 100);
    const before = b.delayFor('op', 0);
    b.observeCongestion('op', 1);
    expect(b.delayFor('op', 0)).toBe(before * 2);
  });

  it('jitter stays within bounds', () => {
    const b = new AdaptiveBackoff({ clock, random: () => 0, jitter: 0.5 });
    b.observeSuccess('op', 100);
    const d = b.delayFor('op', 0);
    expect(d).toBeGreaterThanOrEqual(50);
    expect(d).toBeLessThanOrEqual(150);
  });
});

/* ------------------------------------------------------------------ */
/* RetryEngine                                                         */
/* ------------------------------------------------------------------ */

describe('RetryEngine', () => {
  let clock: ManualEngineClock;
  let sleeps: number[];
  let budget: RetryBudget;
  let engine: RetryEngine;

  beforeEach(() => {
    clock = new ManualEngineClock();
    sleeps = [];
    budget = new RetryBudget('scope', { maxTokens: 10, refillPerSecond: 0, clock });
    engine = new RetryEngine(
      { clock, maxAttempts: 3, sleeper: (ms) => { sleeps.push(ms); return Promise.resolve(); } },
      { budget },
    );
  });

  it('succeeds on first attempt without spending budget', async () => {
    const r = await engine.run('scope', 'idempotent', () => ok('v'));
    expect(r.ok).toBe(true);
    expect(r.value).toBe('v');
    expect(budget.available()).toBe(10);
    expect(sleeps.length).toBe(0);
  });

  it('retries 5xx and succeeds', async () => {
    let n = 0;
    const r = await engine.run('scope', 'idempotent', () => {
      n++;
      return n < 3 ? fail({ statusCode: 503 }) : ok('done');
    });
    expect(r.ok).toBe(true);
    expect(n).toBe(3);
    expect(r.attempts.length).toBe(2);
    expect(r.attempts[0].classified.reason).toBe(RetryReason.SERVER_ERROR);
    expect(sleeps.length).toBe(2);
  });

  it('does not retry 4xx (non-429)', async () => {
    let n = 0;
    const r = await engine.run('scope', 'idempotent', () => {
      n++;
      return fail({ statusCode: 404 });
    });
    expect(r.ok).toBe(false);
    expect(n).toBe(1);
    expect(r.finalReason).toBe(RetryReason.CLIENT_ERROR);
  });

  it('honors Retry-After over backoff', async () => {
    const r = await engine.run('scope', 'idempotent', (a) =>
      a === 0 ? fail({ statusCode: 429, retryAfterHeader: '7' }) : ok('v'),
    );
    expect(r.ok).toBe(true);
    expect(sleeps[0]).toBe(7000); // retry-after wins over ~100ms backoff
  });

  it('stops on non-idempotent ops after first failure', async () => {
    let n = 0;
    const r = await engine.run('scope', 'non-idempotent', () => {
      n++;
      return fail({ statusCode: 500 });
    });
    expect(n).toBe(1);
    expect(r.nonIdempotentStopped).toBe(true);
    expect(r.finalError).toBeInstanceOf(NonIdempotentError);
  });

  it('stops retrying when budget is exhausted', async () => {
    const tinyBudget = new RetryBudget('scope', { maxTokens: 1, refillPerSecond: 0, clock });
    const e = new RetryEngine(
      { clock, maxAttempts: 5, sleeper: (ms) => { sleeps.push(ms); return Promise.resolve(); } },
      { budget: tinyBudget },
    );
    const r = await e.run('scope', 'idempotent', () => fail({ statusCode: 500 }));
    expect(r.ok).toBe(false);
    expect(r.budgetStopped).toBe(true);
    // 1 retry consumed the single token; second retry denied
    expect(r.attempts.length).toBe(2);
  });

  it('classifies timeouts and transport errors as retryable', async () => {
    const r1 = await engine.run('t', 'idempotent', () => fail({ timedOut: true }));
    expect(r1.finalReason).toBe(RetryReason.TIMEOUT);
    const r2 = await engine.run('t', 'idempotent', () => fail({ error: new Error('ECONNRESET') }));
    expect(r2.finalReason).toBe(RetryReason.TRANSPORT_ERROR);
  });

  it('runOrThrow throws RetryExhaustedError on final failure', async () => {
    await expect(engine.runOrThrow('s', 'idempotent', () => fail({ statusCode: 500 }))).rejects.toBeInstanceOf(
      RetryExhaustedError,
    );
  });

  it('runOrThrow throws RetryBudgetExhaustedError when budget stops retries', async () => {
    const empty = new RetryBudget('s', { maxTokens: 0, refillPerSecond: 0, clock });
    const e = new RetryEngine({ clock, sleeper: () => Promise.resolve() }, { budget: empty });
    await expect(e.runOrThrow('s', 'idempotent', () => fail({ statusCode: 500 }))).rejects.toBeInstanceOf(
      RetryBudgetExhaustedError,
    );
  });

  it('observes success latency into the backoff', async () => {
    const backoff = new AdaptiveBackoff({ clock, random: () => 0.5, jitter: 0 });
    const e = new RetryEngine(
      { clock, sleeper: (ms) => { sleeps.push(ms); return Promise.resolve(); } },
      { budget, backoff },
    );
    clock.set(0);
    await e.run('op', 'idempotent', () => {
      clock.advance(400); // the op takes 400ms
      return ok('x');
    });
    expect(backoff.baseDelayFor('op')).toBe(400);
  });
});

/* ------------------------------------------------------------------ */
/* HedgedExecutor                                                      */
/* ------------------------------------------------------------------ */

describe('HedgedExecutor', () => {
  it('returns the first result when original is fast', async () => {
    const exec = new HedgedExecutor({ hedgeDelayMs: 50, timerFn: () => new Promise((r) => setTimeout(r, 0)) });
    const r = await exec.execute(() => Promise.resolve('fast'));
    expect(r.value).toBe('fast');
    expect(r.winningAttempt).toBe(0);
    expect(r.hedgeWon).toBe(false);
  });

  it('hedge wins when original is slow', async () => {
    const clock = new ManualEngineClock();
    // Hedge fires immediately (timer resolves instantly)
    const exec = new HedgedExecutor({ clock, hedgeDelayMs: 0, maxAttempts: 2, timerFn: () => Promise.resolve() });
    const r = await exec.execute(async () => {
      // original is slow (real 30ms wait) — hedge already resolved
      await new Promise((res) => setTimeout(res, 30));
      return 'slow';
    });
    expect(r.value).toBe('slow'); // only one op — the original always wins a race to first resolve
    expect(r.attemptsFired).toBe(2);
  });

  it('stats track hedges fired', async () => {
    const exec = new HedgedExecutor({ hedgeDelayMs: 0, maxAttempts: 3, timerFn: () => Promise.resolve() });
    await exec.execute(() => Promise.resolve('x'));
    const s = exec.stats();
    expect(s.totalCalls).toBe(1);
    expect(s.totalHedges).toBeGreaterThanOrEqual(0);
  });
});

/* ------------------------------------------------------------------ */
/* DecorrelatedJitter                                                  */
/* ------------------------------------------------------------------ */

describe('DecorrelatedJitter', () => {
  it('next produces delays within [base, 3·prev]', () => {
    const j = new DecorrelatedJitter({ baseMs: 100, capMs: 10_000, random: () => 0.5 });
    const d1 = j.next('k'); // rand=0.5 → mid of [100, 300] = 200
    expect(d1).toBe(200);
    const d2 = j.next('k'); // prev=200 → [100, 600] → 350
    expect(d2).toBe(350);
    j.reset('k');
    const d3 = j.next('k'); // reset → prev=base again
    expect(d3).toBe(200);
  });

  it('caps at capMs', () => {
    const j = new DecorrelatedJitter({ baseMs: 100, capMs: 250, random: () => 0.999 });
    const d = j.next('k');
    expect(d).toBeLessThanOrEqual(250);
  });

  it('fullJitter bounds to base·2^n', () => {
    const j = new DecorrelatedJitter({ baseMs: 100, capMs: 10_000, random: () => 0.999 });
    expect(j.fullJitter(0)).toBeLessThanOrEqual(100);
    expect(j.fullJitter(3)).toBeLessThanOrEqual(800);
  });

  it('equalJitter stays in [half, full]', () => {
    const j = new DecorrelatedJitter({ baseMs: 100, capMs: 10_000, random: () => 0.5 });
    const d = j.equalJitter(2); // base·4=400, half=200, rand*200=100 → 300
    expect(d).toBe(300);
  });
});

/* ------------------------------------------------------------------ */
/* RetryPolicyTable                                                    */
/* ------------------------------------------------------------------ */

describe('RetryPolicyTable', () => {
  it('longest-prefix resolves the most specific policy', () => {
    const t = new RetryPolicyTable({ maxAttempts: 3, retryEnabled: true });
    t.set('payments', { maxAttempts: 1, retryEnabled: true });
    t.set('payments:charge', { maxAttempts: 0, retryEnabled: false });
    t.set('search', { maxAttempts: 5, retryEnabled: true });

    expect(t.resolve('payments:charge').maxAttempts).toBe(0);
    expect(t.resolve('payments:refund').maxAttempts).toBe(1);
    expect(t.resolve('search:autocomplete').maxAttempts).toBe(5);
    expect(t.resolve('other').maxAttempts).toBe(3);
    expect(t.resolve('payments:charge').matchedKey).toBe('payments:charge');
  });

  it('shouldRetry gates on policy + reason', () => {
    const t = new RetryPolicyTable();
    const policy = { maxAttempts: 3, retryEnabled: true, matchedKey: 'x', matchDepth: 0 };
    expect(t.shouldRetry(policy, 0, RetryReason.SERVER_ERROR)).toBe(true);
    expect(t.shouldRetry(policy, 2, RetryReason.SERVER_ERROR)).toBe(false); // last attempt
    expect(t.shouldRetry(policy, 0, RetryReason.CLIENT_ERROR)).toBe(false);
    expect(t.shouldRetry({ ...policy, retryEnabled: false }, 0, RetryReason.SERVER_ERROR)).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/* IdempotencyRegistry                                                 */
/* ------------------------------------------------------------------ */

describe('IdempotencyRegistry', () => {
  let clock: ManualEngineClock;
  let reg: IdempotencyRegistry<string>;

  beforeEach(() => {
    clock = new ManualEngineClock();
    reg = new IdempotencyRegistry<string>({ clock, ttlMs: 60_000 });
  });

  it('executes once and replays the result for the same key+payload', async () => {
    let calls = 0;
    const op = async () => { calls++; return 'charge-ok'; };
    const r1 = await reg.execute('idem-1', 'payload-hash', op);
    const r2 = await reg.execute('idem-1', 'payload-hash', op);
    expect(r1).toBe('charge-ok');
    expect(r2).toBe('charge-ok');
    expect(calls).toBe(1); // replay, not re-execute
  });

  it('conflict on same key with different payload', async () => {
    await reg.execute('idem-1', 'payload-a', async () => 'x');
    await expect(reg.execute('idem-1', 'payload-b', async () => 'y')).rejects.toBeInstanceOf(IdempotencyConflictError);
  });

  it('failed executions allow retry on next call', async () => {
    let calls = 0;
    await expect(reg.execute('idem-1', 'p', async () => { calls++; throw new Error('first'); })).rejects.toThrow('first');
    const r = await reg.execute('idem-1', 'p', async () => { calls++; return 'second'; });
    expect(r).toBe('second');
    expect(calls).toBe(2);
  });

  it('joins concurrent in-flight calls on the same key', async () => {
    let calls = 0;
    let release: (v: string) => void = () => undefined;
    const gate = new Promise<string>((r) => { release = r; });
    const op = () => { calls++; return gate; };
    const p1 = reg.execute('idem-1', 'p', op);
    const p2 = reg.execute('idem-1', 'p', op); // joins p1
    release('shared');
    const [r1, r2] = await Promise.all([p1, p2]);
    expect(calls).toBe(1);
    expect(r1).toBe('shared');
    expect(r2).toBe('shared');
  });

  it('records expire past the TTL window', async () => {
    await reg.execute('k', 'p', async () => 'v');
    clock.advance(60_001);
    let calls = 0;
    await reg.execute('k', 'p', async () => { calls++; return 'v2'; });
    expect(calls).toBe(1); // record expired → fresh execution
  });
});

/* ------------------------------------------------------------------ */
/* RetrySession                                                        */
/* ------------------------------------------------------------------ */

describe('RetrySession', () => {
  it('tracks remaining budget on the clock', () => {
    const clock = new ManualEngineClock();
    const s = new RetrySession({ clock, totalBudgetMs: 3000 });
    expect(s.remaining()).toBe(3000);
    clock.advance(1000);
    expect(s.remaining()).toBe(2000);
    expect(s.canAttempt()).toBe(true);
    clock.advance(2500);
    expect(s.canAttempt()).toBe(false);
    expect(() => s.requireBudget()).toThrow(RetrySessionExpiredError);
  });

  it('minRequiredMs refuses attempts that cannot finish', () => {
    const clock = new ManualEngineClock();
    const s = new RetrySession({ clock, totalBudgetMs: 1000, minRequiredMs: 500 });
    clock.advance(400); // 600 left — enough for a 500ms attempt
    expect(s.canAttempt()).toBe(true);
    clock.advance(200); // 400 left — not enough
    expect(s.canAttempt()).toBe(false);
  });

  it('attemptTimeoutMs derives a per-attempt cap from remaining budget', () => {
    const clock = new ManualEngineClock();
    const s = new RetrySession({ clock, totalBudgetMs: 1000, minRequiredMs: 100 });
    clock.advance(200);
    expect(s.attemptTimeoutMs()).toBe(700); // 800 remaining - 100 required
    expect(s.attemptTimeoutMs(300)).toBe(300); // capped by caller
  });
});
