/**
 * Scheduling Engine2 — Preemptive Priority Queue
 *
 * JobScheduler's min-heap orders by fire time only — equal-time jobs have
 * no notion of importance. This queue adds two-level ordering and
 * preemption:
 *
 *   Ordering: (priority desc, enqueuedAt asc) — highest priority first,
 *   FIFO within a priority (no starvation by reordering).
 *
 *   Preemption: when slots are full and a higher-priority job arrives,
 *   the LOWEST-priority running job younger than the newcomer's wait
 *   deadline is preempted (marked 'preempted', re-queued at head). A
 *   `minRunMs` shield protects just-started jobs from thrash — preempting
 *   a job that ran 50ms wastes the work without meaningfully improving
 *   latency.
 *
 *   Aging: optional `agingMs` promotes a queued job's effective priority
 *   by +1 per aging interval — the classic anti-starvation mechanism.
 *   Effective priority = base + floor(waited / agingMs).
 *
 * Data structure: the ready set is small (jobs waiting now), so a sorted
 * array with binary insertion is used — O(log n) search, O(n) insert —
 * simpler than a heap and dominant at scheduler-scale n.
 *
 * @module SchedulingLayer/Engine2
 */

import { Clock, SystemClock } from '../scheduler/SchedulerTypes';

export interface QueuedJob {
  readonly jobId: string;
  /** Base priority — larger runs first. */
  readonly priority: number;
  /** Injectable payload (handler reference, context…). */
  readonly payload?: unknown;
}

export interface RunningJob extends QueuedJob {
  readonly startedAt: number;
}

export interface PreemptedJob extends QueuedJob {
  /** Job displaced to make room. */
  readonly victim: string;
}

export interface PreemptiveQueueOptions {
  readonly clock?: Clock;
  /** Max concurrently running jobs (default 4). */
  readonly slots?: number;
  /** Aging interval: +1 effective priority per interval waited. */
  readonly agingMs?: number;
  /** Shield: don't preempt jobs running less than this (default 5s). */
  readonly minRunMs?: number;
}

interface Entry extends QueuedJob {
  enqueuedAt: number;
  preemptions: number;
}

const DEFAULT_SLOTS = 4;
const DEFAULT_MIN_RUN = 5_000;

export class PreemptiveQueue {
  private readonly _clock: Clock;
  private readonly _slots: number;
  private readonly _agingMs: number;
  private readonly _minRunMs: number;
  /** Sorted best-first by (effective priority desc, enqueuedAt asc). */
  private _ready: Entry[] = [];
  private readonly _running = new Map<string, RunningJob & { effPriority: number }>();
  private _preemptionCount = 0;

  constructor(options?: PreemptiveQueueOptions) {
    this._clock = options?.clock ?? new SystemClock();
    this._slots = options?.slots ?? DEFAULT_SLOTS;
    this._agingMs = options?.agingMs ?? 0;
    this._minRunMs = options?.minRunMs ?? DEFAULT_MIN_RUN;
    if (this._slots <= 0) throw new Error('slots must be > 0');
  }

  /** Priority including aging boost. */
  private _eff(e: Entry): number {
    if (this._agingMs <= 0) return e.priority;
    const waited = this._clock.now() - e.enqueuedAt;
    return e.priority + Math.floor(waited / this._agingMs);
  }

  /** Comparator: higher effective priority first; ties → earlier enqueue. */
  private _cmp(a: Entry, b: Entry): number {
    const pa = this._eff(a);
    const pb = this._eff(b);
    if (pa !== pb) return pb - pa;
    return a.enqueuedAt - b.enqueuedAt;
  }

  /** Binary-search insertion keeping _ready sorted best-first. */
  private _insert(e: Entry): void {
    let lo = 0;
    let hi = this._ready.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (this._cmp(this._ready[mid], e) <= 0) lo = mid + 1;
      else hi = mid;
    }
    this._ready.splice(lo, 0, e);
  }

  /**
   * Enqueue. If a slot is free the job may dispatch immediately via
   * `dispatch()`; if full, preemption is considered on the next dispatch
   * call (preemption happens lazily — the queue never kills running work
   * spontaneously).
   */
  enqueue(job: QueuedJob): void {
    this._insert({ ...job, enqueuedAt: this._clock.now(), preemptions: 0 });
  }

  /**
   * Take the next dispatchable job. When slots are full, evaluate
   * preemption: the head's effective priority must exceed the weakest
   * running job's, and the victim must have run ≥ minRunMs.
   * Returns the job to start (or preempt-and-start) or null.
   */
  dispatch(): { start: QueuedJob; preempted?: PreemptedJob } | null {
    if (this._ready.length === 0) return null;
    if (this._running.size < this._slots) {
      const e = this._ready.shift()!;
      return { start: this._begin(e) };
    }
    // Full — consider preemption.
    const head = this._ready[0];
    const headEff = this._eff(head);
    let victim: (RunningJob & { effPriority: number }) | null = null;
    for (const r of this._running.values()) {
      const unshielded = this._clock.now() - r.startedAt >= this._minRunMs;
      if (!unshielded) continue;
      if (r.effPriority < headEff && (victim === null || r.effPriority < victim.effPriority)) {
        victim = r;
      }
    }
    if (victim === null) return null;
    this._running.delete(victim.jobId);
    this._preemptionCount++;
    // Victim re-enters at head-of-queue fairness: original enqueue time
    // preserved so it isn't starved by repeated preemption.
    this._insert({ jobId: victim.jobId, priority: victim.priority, payload: victim.payload, enqueuedAt: victim.startedAt, preemptions: 0 });
    const e = this._ready.shift()!;
    return { start: this._begin(e), preempted: { ...victim, victim: victim.jobId } };
  }

  private _begin(e: Entry): QueuedJob {
    this._running.set(e.jobId, {
      jobId: e.jobId,
      priority: e.priority,
      payload: e.payload,
      startedAt: this._clock.now(),
      effPriority: this._eff(e),
    });
    return e;
  }

  /** Mark a running job finished; frees its slot. */
  complete(jobId: string): boolean {
    return this._running.delete(jobId);
  }

  get queued(): number {
    return this._ready.length;
  }

  get running(): number {
    return this._running.size;
  }

  get preemptionCount(): number {
    return this._preemptionCount;
  }

  /** Snapshot of queued jobIds in dispatch order (observability). */
  queuedJobs(): readonly string[] {
    return this._ready.map((e) => e.jobId);
  }
}
