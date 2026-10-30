/**
 * OutlierDetector — consecutive-failure ejection with exponential backoff.
 *
 * Modeled on Envoy's outlier detection: a backend that accumulates
 * `consecutiveFailureThreshold` consecutive failures is ejected from the
 * routable set for `baseEjectMs * 2^(ejectionCount-1)` (capped at
 * `maxEjectMs`). When the ejection expires the backend returns in
 * `ramping` state so slow-start can trickle traffic back.
 *
 * A single success resets the consecutive counter. "Failure" is defined by
 * the caller — typically a 5xx, a timeout, or a connection error; client
 * errors (4xx) usually don't count and `reportSuccess` vs
 * `reportFailure` lets the caller decide.
 *
 * Complexity: all operations are O(1) — state lives in a flat Map keyed by
 * backend id. `sweep()` is O(n) over registered backends.
 *
 * @module LoadBalancerLayer/Engine2
 */

import { Backend2, LbClock2, SystemLbClock2 } from './types';

export interface OutlierDetectorOptions {
  /** Consecutive failures before ejection. Default 5. */
  consecutiveFailureThreshold?: number;
  /** Base ejection duration in ms. Default 30_000. */
  baseEjectMs?: number;
  /** Max ejection duration in ms (backoff cap). Default 300_000. */
  maxEjectMs?: number;
  /** Max times a backend may be ejected before it stays ejected until a
   *  manual `unquarantine()`. Default 0 = unlimited. */
  maxEjections?: number;
  clock?: LbClock2;
}

interface BackendHealth {
  consecutiveFailures: number;
  ejectionCount: number;
  ejectedUntilMs: number | null;
  /** Total successes/failures since registration (never reset). */
  totalSuccesses: number;
  totalFailures: number;
  quarantined: boolean;
}

export type EjectReason = 'threshold' | 'manual' | 'none';

export class OutlierDetector {
  private readonly _threshold: number;
  private readonly _baseEjectMs: number;
  private readonly _maxEjectMs: number;
  private readonly _maxEjections: number;
  private readonly _clock: LbClock2;
  private readonly _health = new Map<string, BackendHealth>();

  constructor(opts: OutlierDetectorOptions = {}) {
    this._threshold = Math.max(1, opts.consecutiveFailureThreshold ?? 5);
    this._baseEjectMs = Math.max(1, opts.baseEjectMs ?? 30_000);
    this._maxEjectMs = Math.max(this._baseEjectMs, opts.maxEjectMs ?? 300_000);
    this._maxEjections = Math.max(0, opts.maxEjections ?? 0);
    this._clock = opts.clock ?? new SystemLbClock2();
  }

  /** Register a backend for tracking (idempotent). */
  track(backend: Backend2): void {
    if (!this._health.has(backend.id)) {
      this._health.set(backend.id, {
        consecutiveFailures: 0,
        ejectionCount: 0,
        ejectedUntilMs: null,
        totalSuccesses: 0,
        totalFailures: 0,
        quarantined: false,
      });
    }
  }

  /** Stop tracking a backend entirely. */
  untrack(backendId: string): boolean {
    return this._health.delete(backendId);
  }

  /**
   * Record a successful request. Resets the consecutive failure counter.
   * Does NOT lift an active ejection — ejection expiry is time-based so a
   * flapping health probe can't immediately re-flood a sick backend.
   */
  reportSuccess(backendId: string): void {
    const h = this._health.get(backendId);
    if (!h) return;
    h.consecutiveFailures = 0;
    h.totalSuccesses++;
  }

  /**
   * Record a failed request. If the consecutive threshold is reached the
   * backend is ejected; the reason tells the caller whether this report
   * caused the ejection.
   */
  reportFailure(backendId: string): EjectReason {
    const h = this._health.get(backendId);
    if (!h) return 'none';
    h.consecutiveFailures++;
    h.totalFailures++;
    if (h.consecutiveFailures >= this._threshold && !this.isEjected(backendId)) {
      this._eject(h);
      return 'threshold';
    }
    return 'none';
  }

  /**
   * Is the backend currently ejected? Lazily expires ejections — if the
   * ejection window has passed the backend is considered recovered
   * (callers transition it to `ramping`).
   */
  isEjected(backendId: string): boolean {
    const h = this._health.get(backendId);
    if (!h) return false;
    if (h.quarantined) return true;
    if (h.ejectedUntilMs === null) return false;
    return this._clock.now() < h.ejectedUntilMs;
  }

  /**
   * Returns true if the backend was in an ejection window that has now
   * expired — i.e. it is eligible to re-enter via slow-start. After this
   * returns true once, `ejectedUntilMs` is cleared.
   */
  takeRecoveryEligible(backendId: string): boolean {
    const h = this._health.get(backendId);
    if (!h || h.quarantined) return false;
    if (h.ejectedUntilMs !== null && this._clock.now() >= h.ejectedUntilMs) {
      h.ejectedUntilMs = null;
      h.consecutiveFailures = 0;
      return true;
    }
    return false;
  }

  /** Manually eject a backend for `durationMs` (or baseEjectMs). */
  eject(backendId: string, durationMs?: number): void {
    const h = this._health.get(backendId);
    if (!h) return;
    h.ejectedUntilMs = this._clock.now() + (durationMs ?? this._baseEjectMs);
  }

  /** Lift an active ejection/quarantine immediately. */
  unquarantine(backendId: string): void {
    const h = this._health.get(backendId);
    if (!h) return;
    h.quarantined = false;
    h.ejectedUntilMs = null;
    h.consecutiveFailures = 0;
  }

  /** Current consecutive failure count. */
  consecutiveFailures(backendId: string): number {
    return this._health.get(backendId)?.consecutiveFailures ?? 0;
  }

  /** How many times this backend has been ejected. */
  ejectionCount(backendId: string): number {
    return this._health.get(backendId)?.ejectionCount ?? 0;
  }

  /** Timestamp (ms) the current ejection ends, or null. */
  ejectedUntil(backendId: string): number | null {
    const h = this._health.get(backendId);
    if (!h) return null;
    if (h.quarantined) return Number.POSITIVE_INFINITY;
    return h.ejectedUntilMs;
  }

  /** Success ratio in [0,1]; 1 when no requests recorded. */
  successRate(backendId: string): number {
    const h = this._health.get(backendId);
    if (!h) return 1;
    const total = h.totalSuccesses + h.totalFailures;
    return total === 0 ? 1 : h.totalSuccesses / total;
  }

  /** Expire all elapsed ejections. Returns ids that became eligible. */
  sweep(): string[] {
    const recovered: string[] = [];
    for (const [id] of this._health) {
      if (this.takeRecoveryEligible(id)) recovered.push(id);
    }
    return recovered;
  }

  private _eject(h: BackendHealth): void {
    h.ejectionCount++;
    if (this._maxEjections > 0 && h.ejectionCount > this._maxEjections) {
      // Serial offender — hold until an operator intervenes.
      h.quarantined = true;
      h.ejectedUntilMs = null;
      return;
    }
    // Exponential backoff: base * 2^(n-1), capped.
    const backoff = this._baseEjectMs * 2 ** (h.ejectionCount - 1);
    h.ejectedUntilMs = this._clock.now() + Math.min(backoff, this._maxEjectMs);
  }
}
