/**
 * LoadShedder — priority + latency-budget-driven request shedding.
 *
 * When load exceeds capacity, a facade must shed *something*. Two sane
 * policies compose here:
 *
 *   1. Priority tiers: `critical | normal | low`. Under pressure,
 *      low-priority work sheds first (metrics polling dies before
 *      checkout calls).
 *   2. Latency-budget: if the queue's oldest waiter's deadline has
 *      already passed by `headroomMs`, shed it — serving a request
 *      that'll be timed-out-by-the-caller anyway is wasted work
 *      ("the request is already dead, don't spend CPU on it").
 *
 * Shedding decision (`admit`):
 *   - under `softUtilization` of `maxConcurrent` → everyone admitted;
 *   - over `softUtilization` → low-priority shed first, then normal;
 *     critical is only shed at `hardUtilization` (default 1.0 = full).
 *   - a request whose deadline is already past is shed regardless.
 *
 * Callers hold the semaphore themselves — this component only answers
 * "should this request be admitted right now?" O(1).
 *
 * @module FacadeLayer/Engine
 */

import { FacadeEngineClock, SystemEngineClock } from './types';

export type RequestPriority = 'critical' | 'normal' | 'low';

export interface ShedRequest {
  priority: RequestPriority;
  /** Caller's deadline (clock time); `0` = no deadline. */
  deadlineMs?: number;
}

export interface ShedderOptions {
  /** Concurrent executions considered "full". */
  maxConcurrent: number;
  /** Utilization at which low-priority sheds. Default 0.7. */
  softUtilization?: number;
  /** Utilization at which normal sheds. Default 0.9. */
  normalShedUtilization?: number;
  /** Utilization at which even critical sheds. Default 1.0. */
  hardUtilization?: number;
  /**
   * If a request's deadline leaves less headroom than this (ms),
   * shed it — the caller will time out anyway. Default 0 (off).
   */
  minHeadroomMs?: number;
  clock?: FacadeEngineClock;
}

export type ShedDecision =
  | { admitted: true }
  | { admitted: false; reason: 'deadline-expired' | 'over-soft' | 'over-normal' | 'over-hard'; utilization: number };

export class LoadShedder {
  private readonly _clock: FacadeEngineClock;
  private readonly _maxConcurrent: number;
  private readonly _soft: number;
  private readonly _normalShed: number;
  private readonly _hard: number;
  private readonly _minHeadroomMs: number;

  private _inFlight = 0;
  private _admitted = 0;
  private _shed = 0;
  private _shedByReason = new Map<string, number>();

  constructor(options: ShedderOptions) {
    this._clock = options.clock ?? new SystemEngineClock();
    this._maxConcurrent = Math.max(1, options.maxConcurrent);
    this._soft = options.softUtilization ?? 0.7;
    this._normalShed = options.normalShedUtilization ?? 0.9;
    this._hard = options.hardUtilization ?? 1.0;
    this._minHeadroomMs = Math.max(0, options.minHeadroomMs ?? 0);
  }

  /**
   * Admit or shed `req` given current load. Caller is responsible for
   * `begin`/`end` accounting around the actual work.
   */
  admit(req: ShedRequest): ShedDecision {
    const u = this._inFlight / this._maxConcurrent;

    // Deadline check first — a dead-on-arrival request sheds regardless.
    if (req.deadlineMs !== undefined && req.deadlineMs > 0) {
      const headroom = req.deadlineMs - this._clock.now();
      if (headroom < this._minHeadroomMs) {
        this._recordShed('deadline-expired');
        return { admitted: false, reason: 'deadline-expired', utilization: u };
      }
    }

    const utilization = u;
    if (utilization >= this._hard) {
      this._recordShed('over-hard');
      return { admitted: false, reason: 'over-hard', utilization };
    }
    if (req.priority === 'low' && utilization >= this._soft) {
      this._recordShed('over-soft');
      return { admitted: false, reason: 'over-soft', utilization };
    }
    if (req.priority === 'normal' && utilization >= this._normalShed) {
      this._recordShed('over-normal');
      return { admitted: false, reason: 'over-normal', utilization };
    }

    this._admitted++;
    return { admitted: true };
  }

  /** Mark work started (call before invoking the handler). */
  begin(): void {
    this._inFlight++;
  }

  /** Mark work finished. */
  end(): void {
    if (this._inFlight > 0) this._inFlight--;
  }

  /** Combined admit+begin for the common path. */
  admitAndBegin(req: ShedRequest): ShedDecision {
    const d = this.admit(req);
    if (d.admitted) this._inFlight++;
    return d;
  }

  get utilization(): number {
    return this._inFlight / this._maxConcurrent;
  }

  stats(): { inFlight: number; utilization: number; admitted: number; shed: number; shedByReason: Record<string, number> } {
    return {
      inFlight: this._inFlight,
      utilization: this.utilization,
      admitted: this._admitted,
      shed: this._shed,
      shedByReason: Object.fromEntries(this._shedByReason),
    };
  }

  private _recordShed(reason: string): void {
    this._shed++;
    this._shedByReason.set(reason, (this._shedByReason.get(reason) ?? 0) + 1);
  }
}
