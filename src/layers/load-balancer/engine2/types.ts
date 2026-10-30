/**
 * LoadBalancer Engine2 — Shared Types
 *
 * Second-generation load balancing primitives: outlier detection with
 * backend ejection, slow-start weight ramping, bounded per-backend request
 * queueing, cookie/hash-based session persistence, and per-backend load
 * metrics with latency percentiles.
 *
 * @module LoadBalancerLayer/Engine2
 */

/** Injectable clock for ejection windows, ramp timing, and metric buckets. */
export interface LbClock2 {
  now(): number;
}

export class SystemLbClock2 implements LbClock2 {
  now(): number {
    return Date.now();
  }
}

/** Test clock with manual time control. */
export class ManualLbClock2 implements LbClock2 {
  private _t: number;
  constructor(start: number = 0) {
    this._t = start;
  }
  now(): number {
    return this._t;
  }
  advance(ms: number): void {
    this._t += ms;
  }
  set(ms: number): void {
    this._t = ms;
  }
}

/** A backend server that can receive proxied requests. */
export interface Backend2 {
  /** Unique backend identifier (e.g. "us-east-1:web-3:8080"). */
  readonly id: string;
  /** Base static weight (1-100). Effective weight may be lowered by
   *  slow-start ramping after recovery. */
  readonly baseWeight: number;
  /** Optional region/zone tag used by locality-aware callers. */
  readonly zone?: string;
  /** Optional metadata propagated to metrics. */
  readonly metadata?: Readonly<Record<string, string>>;
}

/** Lifecycle state of a backend inside the pool. */
export type BackendState =
  /** Receiving traffic at effective weight. */
  | 'active'
  /** Ejected by outlier detection — no traffic until ejection expires. */
  | 'ejected'
  /** Recovered from ejection — weight ramps up over the slow-start window. */
  | 'ramping'
  /** Administratively drained — no new traffic, existing sessions may finish. */
  | 'draining';

/** Result of asking the pool for a backend to serve one request. */
export interface RouteDecision {
  readonly backend: Backend2;
  /** Effective weight at decision time (after slow-start ramp). */
  readonly effectiveWeight: number;
  /** True when the choice was forced by session stickiness. */
  readonly sticky: boolean;
  /** True when the request was queued rather than dispatched immediately. */
  readonly queued: boolean;
}

/** Summary of a backend's live state — used by metrics and admin views. */
export interface BackendSnapshot {
  readonly id: string;
  readonly state: BackendState;
  readonly effectiveWeight: number;
  readonly consecutiveFailures: number;
  readonly inflight: number;
  readonly queueDepth: number;
  readonly ejectedUntilMs: number | null;
}
