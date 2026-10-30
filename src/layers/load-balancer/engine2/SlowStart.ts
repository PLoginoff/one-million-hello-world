/**
 * SlowStart — linear weight ramp for recovered or newly-added backends.
 *
 * When a backend (re)joins the pool — after ejection expiry, deployment,
 * or scale-up — routing it full traffic immediately can slam a cold JVM
 * or empty connection pool. Slow-start interpolates the effective weight
 * from `minWeightPercent` of `baseWeight` up to 100% over `windowMs`:
 *
 *   ramp(t) = minPct + (1 - minPct) * clamp((t - startMs) / windowMs, 0, 1)
 *
 * effectiveWeight = max(1, floor(baseWeight * ramp(t)))
 *
 * Two ramp shapes are provided:
 *  - 'linear'  — weight grows evenly; simple, predictable.
 *  - 'ease-in' — weight ∝ t², so early ramp is very conservative and most
 *    of the traffic arrives in the back half of the window (Envoy-style).
 *
 * Complexity: O(1) per lookup — a Map of backend id → ramp start.
 *
 * @module LoadBalancerLayer/Engine2
 */

import { Backend2, LbClock2, SystemLbClock2 } from './types';

export type RampShape = 'linear' | 'ease-in';

export interface SlowStartOptions {
  /** Ramp duration in ms. Default 60_000. */
  windowMs?: number;
  /** Starting weight as a fraction of base (0, 1]. Default 0.1. */
  minWeightPercent?: number;
  /** Ramp curve. Default 'linear'. */
  shape?: RampShape;
  clock?: LbClock2;
}

export class SlowStart {
  private readonly _windowMs: number;
  private readonly _minPct: number;
  private readonly _shape: RampShape;
  private readonly _clock: LbClock2;
  /** backend id → ramp start timestamp (ms). Absent = not ramping. */
  private readonly _ramps = new Map<string, number>();

  constructor(opts: SlowStartOptions = {}) {
    this._windowMs = Math.max(1, opts.windowMs ?? 60_000);
    this._minPct = opts.minWeightPercent ?? 0.1;
    if (this._minPct <= 0 || this._minPct > 1) {
      throw new RangeError('minWeightPercent must be in (0, 1]');
    }
    this._shape = opts.shape ?? 'linear';
    this._clock = opts.clock ?? new SystemLbClock2();
  }

  /** Begin ramping a backend. Re-ramping restarts the window. */
  startRamp(backendId: string, atMs?: number): void {
    this._ramps.set(backendId, atMs ?? this._clock.now());
  }

  /** Stop ramping — backend returns to full base weight. */
  finishRamp(backendId: string): void {
    this._ramps.delete(backendId);
  }

  /** Is the backend inside its ramp window right now? */
  isRamping(backendId: string): boolean {
    return this.progress(backendId) < 1;
  }

  /**
   * Ramp progress in [0, 1]. Returns 1 for backends not in a ramp window
   * (or whose window has elapsed — they are done).
   */
  progress(backendId: string): number {
    const start = this._ramps.get(backendId);
    if (start === undefined) return 1;
    const elapsed = this._clock.now() - start;
    if (elapsed >= this._windowMs) {
      this._ramps.delete(backendId);
      return 1;
    }
    if (elapsed <= 0) return 0;
    const t = elapsed / this._windowMs;
    return this._shape === 'ease-in' ? t * t : t;
  }

  /**
   * Effective weight for a backend right now: `baseWeight` scaled by the
   * ramp curve. Always ≥ 1 for a registered backend so a trickle of
   * traffic still flows (needed for health feedback to accumulate).
   */
  effectiveWeight(backend: Backend2): number {
    const p = this.progress(backend.id);
    const factor = this._minPct + (1 - this._minPct) * p;
    return Math.max(1, Math.floor(backend.baseWeight * factor));
  }

  /** Remaining ramp time in ms; 0 when not ramping. */
  remainingMs(backendId: string): number {
    const start = this._ramps.get(backendId);
    if (start === undefined) return 0;
    return Math.max(0, start + this._windowMs - this._clock.now());
  }

  /** Number of backends currently inside their ramp window. */
  get rampingCount(): number {
    let n = 0;
    for (const [id] of this._ramps) {
      if (this.progress(id) < 1) n++;
    }
    return n;
  }
}
