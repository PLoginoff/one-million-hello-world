/**
 * Service Health Probe — active upstream probing that feeds circuit
 * recovery.
 *
 * An open circuit shouldn't stay open on a timer alone — the upstream
 * might recover at any moment. This module actively probes endpoints:
 * on a schedule (or when a breaker half-opens) it issues a lightweight
 * `ping` against each upstream and feeds the outcome into the
 * {@link CircuitRegistry}, accelerating `open → half_open → closed`
 * transitions and preventing half-open probes from being wasted on
 * still-dead upstreams.
 *
 * Probe policy:
 *   - When `endpoint.state === 'open'` and cooldown elapsed, schedule
 *     a probe. A success drives a `half_open → closed` transition via
 *     the registry (record a success).
 *   - Consecutive probe failures increase the backoff exponentially —
 *     aggressive probing of a dead upstream wastes resources.
 *   - Probes are `ping()` calls (lighter than real traffic); they never
 *     count toward the endpoint's failure window — that's what the
 *     half-open probe slot is for.
 *
 * @module ServiceLayer/Engine
 */

import { CircuitRegistry } from './CircuitPropagation';
import { Clock, SystemClock } from './TransactionScriptRunner';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A probe result the registry can consume. */
export type ProbeOutcome = 'success' | 'failure' | 'timeout';

/** Prober per-endpoint state. */
interface ProbeState {
  /** Current backoff delay (ms) between probes. */
  backoffMs: number;
  /** Whether a probe is in-flight. */
  inFlight: boolean;
  /** Consecutive failed probes — drives backoff. */
  consecutiveFailures: number;
  /** Last probe timestamp (ms); -1 = never probed (0 is a valid time). */
  lastProbeMs: number;
}

/** Options for {@link ServiceHealthProbe}. */
export interface HealthProbeOptions {
  readonly clock?: Clock;
  /** Base backoff between probes (ms). */
  readonly baseBackoffMs?: number;
  /** Max backoff cap (ms). */
  readonly maxBackoffMs?: number;
  /** Per-probe timeout (ms). */
  readonly probeTimeoutMs?: number;
  /** Backoff growth factor per consecutive failure. */
  readonly backoffFactor?: number;
}

/** One probe's result record. */
export interface ProbeReport {
  readonly endpoint: string;
  readonly outcome: ProbeOutcome;
  readonly probeMs: number;
  readonly newState: string;
  readonly backoffMs: number;
}

// ---------------------------------------------------------------------------
// Engine
// ---------------------------------------------------------------------------

/**
 * Active health prober.
 *
 * `run(registry, ping)` probes every endpoint whose circuit is open or
 * half-open. A `ping` is the caller's lightweight health check —
 * typically `HEAD /health` with a short timeout.
 *
 * The prober is passive between calls: no timers, no background loop.
 * The caller decides when to `run` (a scheduler invokes it
 * periodically, or a service layer invokes it before dispatching).
 */
export class ServiceHealthProbe {
  private readonly _states: Map<string, ProbeState>;
  private readonly _clock: Clock;
  private readonly _baseBackoffMs: number;
  private readonly _maxBackoffMs: number;
  private readonly _probeTimeoutMs: number;
  private readonly _backoffFactor: number;
  private _probesRun: number;

  constructor(options?: HealthProbeOptions) {
    this._states = new Map();
    this._clock = options?.clock ?? new SystemClock();
    this._baseBackoffMs = options?.baseBackoffMs ?? 1000;
    this._maxBackoffMs = options?.maxBackoffMs ?? 30_000;
    this._probeTimeoutMs = options?.probeTimeoutMs ?? 5000;
    this._backoffFactor = options?.backoffFactor ?? 2;
    this._probesRun = 0;
  }

  /** Total probes executed. */
  get probesRun(): number {
    return this._probesRun;
  }

  /**
   * Probe all unhealthy endpoints in `registry`.
   *
   * For each endpoint that's open (and past its cooldown) or half-open
   * and not already in-flight, issue `ping(name)`. On success the
   * registry records a success — driving the breaker's half-open probe
   * to close. Failures backoff exponentially.
   */
  async run(
    registry: CircuitRegistry,
    ping: (endpoint: string, timeoutMs: number) => Promise<ProbeOutcome>
  ): Promise<readonly ProbeReport[]> {
    const reports: ProbeReport[] = [];
    const endpoints = registry.allHealth();
    for (const ep of endpoints) {
      if (ep.state === 'closed') {
        // Healthy — reset the endpoint's probe state.
        this._states.delete(ep.name);
        continue;
      }
      const state = this._states.get(ep.name) ?? {
        backoffMs: this._baseBackoffMs,
        inFlight: false,
        consecutiveFailures: 0,
        lastProbeMs: -1,
      };
      this._states.set(ep.name, state);
      if (state.inFlight) {
        continue;
      }
      // Backoff gating: skip if not enough time since the last probe.
      const since = this._clock.now() - state.lastProbeMs;
      if (state.lastProbeMs >= 0 && since < state.backoffMs) {
        continue;
      }

      state.inFlight = true;
      state.lastProbeMs = this._clock.now();
      const started = this._clock.now();
      let outcome: ProbeOutcome;
      try {
        outcome = await ping(ep.name, this._probeTimeoutMs);
      } catch {
        outcome = 'failure';
      }
      const probeMs = this._clock.now() - started;
      state.inFlight = false;
      this._probesRun += 1;

      // Feed the outcome into the registry.
      const endpoint = registry.endpoint(ep.name);
      if (outcome === 'success') {
        state.consecutiveFailures = 0;
        state.backoffMs = this._baseBackoffMs;
        endpoint.record('success');
      } else {
        state.consecutiveFailures += 1;
        state.backoffMs = Math.min(
          this._maxBackoffMs,
          Math.round(this._baseBackoffMs * Math.pow(this._backoffFactor, state.consecutiveFailures))
        );
        endpoint.record(outcome === 'timeout' ? 'timeout' : 'failure');
      }

      reports.push({
        endpoint: ep.name,
        outcome,
        probeMs,
        newState: endpoint.state,
        backoffMs: state.backoffMs,
      });
    }
    return reports;
  }

  /** Current probe state for an endpoint (diagnostics). */
  stateOf(endpoint: string): ProbeState | undefined {
    const s = this._states.get(endpoint);
    return s === undefined ? undefined : { ...s };
  }
}
