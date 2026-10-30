/**
 * EndpointBreaker — single circuit breaker bound to one endpoint.
 *
 * Classic three-state machine:
 *
 *      success            failures ≥ threshold
 *   ┌────────┐ ───────────────────────────────▶ ┌──────┐
 *   │ CLOSED │                                  │ OPEN │
 *   └────────┘ ◀─────────────────────────────── └──────┘
 *        ▲              successes ≥ threshold      │
 *        │                                         │ resetTimeout elapsed
 *        │                                         ▼
 *        │                                     ┌───────────┐
 *        └─────────────────────────────────────│ HALF_OPEN │
 *              probe fails → straight back OPEN └───────────┘
 *
 * Differences from a naive counter breaker:
 *   - Failures are recorded with timestamps in a ring buffer so an
 *     optional rolling `windowMs` counts "failures in the last N ms"
 *     rather than "since last state change" — a single ancient failure
 *     can't keep a breaker on the edge.
 *   - `isFailure` decides which errors trip the breaker (e.g. don't
 *     count 4xx validation errors as backend faults).
 *   - Half-open admits exactly `successThreshold` probes *sequentially*
 *     through `tryAcquireProbe`; extra callers are rejected rather than
 *     allowed to stampede. Probe concurrency across many breakers is
 *     bounded by `ProbeScheduler`.
 *   - `execute` is the simple path (single admission slot in half-open);
 *     use the scheduler when you need fleet-wide probe limits.
 *
 * Complexity: all operations O(1) except window compaction, which is
 * amortized O(1) per recorded failure (each entry is dropped once).
 *
 * @module CircuitBreakerLayer/Engine
 */

import {
  BreakerEngineClock,
  BreakerState,
  BreakerStateSnapshot,
  BreakerStats,
  CircuitRejectionError,
  EndpointBreakerConfig,
  SystemEngineClock,
} from './types';

/** Outcome hooks the registry/autotuner can subscribe to. */
export type BreakerEventListener = (endpoint: string, event: 'failure' | 'success' | 'state-change') => void;

export class EndpointBreaker {
  readonly endpoint: string;

  private readonly _clock: BreakerEngineClock;
  private readonly _isFailure: (err: unknown) => boolean;

  private _failureThreshold: number;
  private _successThreshold: number;
  private _resetTimeoutMs: number;
  private _windowMs: number;

  private _state = BreakerState.CLOSED;
  private _consecutiveFailures = 0;
  private _consecutiveSuccesses = 0;
  private _openedAt = 0;
  private _lastStateChangeAt = 0;
  private _lastFailureAt = 0;
  private _probesInFlight = 0;

  /** Ring of recent failure timestamps for window accounting. */
  private _failureTimes: number[] = [];
  private _failureHead = 0;

  private _totalCalls = 0;
  private _totalFailures = 0;
  private _totalRejections = 0;

  private readonly _listeners: BreakerEventListener[] = [];

  constructor(endpoint: string, config: EndpointBreakerConfig = {}) {
    this.endpoint = endpoint;
    this._clock = config.clock ?? new SystemEngineClock();
    this._failureThreshold = Math.max(1, config.failureThreshold ?? 5);
    this._successThreshold = Math.max(1, config.successThreshold ?? 2);
    this._resetTimeoutMs = Math.max(0, config.resetTimeoutMs ?? 30_000);
    this._windowMs = Math.max(0, config.windowMs ?? 0);
    this._isFailure = config.isFailure ?? (() => true);
    this._lastStateChangeAt = this._clock.now();
  }

  /* ---------------------------------------------------------------- */
  /* Execution                                                         */
  /* ---------------------------------------------------------------- */

  /**
   * Run `op` through the breaker. In OPEN state the call is rejected
   * with `CircuitRejectionError` unless the reset timeout elapsed, in
   * which case this call becomes the probe. In HALF_OPEN one call is
   * admitted at a time (others rejected).
   */
  async execute<T>(op: () => Promise<T> | T): Promise<T> {
    this._admit();
    this._totalCalls++;
    try {
      const result = await op();
      this.recordSuccess();
      return result;
    } catch (err: unknown) {
      if (this._isFailure(err)) this.recordFailure();
      else this.recordSuccess(); // non-fault errors still release the probe
      throw err;
    }
  }

