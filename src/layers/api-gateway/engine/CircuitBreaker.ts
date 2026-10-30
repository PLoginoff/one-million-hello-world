/**
 * Circuit Breaker
 *
 * Classic three-state breaker per upstream:
 *
 *   CLOSED  --(failures >= threshold)--> OPEN
 *   OPEN    --(openDuration elapsed)---> HALF_OPEN
 *   HALF_OPEN --(probe success)--> CLOSED
 *             --(probe failure)--> OPEN (timer restarts)
 *
 * Only failure counts inside a sliding window matter: successes reset
 * the consecutive-failure counter. Half-open admits at most
 * `halfOpenMaxCalls` concurrent probes; extra calls fail fast.
 *
 * @module ApiGatewayLayer/Engine
 */

import { CircuitBreakerConfig, CircuitState, GatewayClock, SystemGatewayClock } from './types';

export interface CircuitStats {
  readonly state: CircuitState;
  readonly consecutiveFailures: number;
  readonly openedAt?: number;
  readonly halfOpenInFlight: number;
  readonly halfOpenSuccesses: number;
  readonly totalFailures: number;
  readonly totalRejected: number;
}

interface Breaker {
  state: CircuitState;
  consecutiveFailures: number;
  openedAt: number;
  halfOpenInFlight: number;
  halfOpenSuccesses: number;
  totalFailures: number;
  totalRejected: number;
}

export class CircuitOpenError extends Error {
  readonly upstreamName: string;
  readonly retryAfterMs: number;
  constructor(upstreamName: string, retryAfterMs: number) {
    super(`Circuit open for upstream ${upstreamName}`);
    this.name = 'CircuitOpenError';
    this.upstreamName = upstreamName;
    this.retryAfterMs = retryAfterMs;
  }
}

/**
 * Registry of per-upstream circuit breakers.
 */
export class CircuitBreakerRegistry {
  private _breakers: Map<string, Breaker>;
  private _configs: Map<string, CircuitBreakerConfig>;
  private _default: CircuitBreakerConfig;
  private _clock: GatewayClock;
  private _listeners: Array<(name: string, from: CircuitState, to: CircuitState) => void>;

  constructor(defaultConfig?: CircuitBreakerConfig, clock?: GatewayClock) {
    this._breakers = new Map();
    this._configs = new Map();
    this._default = defaultConfig ?? {
      failureThreshold: 5,
      openDurationMs: 30_000,
      halfOpenMaxCalls: 1,
      halfOpenSuccessThreshold: 1,
    };
    this._clock = clock ?? new SystemGatewayClock();
    this._listeners = [];
  }

  /** Register a state-transition listener (for logging/metrics). */
  onTransition(fn: (name: string, from: CircuitState, to: CircuitState) => void): void {
    this._listeners.push(fn);
  }

  /** Override the config for one upstream. */
  configure(upstreamName: string, config: CircuitBreakerConfig): void {
    this._configs.set(upstreamName, config);
  }

  /**
   * Admit a call for `upstreamName`.
   * Throws CircuitOpenError when the circuit rejects the call.
   * Pair every successful admission with `onSuccess`/`onFailure`.
   */
  admit(upstreamName: string): void {
    const b = this._get(upstreamName);
    const cfg = this._configFor(upstreamName);
    const now = this._clock.now();

    if (b.state === 'open') {
      if (now - b.openedAt >= cfg.openDurationMs) {
        this._transition(upstreamName, b, 'half-open');
        b.halfOpenInFlight = 0;
        b.halfOpenSuccesses = 0;
      } else {
        b.totalRejected++;
        throw new CircuitOpenError(upstreamName, cfg.openDurationMs - (now - b.openedAt));
      }
    }

    if (b.state === 'half-open') {
      if (b.halfOpenInFlight >= cfg.halfOpenMaxCalls) {
        b.totalRejected++;
        throw new CircuitOpenError(upstreamName, 0);
      }
      b.halfOpenInFlight++;
      return;
    }
    // closed: admit
  }

  /** Record a successful upstream call. */
  onSuccess(upstreamName: string): void {
    const b = this._get(upstreamName);
    const cfg = this._configFor(upstreamName);
    if (b.state === 'half-open') {
      b.halfOpenInFlight = Math.max(0, b.halfOpenInFlight - 1);
      b.halfOpenSuccesses++;
      if (b.halfOpenSuccesses >= (cfg.halfOpenSuccessThreshold ?? 1)) {
        b.consecutiveFailures = 0;
        this._transition(upstreamName, b, 'closed');
      }
      return;
    }
    b.consecutiveFailures = 0;
  }

  /** Record a failed upstream call. */
  onFailure(upstreamName: string): void {
    const b = this._get(upstreamName);
    const cfg = this._configFor(upstreamName);
    b.totalFailures++;
    if (b.state === 'half-open') {
      b.halfOpenInFlight = Math.max(0, b.halfOpenInFlight - 1);
      this._transition(upstreamName, b, 'open');
      b.openedAt = this._clock.now();
      return;
    }
    b.consecutiveFailures++;
    if (b.consecutiveFailures >= cfg.failureThreshold) {
      this._transition(upstreamName, b, 'open');
      b.openedAt = this._clock.now();
    }
  }

  /** Current state for an upstream. */
  stats(upstreamName: string): CircuitStats {
    const b = this._get(upstreamName);
    return {
      state: b.state,
      consecutiveFailures: b.consecutiveFailures,
      openedAt: b.state === 'open' ? b.openedAt : undefined,
      halfOpenInFlight: b.halfOpenInFlight,
      halfOpenSuccesses: b.halfOpenSuccesses,
      totalFailures: b.totalFailures,
      totalRejected: b.totalRejected,
    };
  }

  /** Force a breaker closed (manual recovery). */
  reset(upstreamName: string): void {
    const b = this._get(upstreamName);
    b.consecutiveFailures = 0;
    b.halfOpenInFlight = 0;
    b.halfOpenSuccesses = 0;
    this._transition(upstreamName, b, 'closed');
  }

  private _get(name: string): Breaker {
    let b = this._breakers.get(name);
    if (!b) {
      b = {
        state: 'closed',
        consecutiveFailures: 0,
        openedAt: 0,
        halfOpenInFlight: 0,
        halfOpenSuccesses: 0,
        totalFailures: 0,
        totalRejected: 0,
      };
      this._breakers.set(name, b);
    }
    return b;
  }

  private _configFor(name: string): CircuitBreakerConfig {
    return this._configs.get(name) ?? this._default;
  }

  private _transition(name: string, b: Breaker, to: CircuitState): void {
    const from = b.state;
    if (from === to) return;
    b.state = to;
    for (const fn of this._listeners) {
      try {
        fn(name, from, to);
      } catch {
        // listeners must not break the breaker
      }
    }
  }
}
