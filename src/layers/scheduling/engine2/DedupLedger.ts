/**
 * Scheduling Engine2 — Recurring-Run Deduplication Ledger
 *
 * After downtime, `run-all` missed-run policy can dispatch the same cron
 * slot twice across a rolling recovery (tick drains, restart, tick again).
 * The scheduler's missedSlots queue protects in-memory, but a restart or
 * a second scheduler instance sees nothing. This ledger is the durable-ish
 * answer: one execution per (jobId, slot), regardless of who's asking.
 *
 *   - `claim(jobId, slot)` — first caller wins; duplicates return the
 *     EXISTING record rather than re-dispatching.
 *   - Slots are quanta: `slotOf(ts)` floors a timestamp to the job's
 *     granularity (per-minute for minute-cron, per-hour for hourly…), so
 *     the same logical run claimed at slightly different times collapses.
 *   - Missed-slot enumeration: `missed(job, from, to)` lists slots the
 *     ledger has no successful claim for — the input a recovery walker
 *     feeds to the scheduler as `missedSlots`.
 *   - `sweep(horizon)` drops settled records older than the horizon so
 *     the ledger stays bounded.
 *
 * Complexity: claim O(1); missed O(slots in range); sweep O(records).
 *
 * @module SchedulingLayer/Engine2
 */

import { Clock, SystemClock } from '../scheduler/SchedulerTypes';

export type ClaimStatus = 'claimed' | 'succeeded' | 'failed' | 'expired';

export interface ClaimRecord {
  readonly jobId: string;
  /** Slot quantum start (epoch ms). */
  readonly slot: number;
  readonly claimedAt: number;
  status: ClaimStatus;
  /** Execution attempt count against this slot. */
  attempts: number;
}

export interface DedupLedgerOptions {
  readonly clock?: Clock;
  /** Slot granularity (default 60s — matches minute-cron). */
  readonly slotMs?: number;
}

const DEFAULT_SLOT_MS = 60_000;

export class DedupLedger {
  private readonly _clock: Clock;
  private readonly _slotMs: number;
  /** `${jobId}@${slot}` → record. */
  private readonly _claims = new Map<string, ClaimRecord>();

  constructor(options?: DedupLedgerOptions) {
    this._clock = options?.clock ?? new SystemClock();
    this._slotMs = options?.slotMs ?? DEFAULT_SLOT_MS;
    if (this._slotMs <= 0) throw new Error('slotMs must be > 0');
  }

  /** Floor `ts` to the slot boundary. */
  slotOf(ts: number): number {
    return Math.floor(ts / this._slotMs) * this._slotMs;
  }

  private _key(jobId: string, slot: number): string {
    return `${jobId}@${slot}`;
  }

  /**
   * Claim the (job, slot). Returns `{ fresh: true, record }` for the
   * winner; `{ fresh: false, record }` for duplicates — caller inspects
   * `record.status` to decide whether to skip, retry, or await.
   * `failed`/`expired` claims may be re-claimed (attempts++).
   */
  claim(jobId: string, fireAt: number): { fresh: boolean; record: ClaimRecord } {
    const slot = this.slotOf(fireAt);
    const key = this._key(jobId, slot);
    const existing = this._claims.get(key);
    if (existing && (existing.status === 'claimed' || existing.status === 'succeeded')) {
      return { fresh: false, record: existing };
    }
    if (existing) {
      // Re-claim of a failed/expired slot.
      existing.status = 'claimed';
      existing.attempts++;
      return { fresh: true, record: existing };
    }
    const rec: ClaimRecord = {
      jobId,
      slot,
      claimedAt: this._clock.now(),
      status: 'claimed',
      attempts: 1,
    };
    this._claims.set(key, rec);
    return { fresh: true, record: rec };
  }

  /** Settle a claim. Unknown claims return false. */
  settle(jobId: string, fireAt: number, ok: boolean): boolean {
    const rec = this._claims.get(this._key(jobId, this.slotOf(fireAt)));
    if (!rec || rec.status !== 'claimed') return false;
    rec.status = ok ? 'succeeded' : 'failed';
    return true;
  }

  /**
   * Slots in (from, to] with NO successful claim — what a recovery pass
   * must replay under 'run-all' semantics. Slots are generated on the
   * job's slot granularity, so a 30s outage mid-minute yields ≤1 slot.
   */
  missed(jobId: string, from: number, to: number): number[] {
    const out: number[] = [];
    for (let slot = this.slotOf(from) + this._slotMs; slot <= to; slot += this._slotMs) {
      const rec = this._claims.get(this._key(jobId, slot));
      if (!rec || rec.status !== 'succeeded') out.push(slot);
    }
    return out;
  }

  /**
   /** Drop records older than `horizonMs` — called periodically to bound
   * memory. Succeeded records may be retained for the horizon to prove
   * "we did run 14:00"; unfinished claims are never swept (a stale claim
   * is a signal, not garbage). Failed records are swept too — a failure
   * older than the horizon is history, not a live retry candidate.
   */
  sweep(horizonMs: number): number {
    const cutoff = this._clock.now() - horizonMs;
    let n = 0;
    for (const [k, rec] of this._claims) {
      if (rec.claimedAt < cutoff && rec.status !== 'claimed') {
        this._claims.delete(k);
        n++;
      }
    }
    return n;
  }

  /** Mark in-flight claims older than `staleMs` as expired — recovery signal. */
  expireStale(staleMs: number): number {
    const cutoff = this._clock.now() - staleMs;
    let n = 0;
    for (const rec of this._claims.values()) {
      if (rec.status === 'claimed' && rec.claimedAt < cutoff) {
        rec.status = 'expired';
        n++;
      }
    }
    return n;
  }

  record(jobId: string, fireAt: number): ClaimRecord | undefined {
    return this._claims.get(this._key(jobId, this.slotOf(fireAt)));
  }

  get size(): number {
    return this._claims.size;
  }
}
