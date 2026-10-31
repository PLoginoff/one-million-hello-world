/**
 * Circuit State Propagation — shared circuit health across services.
 *
 * A service-to-service call carries the *caller's* circuit state so a
 * downstream service can make smarter decisions: if the upstream is
 * already degraded, the callee can shed load, return a cached fallback,
 * or open its own breaker preemptively instead of compounding latency.
 *
 * Model: each service endpoint has a `CircuitEndpoint` tracking its
 * rolling failure window (sliding counters, not a leaky bucket — we
 * want exact per-window ratios). The `CircuitRegistry` links endpoints
 * into a propagation graph: an edge `A → B` means "when A is unhealthy,
 * B's calls to A should see the degraded state".
 *
 * Propagation is *pull*, not push: `effectiveState(B)` computes B's own
 * health AND-worst-cased with the states of everything B depends on.
 * One unhealthy upstream can degrade a whole subtree — the cascading-
 * failure mirror circuit breakers exist to prevent.
 *
 * @module ServiceLayer/Engine
 */

import { Clock, SystemClock } from './TransactionScriptRunner';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Health states — ordered by severity for the AND-worst merge. */
export type CircuitState = 'closed' | 'half_open' | 'open';

/** Rolling window config. */
export interface WindowConfig {
  /** Window length (ms). */
  readonly windowMs: number;
  /** Min samples before the window can trip the breaker. */
  readonly minSamples: number;
  /** Failure ratio in [0,1] above which the circuit opens. */
  readonly failureThreshold: number;
}

/** Call outcome for window accounting. */
export type CallOutcome = 'success' | 'failure' | 'timeout';

/** Snapshot of one endpoint's health. */
export interface EndpointHealth {
  readonly name: string;
  readonly state: CircuitState;
  readonly windowSamples: number;
  readonly windowFailures: number;
  readonly failureRatio: number;
  readonly lastStateChangeMs: number;
}

/** Snapshot propagated through the graph. */
export interface PropagatedHealth {
  /** Service's own state (no upstreams). */
  readonly self: EndpointHealth;
  /** Worst-cased state including upstreams. */
  readonly effective: CircuitState;
  /** Names of upstreams contributing to `effective` (open/half-open). */
  readonly degradedBy: readonly string[];
}

// ---------------------------------------------------------------------------
// Endpoint
// ---------------------------------------------------------------------------

const STATE_ORDER: Record<CircuitState, number> = { closed: 0, half_open: 1, open: 2 };

function worst(a: CircuitState, b: CircuitState): CircuitState {
  return STATE_ORDER[a] >= STATE_ORDER[b] ? a : b;
}

/**
 * One service endpoint's circuit — rolling-window failure accounting
 * with half-open probes.
 *
 * State transitions:
 *   closed  ──(ratio > threshold, samples ≥ min)──► open
 *   open    ──(cooldownMs elapsed)──► half_open   (one probe allowed)
 *   half_open ──(probe ok)──► closed / ──(probe fails)──► open
 */
export class CircuitEndpoint {
  readonly name: string;
  private readonly _windowMs: number;
  private readonly _minSamples: number;
  private readonly _threshold: number;
  private readonly _cooldownMs: number;
  private readonly _clock: Clock;
  /** (timestamp, was-failure) ring — the rolling window. */
  private _samples: Array<{ atMs: number; failure: boolean }>;
  private _state: CircuitState;
  private _openedAtMs: number;
  private _stateChangedMs: number;
  private _probing: boolean;

  constructor(name: string, config: WindowConfig & { cooldownMs: number }, clock: Clock) {
    this.name = name;
    this._windowMs = config.windowMs;
    this._minSamples = config.minSamples;
    this._threshold = config.failureThreshold;
    this._cooldownMs = config.cooldownMs;
    this._clock = clock;
    this._samples = [];
    this._state = 'closed';
    this._openedAtMs = 0;
    this._stateChangedMs = clock.now();
    this._probing = false;
  }

  get state(): CircuitState {
    // Open → half_open after cooldown, lazily on read.
    if (this._state === 'open' && this._clock.now() - this._openedAtMs >= this._cooldownMs) {
      this.transition('half_open');
    }
    return this._state;
  }

  /**
   * Record one call outcome. Callers should `guard()` first — this
   * method accounts for the outcome after a permitted call.
   */
  record(outcome: CallOutcome): void {
    const now = this._clock.now();
    const failure = outcome !== 'success';
    this._samples.push({ atMs: now, failure });
    this.evictOlderThan(now - this._windowMs);

    if (this._state === 'half_open') {
      if (failure) {
        this.transition('open');
      } else {
        this.transition('closed');
        this._probing = false;
      }
      return;
    }

    if (this._state === 'closed') {
      const { total, failures } = this.windowCounts();
      if (total >= this._minSamples && failures / total > this._threshold) {
        this.transition('open');
      }
    }
  }