  /**
   * Admit a call without executing anything (for callers that own the
   * invocation). Throws `CircuitRejectionError` when not admitted.
   * MUST be paired with `recordSuccess`/`recordFailure`.
   */
  admit(): void {
    this._admit();
    this._totalCalls++;
  }

  /**
   * Try to admit a half-open probe. Returns `false` when the probe
   * budget is already consumed — used by `ProbeScheduler` to arbitrate
   * probes without throwing.
   */
  tryAcquireProbe(): boolean {
    try {
      this._admit();
      this._totalCalls++;
      return true;
    } catch {
      return false;
    }
  }

  /* ---------------------------------------------------------------- */
  /* Outcome recording                                                 */
  /* ---------------------------------------------------------------- */

  recordSuccess(): void {
    if (this._state === BreakerState.HALF_OPEN) {
      this._releaseProbe();
      this._consecutiveSuccesses++;
      if (this._consecutiveSuccesses >= this._successThreshold) {
        this._transition(BreakerState.CLOSED);
        this._consecutiveFailures = 0;
        this._clearWindow();
      }
    } else {
      this._consecutiveFailures = 0;
      this._consecutiveSuccesses++;
    }
    this._emit('success');
  }

  recordFailure(): void {
    const now = this._clock.now();
    this._totalFailures++;
    this._lastFailureAt = now;
    this._pushFailureTime(now);

    if (this._state === BreakerState.HALF_OPEN) {
      this._releaseProbe();
      // One failed probe → straight back to open.
      this._transition(BreakerState.OPEN);
      this._consecutiveSuccesses = 0;
    } else {
      this._consecutiveSuccesses = 0;
      this._consecutiveFailures++;
      if (this._state === BreakerState.CLOSED && this._effectiveFailures() >= this._failureThreshold) {
        this._transition(BreakerState.OPEN);
      }
    }
    this._emit('failure');
  }

  /* ---------------------------------------------------------------- */
  /* State                                                             */
  /* ---------------------------------------------------------------- */

  get state(): BreakerState {
    this._maybeHalfOpen();
    return this._state;
  }

  /** Milliseconds until the next probe is allowed; 0 when not open. */
  msUntilProbe(): number {
    if (this._state !== BreakerState.OPEN) return 0;
    const elapsed = this._clock.now() - this._openedAt;
    return Math.max(0, this._resetTimeoutMs - elapsed);
  }

  stats(): BreakerStats {
    return {
      state: this.state,
      consecutiveFailures: this._consecutiveFailures,
      consecutiveSuccesses: this._consecutiveSuccesses,
      totalCalls: this._totalCalls,
      totalFailures: this._totalFailures,
      totalRejections: this._totalRejections,
      lastFailureAt: this._lastFailureAt,
      lastStateChangeAt: this._lastStateChangeAt,
    };
  }

  /* ---------------------------------------------------------------- */
  /* Auto-tuning surface                                               */
  /* ---------------------------------------------------------------- */

  /** Adjust thresholds (used by `AutoTuner`); values are clamped ≥1/0. */
  tune(cfg: { failureThreshold?: number; resetTimeoutMs?: number; successThreshold?: number }): void {
    if (cfg.failureThreshold !== undefined) {
      this._failureThreshold = Math.max(1, Math.round(cfg.failureThreshold));
    }
    if (cfg.resetTimeoutMs !== undefined) {
      this._resetTimeoutMs = Math.max(0, Math.round(cfg.resetTimeoutMs));
    }
    if (cfg.successThreshold !== undefined) {
      this._successThreshold = Math.max(1, Math.round(cfg.successThreshold));
    }
  }

  currentConfig(): { failureThreshold: number; resetTimeoutMs: number; successThreshold: number } {
    return {
      failureThreshold: this._failureThreshold,
      resetTimeoutMs: this._resetTimeoutMs,
      successThreshold: this._successThreshold,
    };
  }

  /* ---------------------------------------------------------------- */
  /* Snapshots                                                         */
  /* ---------------------------------------------------------------- */

