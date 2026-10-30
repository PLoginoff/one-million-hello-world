/**
 * CanaryProbe — periodic synthetic probe driving a breaker's half-open
 * recovery without real traffic.
 *
 * When a breaker opens, real-traffic probes are risky (real user
 * requests are the probe). A canary probe is a low-cost synthetic
 * request run on a schedule: while OPEN, probes tick at `probeIntervalMs`
 * and their outcomes feed the breaker just like real calls — but the
 * backend only sees a bounded probe rate regardless of real traffic.
 *
 * Model:
 *   - `tick()` is called by an external timer (or `ManualEngineClock`
 *     in tests); it decides "is a probe due? is the breaker half-open?"
 *   - `run(probeFn)` performs the synthetic call; outcome recorded
 *     through the breaker's normal `recordSuccess`/`recordFailure`;
 *   - consecutive-probe-successes close the breaker (handled by the
 *     breaker's own half-open logic — this module only schedules and
 *     records);
 *   - `probeBudgetPerHour` bounds synthetic load — a canary that
 *     recovers is useless if the probe itself was the last straw.
 *
 * Deliberately does NOT own a timer: engines stay timer-free so tests
 * control when ticks fire.
 *
 * @module CircuitBreakerLayer/Engine
 */

import { BreakerEngineClock, BreakerState, SystemEngineClock } from './types';
import { EndpointBreaker } from './EndpointBreaker';

export interface CanaryProbeOptions {
  /** Ticks between probes. Default 5000 ms. */
  probeIntervalMs?: number;
  /** Max probes per hour (across all ticks). Default 60. */
  probeBudgetPerHour?: number;
  clock?: BreakerEngineClock;
}

export interface ProbeOutcome {
  ran: boolean;
  reason: 'probe-ran' | 'not-due' | 'budget-exhausted' | 'breaker-not-half-open' | 'probe-skipped-open';
  ok?: boolean;
  error?: unknown;
}

export class CanaryProbe {
  private readonly _breaker: EndpointBreaker;
  private readonly _clock: BreakerEngineClock;
  private readonly _intervalMs: number;
  private readonly _budgetPerHour: number;

  private _lastProbeAt = -Infinity;
  private _hourWindowStart = 0;
  private _probesThisHour = 0;
  private _totalProbes = 0;
  private _totalProbeFailures = 0;

  constructor(breaker: EndpointBreaker, options: CanaryProbeOptions = {}) {
    this._breaker = breaker;
    this._clock = options.clock ?? new SystemEngineClock();
    this._intervalMs = Math.max(1, options.probeIntervalMs ?? 5000);
    this._budgetPerHour = Math.max(1, options.probeBudgetPerHour ?? 60);
  }

  /**
   * Fire a probe if due and the breaker wants one (OPEN→HALF_OPEN or
   * already HALF_OPEN). Returns what happened — no throw.
   */
  async tick(probeFn: () => Promise<unknown> | unknown): Promise<ProbeOutcome> {
    const now = this._clock.now();

    // Reset hourly budget window.
    if (now - this._hourWindowStart >= 3_600_000) {
      this._hourWindowStart = now;
      this._probesThisHour = 0;
    }

    const state = this._breaker.state;
    if (state === BreakerState.CLOSED) {
      return { ran: false, reason: 'breaker-not-half-open' };
    }
    if (state === BreakerState.OPEN) {
      // Open breakers don't probe until the reset timeout makes them half-open.
      return { ran: false, reason: 'probe-skipped-open' };
    }
    if (now - this._lastProbeAt < this._intervalMs) {
      return { ran: false, reason: 'not-due' };
    }
    if (this._probesThisHour >= this._budgetPerHour) {
      return { ran: false, reason: 'budget-exhausted' };
    }

    this._lastProbeAt = now;
    this._probesThisHour++;
    this._totalProbes++;
    try {
      await probeFn();
      this._breaker.recordSuccess();
      return { ran: true, reason: 'probe-ran', ok: true };
    } catch (err: unknown) {
      this._totalProbeFailures++;
      this._breaker.recordFailure();
      return { ran: true, reason: 'probe-ran', ok: false, error: err };
    }
  }

  stats(): { totalProbes: number; totalProbeFailures: number; probesThisHour: number; lastProbeAt: number } {
    return {
      totalProbes: this._totalProbes,
      totalProbeFailures: this._totalProbeFailures,
      probesThisHour: this._probesThisHour,
      lastProbeAt: this._lastProbeAt,
    };
  }
}