  /**
   * Whether a call should be admitted right now.
   * half_open admits exactly one probe until it resolves.
   */
  guard(): boolean {
    const s = this.state;
    if (s === 'closed') {
      return true;
    }
    if (s === 'open') {
      return false;
    }
    // half_open: one probe at a time.
    if (this._probing) {
      return false;
    }
    this._probing = true;
    return true;
  }

  /** Window counters (post-eviction). */
  windowCounts(): { total: number; failures: number } {
    this.evictOlderThan(this._clock.now() - this._windowMs);
    let failures = 0;
    for (const s of this._samples) {
      if (s.failure) {
        failures += 1;
      }
    }
    return { total: this._samples.length, failures };
  }

  health(): EndpointHealth {
    const { total, failures } = this.windowCounts();
    return {
      name: this.name,
      state: this.state,
      windowSamples: total,
      windowFailures: failures,
      failureRatio: total === 0 ? 0 : failures / total,
      lastStateChangeMs: this._stateChangedMs,
    };
  }

  private transition(next: CircuitState): void {
    if (next === this._state) {
      return;
    }
    this._state = next;
    this._stateChangedMs = this._clock.now();
    if (next === 'open') {
      this._openedAtMs = this._clock.now();
      this._probing = false;
    }
    if (next === 'closed') {
      this._samples = [];
      this._probing = false;
    }
  }

  private evictOlderThan(cutoffMs: number): void {
    // Samples are append-ordered — drop the prefix below the cutoff.
    let i = 0;
    while (i < this._samples.length && this._samples[i].atMs < cutoffMs) {
      i++;
    }
    if (i > 0) {
      this._samples.splice(0, i);
    }
  }
}

// ---------------------------------------------------------------------------
// Registry (propagation graph)
// ---------------------------------------------------------------------------

/** Options for {@link CircuitRegistry}. */
export interface CircuitRegistryOptions {
  readonly clock?: Clock;
}

/**
 * Propagation graph over endpoints.
 *
 * `dependOn(consumer, upstream)` records that `consumer` calls
 * `upstream`; `effectiveState(consumer)` merges the consumer's own
 * state with its transitive upstreams' — worst-case wins.
 *
 * Cycle safety: the transitive walk uses a visited set, so `A→B→A`
 * doesn't loop.
 */
export class CircuitRegistry {
  private readonly _endpoints: Map<string, CircuitEndpoint>;
  private readonly _edges: Map<string, Set<string>>;
  private readonly _clock: Clock;

  constructor(options?: CircuitRegistryOptions) {
    this._endpoints = new Map();
    this._edges = new Map();
    this._clock = options?.clock ?? new SystemClock();
  }

  /** Register an endpoint. */
  register(endpoint: CircuitEndpoint): this {
    this._endpoints.set(endpoint.name, endpoint);
    return this;
  }

  /** Get or create an endpoint with default config. */
  endpoint(name: string, config?: WindowConfig & { cooldownMs: number }): CircuitEndpoint {
    const existing = this._endpoints.get(name);
    if (existing !== undefined) {
      return existing;
    }
    const ep = new CircuitEndpoint(
      name,
      config ?? { windowMs: 10_000, minSamples: 5, failureThreshold: 0.5, cooldownMs: 30_000 },
      this._clock
    );
    this._endpoints.set(name, ep);
    return ep;
  }

  /** `consumer` depends on `upstream` — upstream health propagates. */
  dependOn(consumer: string, upstream: string): this {
    const set = this._edges.get(consumer) ?? new Set();
    set.add(upstream);
    this._edges.set(consumer, set);
    return this;
  }

  /**
   * Effective state for `name` — its own state merged with the worst
   * transitive upstream. `degradedBy` lists the upstreams contributing.
   */
  effectiveState(name: string): PropagatedHealth {
    const endpoint = this._endpoints.get(name);
    const self: EndpointHealth = endpoint?.health() ?? {
      name,
      state: 'closed',
      windowSamples: 0,
      windowFailures: 0,
      failureRatio: 0,
      lastStateChangeMs: 0,
    };

    let effective = self.state;
    const degradedBy: string[] = [];
    const visited = new Set<string>([name]);
    const queue = [...(this._edges.get(name) ?? [])];

    while (queue.length > 0) {
      const up = queue.shift();
      if (up === undefined || visited.has(up)) {
        continue;
      }
      visited.add(up);
      const upEp = this._endpoints.get(up);
      if (upEp === undefined) {
        continue;
      }
      const upState = upEp.state;
      effective = worst(effective, upState);
      if (upState !== 'closed') {
        degradedBy.push(up);
      }
      for (const next of this._edges.get(up) ?? []) {
        if (!visited.has(next)) {
          queue.push(next);
        }
      }
    }

    return { self, effective, degradedBy };
  }

  /** Snapshot of every endpoint's health. */
  allHealth(): readonly EndpointHealth[] {
    return [...this._endpoints.values()].map((e) => e.health());
  }

  /** Direct upstreams of `name`. */
  upstreams(name: string): readonly string[] {
    return [...(this._edges.get(name) ?? [])];
  }
}
