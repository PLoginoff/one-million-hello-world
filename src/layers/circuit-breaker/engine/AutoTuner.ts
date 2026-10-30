/**
 * AutoTuner — adjusts breaker thresholds from observed failure rates.
 *
 * Static thresholds are a compromise: a `failureThreshold` of 5 is right
 * for a chatty endpoint but too twitchy for a low-QPS batch endpoint
 * (5 failures could be minutes of traffic, or the endpoint's entire
 * daily volume). The tuner periodically inspects each breaker's rolling
 * stats and nudges knobs toward a target error budget.
 *
 * Model — per endpoint, per tuning window:
 *   - `calls`, `failures` deltas are sampled from `BreakerStats`.
 *   - errorRate = failures/calls over the window.
 *   - If errorRate > `highWater`  → the endpoint is genuinely bad:
 *         * increase `failureThreshold` (don't flap on every error —
 *           the point of a breaker is to shed load, not to oscillate);
 *         * increase `resetTimeoutMs` (wait longer between probes).
 *     If errorRate < `lowWater` and the breaker never opened in the
 *     window → relax toward defaults: decrease thresholds back toward
 *     their floor so protection tightens once the endpoint is healthy.
 *   - All adjustments are multiplicative and clamped to
 *     [minThreshold..maxThreshold], [minResetMs..maxResetMs], so the
 *     tuner can only reshape the envelope, not disable it.
 *   - Hysteresis: a `neutral band` between lowWater and highWater where
 *     nothing changes avoids oscillation on borderline endpoints.
 *
 * The tuner never opens or closes a breaker — it only shapes future
 * behavior. Safety invariants (breaker still trips, probes still run)
 * are preserved by construction.
 *
 * Complexity: tune() is O(#breakers) with O(1) work per breaker.
 *
 * @module CircuitBreakerLayer/Engine
 */

import { BreakerEngineClock, BreakerState, EndpointBreakerConfig, SystemEngineClock } from './types';
import { BreakerRegistry } from './BreakerRegistry';
import { EndpointBreaker } from './EndpointBreaker';

export interface AutoTunerOptions {
  /** Error rate above which the endpoint is "unhealthy". Default 0.5. */
  highWater?: number;
  /** Error rate below which thresholds relax back toward floors. Default 0.05. */
  lowWater?: number;
  /** Growth multiplier when unhealthy (>1). Default 1.5. */
  growFactor?: number;
  /** Shrink multiplier when healthy (<1). Default 0.8. */
  shrinkFactor?: number;
  /** Bounds for failureThreshold. */
  minFailureThreshold?: number;
  maxFailureThreshold?: number;
  /** Bounds for resetTimeoutMs. */
  minResetTimeoutMs?: number;
  maxResetTimeoutMs?: number;
  /** Minimum calls in a window before tuning acts (avoids tiny-sample noise). */
  minSampleSize?: number;
  clock?: BreakerEngineClock;
}

export interface TuneDecision {
  endpoint: string;
  windowCalls: number;
  windowFailures: number;
  errorRate: number;
  action: 'tightened' | 'relaxed' | 'unchanged' | 'insufficient-data';
  before: { failureThreshold: number; resetTimeoutMs: number };
  after: { failureThreshold: number; resetTimeoutMs: number };
}

interface WindowSample {
  calls: number;
  failures: number;
  opensSeen: number;
}

export class AutoTuner {
  private readonly _registry: BreakerRegistry;
  private readonly _clock: BreakerEngineClock;
  private readonly _highWater: number;
  private readonly _lowWater: number;
  private readonly _grow: number;
  private readonly _shrink: number;
  private readonly _minThreshold: number;
  private readonly _maxThreshold: number;
  private readonly _minReset: number;
  private readonly _maxReset: number;
  private readonly _minSample: number;

  /** Per-endpoint baseline from the last tune() call. */
  private readonly _baseline = new Map<string, { calls: number; failures: number }>();
  private readonly _opensSeen = new Map<string, number>();

