/**
 * Scheduled DLQ Replay
 *
 * Paces replay so a 10k-message DLQ does not thunder-herd the consumer:
 * each `tick()` claims at most `perInterval` records and hands them to
 * a caller-supplied redeliverer. Ticks are keyed to the injected clock —
 * calling `tick()` twice inside one interval is a no-op, which makes
 * the pacing honest under retries and safe to call on a timer.
 *
 * Eligibility: `pending` records older than `minAgeMs`, oldest first —
 * fresh failures should not leapfrog the backlog and a just-dead-lettered
 * record often needs a human glance before re-firing.
 *
 * Completion accounting: `movedTotal` counts records the redeliverer
 * accepted (promise resolved true). A rejected/false redelivery returns
 * the claim to `pending`; the next tick retries it — at most one in-flight
 * batch per plan per interval, so failed redeliveries cannot spin.
 *
 * @module DeadLetterLayer/Engine2
 */

import {
  DlqClock2,
  Engine2Record,
  ReplayPlan,
  ReplayTick,
  SystemDlqClock2,
} from './types';
import { RecordStore } from './RecordStore';

export class ReplayPlanError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ReplayPlanError';
  }
}

/**
 * The redelivery hook: return true when the record was accepted by the
 * destination (message re-published). False/throw returns the claim.
 */
export type Redeliverer = (record: Engine2Record) => Promise<boolean> | boolean;

export class ReplayScheduler {
  private readonly _store: RecordStore;
  private readonly _clock: DlqClock2;
  private _lastTickAt: number | null = null;
  private _movedTotal = 0;
  private _done = false;
  /** Per-record replay attempt count inside this plan. */
  private readonly _attempts = new Map<string, number>();

  constructor(
    store: RecordStore,
    readonly queue: string,
    private readonly _plan: ReplayPlan,
    clock: DlqClock2 = new SystemDlqClock2()
  ) {
    if (_plan.perInterval <= 0) throw new ReplayPlanError('perInterval must be positive');
    if (_plan.intervalMs <= 0) throw new ReplayPlanError('intervalMs must be positive');
    this._store = store;
    this._clock = clock;
  }

  get movedTotal(): number {
    return this._movedTotal;
  }

  /** True once maxTotal is reached or the queue has no eligible records. */
  get done(): boolean {
    return this._done;
  }

  /** Attempts this plan has made on a record (0 for untouched). */
  attempts(id: string): number {
    return this._attempts.get(id) ?? 0;
  }

  /**
   * Run one pacing step. No-op inside the same interval; otherwise
   * claims up to the remaining budget and settles each claim through
   * `redeliver`. Async because real redelivery is I/O.
   */
  async tick(redeliver: Redeliverer): Promise<ReplayTick> {
    const now = this._clock.now();
    if (this._lastTickAt !== null && now - this._lastTickAt < this._plan.intervalMs) {
      return {
        at: now,
        moved: [],
        remaining: this._store.depth(this.queue, 'pending'),
      };
    }
    this._lastTickAt = now;

    const budget =
      this._plan.maxTotal === undefined
        ? this._plan.perInterval
        : Math.min(this._plan.perInterval, Math.max(0, this._plan.maxTotal - this._movedTotal));
    if (budget === 0) {
      this._done = true;
      return { at: now, moved: [], remaining: this._store.depth(this.queue, 'pending') };
    }

    const claimed = this._store.claimForReplay(
      this.queue,
      budget,
      this._plan.minAgeMs ?? 0
    );
    const moved: string[] = [];
    for (const rec of claimed) {
      this._attempts.set(rec.id, (this._attempts.get(rec.id) ?? 0) + 1);
      let ok = false;
      try {
        ok = await redeliver(rec);
      } catch {
        ok = false;
      }
      if (ok) {
        this._store.completeReplay(rec.id);
        moved.push(rec.id);
      } else {
        this._store.failReplay(rec.id);
      }
    }
    this._movedTotal += moved.length;
    const remaining = this._store.depth(this.queue, 'pending');
    if (
      (this._plan.maxTotal !== undefined && this._movedTotal >= this._plan.maxTotal) ||
      remaining === 0
    ) {
      this._done = true;
    }
    return { at: now, moved, remaining };
  }

  /**
   * Drain: tick immediately, then keep ticking each interval until done.
   * Advances nothing itself — the caller advances the clock (real timer
   * or manual), which is what makes the loop honest in tests.
   *
   * `maxTicks` bounds the loop (default: enough ticks to move every
   * eligible record even if every redelivery fails once per record).
   */
  async drain(redeliver: Redeliverer, advance: (ms: number) => void, maxTicks = 10_000): Promise<number> {
    let ticks = 0;
    while (!this._done && ticks < maxTicks) {
      await this.tick(redeliver);
      ticks++;
      if (this._done) break;
      advance(this._plan.intervalMs);
    }
    return this._movedTotal;
  }


}