  snapshot(): BreakerStateSnapshot {
    return {
      endpoint: this.endpoint,
      state: this.state,
      consecutiveFailures: this._consecutiveFailures,
      consecutiveSuccesses: this._consecutiveSuccesses,
      totalCalls: this._totalCalls,
      totalFailures: this._totalFailures,
      totalRejections: this._totalRejections,
      lastFailureAt: this._lastFailureAt,
      openedAt: this._openedAt,
    };
  }

  /** Restore a snapshot taken earlier (used on process restart). */
  restore(s: BreakerStateSnapshot): void {
    this._state = s.state;
    this._consecutiveFailures = s.consecutiveFailures;
    this._consecutiveSuccesses = s.consecutiveSuccesses;
    this._totalCalls = s.totalCalls;
    this._totalFailures = s.totalFailures;
    this._totalRejections = s.totalRejections;
    this._lastFailureAt = s.lastFailureAt;
    this._openedAt = s.openedAt;
    this._lastStateChangeAt = this._clock.now();
  }

  /** Manually force a state (ops tooling / kill path). */
  force(state: BreakerState): void {
    if (state === BreakerState.OPEN) this._openedAt = this._clock.now();
    this._transition(state);
  }

  onEvent(listener: BreakerEventListener): () => void {
    this._listeners.push(listener);
    return () => {
      const i = this._listeners.indexOf(listener);
      if (i >= 0) this._listeners.splice(i, 1);
    };
  }

  /* ---------------------------------------------------------------- */
  /* Internals                                                         */
  /* ---------------------------------------------------------------- */

  private _admit(): void {
    this._maybeHalfOpen();
    switch (this._state) {
      case BreakerState.CLOSED:
        return;
      case BreakerState.OPEN:
        this._totalRejections++;
        throw new CircuitRejectionError(this.endpoint, this.msUntilProbe());
      case BreakerState.HALF_OPEN:
        if (this._probesInFlight >= this._successThreshold) {
          this._totalRejections++;
          throw new CircuitRejectionError(this.endpoint, 0);
        }
        this._probesInFlight++;
        return;
    }
  }

  private _releaseProbe(): void {
    if (this._probesInFlight > 0) this._probesInFlight--;
  }

  private _maybeHalfOpen(): void {
    if (this._state === BreakerState.OPEN && this.msUntilProbe() === 0) {
      this._transition(BreakerState.HALF_OPEN);
      this._consecutiveSuccesses = 0;
    }
  }

  private _transition(next: BreakerState): void {
    if (this._state === next) return;
    this._state = next;
    const now = this._clock.now();
    this._lastStateChangeAt = now;
    if (next === BreakerState.OPEN) {
      this._openedAt = now;
      this._probesInFlight = 0;
    }
    this._emit('state-change');
  }

  /* Failure window -------------------------------------------------- */

  private _pushFailureTime(t: number): void {
    this._failureTimes.push(t);
    this._compactWindow();
  }

  private _clearWindow(): void {
    this._failureTimes = [];
    this._failureHead = 0;
  }

  /** Drop failure timestamps older than the window. Amortized O(1). */
  private _compactWindow(): void {
    if (this._windowMs <= 0) {
      this._clearWindow();
      return;
    }
    const cutoff = this._clock.now() - this._windowMs;
    while (this._failureHead < this._failureTimes.length && this._failureTimes[this._failureHead] < cutoff) {
      this._failureHead++;
    }
    // Physically shrink when the dead prefix is large.
    if (this._failureHead > 64 && this._failureHead * 2 >= this._failureTimes.length) {
      this._failureTimes = this._failureTimes.slice(this._failureHead);
      this._failureHead = 0;
    }
  }

  /** Failures counted toward the threshold (windowed or consecutive). */
  private _effectiveFailures(): number {
    if (this._windowMs <= 0) return this._consecutiveFailures;
    this._compactWindow();
    return this._failureTimes.length - this._failureHead;
  }

  private _emit(event: 'failure' | 'success' | 'state-change'): void {
    for (const l of this._listeners) l(this.endpoint, event);
  }
}