  constructor(registry: BreakerRegistry, options: AutoTunerOptions = {}) {
    this._registry = registry;
    this._clock = options.clock ?? new SystemEngineClock();
    this._highWater = options.highWater ?? 0.5;
    this._lowWater = options.lowWater ?? 0.05;
    this._grow = options.growFactor ?? 1.5;
    this._shrink = options.shrinkFactor ?? 0.8;
    this._minThreshold = Math.max(1, options.minFailureThreshold ?? 2);
    this._maxThreshold = Math.max(this._minThreshold, options.maxFailureThreshold ?? 50);
    this._minReset = Math.max(0, options.minResetTimeoutMs ?? 1000);
    this._maxReset = Math.max(this._minReset, options.maxResetTimeoutMs ?? 300_000);
    this._minSample = Math.max(1, options.minSampleSize ?? 10);
    if (this._lowWater >= this._highWater) {
      throw new Error('AutoTuner: lowWater must be < highWater');
    }
  }

  /**
   * Attach breakers' state-change events so `opensSeen` is tracked.
   * Call once after construction for breakers created via `registry.breaker`.
   * (Breakers created later get hooked on the next `tune`.)
   */
  private _hook(b: EndpointBreaker): void {
    const key = b.endpoint;
    if (this._opensSeen.has(key)) return;
    this._opensSeen.set(key, 0);
    b.onEvent((_ep, event) => {
      if (event === 'state-change' && b.state === BreakerState.OPEN) {
        this._opensSeen.set(key, (this._opensSeen.get(key) ?? 0) + 1);
      }
    });
    // Note: 'state-change' fires after transition; reading b.state at
    // callback time gives the *new* state — we count only transitions
    // to OPEN.
  }

  /**
   * Sample the registry and apply tuning decisions. Returns one
   * decision per endpoint for observability/audit.
   */
  tune(): TuneDecision[] {
    const decisions: TuneDecision[] = [];
    for (const endpoint of this._registry.endpoints()) {
      const b = this._registry.breaker(endpoint);
      this._hook(b);
      decisions.push(this._tuneOne(b));
    }
    return decisions;
  }

  private _tuneOne(b: EndpointBreaker): TuneDecision {
    const stats = b.stats();
    const base = this._baseline.get(b.endpoint) ?? { calls: 0, failures: 0 };
    const windowCalls = Math.max(0, stats.totalCalls - base.calls);
    const windowFailures = Math.max(0, stats.totalFailures - base.failures);
    this._baseline.set(b.endpoint, { calls: stats.totalCalls, failures: stats.totalFailures });

    const before = b.currentConfig();
    const errorRate = windowCalls > 0 ? windowFailures / windowCalls : 0;
    const opensThisWindow = this._opensSeen.get(b.endpoint) ?? 0;
    this._opensSeen.set(b.endpoint, 0);

    const decision: TuneDecision = {
      endpoint: b.endpoint,
      windowCalls,
      windowFailures,
      errorRate,
      action: 'unchanged',
      before,
      after: before,
    };

    if (windowCalls < this._minSample) {
      decision.action = 'insufficient-data';
      return decision;
    }

    let newThreshold = before.failureThreshold;
    let newReset = before.resetTimeoutMs;

    if (errorRate > this._highWater) {
      // Endpoint unhealthy: trip less eagerly and probe less often.
      newThreshold = Math.min(this._maxThreshold, Math.round(before.failureThreshold * this._grow));
      newReset = Math.min(this._maxReset, Math.round(before.resetTimeoutMs * this._grow));
      decision.action = 'tightened';
    } else if (errorRate < this._lowWater && opensThisWindow === 0) {
      // Healthy window: move thresholds back toward floors.
      newThreshold = Math.max(this._minThreshold, Math.round(before.failureThreshold * this._shrink));
      newReset = Math.max(this._minReset, Math.round(before.resetTimeoutMs * this._shrink));
      decision.action = 'relaxed';
    }

    if (newThreshold !== before.failureThreshold || newReset !== before.resetTimeoutMs) {
      b.tune({ failureThreshold: newThreshold, resetTimeoutMs: newReset });
      decision.after = { failureThreshold: newThreshold, resetTimeoutMs: newReset };
    } else if (decision.action !== 'unchanged') {
      // Direction requested but already at clamp bounds.
      decision.action = 'unchanged';
    }
    return decision;
  }

  /** Read-only view of current per-endpoint window baselines. */
  baselines(): ReadonlyMap<string, { calls: number; failures: number }> {
    return this._baseline;
  }
}

/** Re-export for convenience. */
export type { EndpointBreakerConfig };
