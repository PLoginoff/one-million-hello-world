/**
 * IdpHealthMonitor — partner-IdP endpoint availability tracking.
 *
 * An IdP depends on partner endpoints (metadata URLs, JWKS endpoints,
 * SLO callbacks). When a partner degrades, federation fails for real
 * users — the monitor provides early warning via active probing plus
 * passive outcome recording.
 *
 * Model per endpoint:
 *   - health state machine: UNKNOWN → HEALTHY ⇄ DEGRADED ⇄ DOWN
 *   - rolling window of recent probe outcomes (last N)
 *   - state transitions driven by consecutive-failure and failure-ratio
 *     thresholds, not single samples (avoids flap)
 *   - EWMA latency per endpoint for trend detection
 *
 * Probing is a pluggable `EndpointProbe` — in tests an in-memory probe
 * feeds synthetic outcomes; in production it would HTTP HEAD the URL.
 *
 * @module IdentityProvider/Engine2
 */

// ------------------------------------------------------------------ types

export enum EndpointHealth {
  UNKNOWN = 'unknown',
  HEALTHY = 'healthy',
  DEGRADED = 'degraded',
  DOWN = 'down',
}

/** One registered endpoint. */
export interface MonitoredEndpoint {
  readonly id: string;
  /** Owning partner entityId. */
  readonly entityId: string;
  readonly url: string;
  /** Endpoint role for reporting. */
  readonly kind: 'sso' | 'slo' | 'jwks' | 'metadata' | 'token';
}

/** A single probe outcome. */
export interface ProbeResult {
  readonly ok: boolean;
  /** Response latency in ms (0 on failure). */
  readonly latencyMs: number;
  /** HTTP-ish status (0 = transport failure). */
  readonly status: number;
  readonly at: number;
}

/** Probe seam — production impl issues an HTTP request. */
export type EndpointProbe = (endpoint: MonitoredEndpoint) => Promise<ProbeResult>;

/** Monitor config. */
export interface HealthMonitorConfig {
  /** Rolling window size (samples kept per endpoint, default 20). */
  windowSize: number;
  /** Consecutive failures before DOWN (default 3). */
  downAfterConsecutive: number;
  /** Failure ratio in window before DEGRADED (default 0.3). */
  degradedRatio: number;
  /** Consecutive successes to recover DOWN→HEALTHY (default 2). */
  recoverAfterConsecutive: number;
  /** EWMA alpha for latency smoothing (default 0.3). */
  ewmaAlpha: number;
}

const DEFAULT_HEALTH_CONFIG: HealthMonitorConfig = {
  windowSize: 20,
  downAfterConsecutive: 3,
  degradedRatio: 0.3,
  recoverAfterConsecutive: 2,
  ewmaAlpha: 0.3,
};

/** Per-endpoint rollup. */
export interface EndpointStatus {
  readonly endpoint: MonitoredEndpoint;
  health: EndpointHealth;
  /** Rolling outcomes (newest last, bounded to windowSize). */
  samples: ProbeResult[];
  consecutiveFailures: number;
  consecutiveSuccesses: number;
  /** EWMA latency (undefined until first success). */
  ewmaLatencyMs?: number;
  lastProbeAt?: number;
}

// ------------------------------------------------------------------ monitor

export class IdpHealthMonitor {
  private readonly _config: HealthMonitorConfig;
  private readonly _endpoints = new Map<string, EndpointStatus>();
  private readonly _probe?: EndpointProbe;
  private readonly _now: () => number;

  constructor(config: Partial<HealthMonitorConfig> = {}, probe?: EndpointProbe, now: () => number = Date.now) {
    this._config = { ...DEFAULT_HEALTH_CONFIG, ...config };
    this._probe = probe;
    this._now = now;
  }

  /** Register an endpoint for monitoring. */
  watch(endpoint: MonitoredEndpoint): EndpointStatus {
    const status: EndpointStatus = {
      endpoint,
      health: EndpointHealth.UNKNOWN,
      samples: [],
      consecutiveFailures: 0,
      consecutiveSuccesses: 0,
    };
    this._endpoints.set(endpoint.id, status);
    return status;
  }

  unwatch(id: string): boolean {
    return this._endpoints.delete(id);
  }

  status(id: string): EndpointStatus | undefined {
    return this._endpoints.get(id);
  }

  /**
   * Record a probe result (active probe or passive observation) and
   * advance the health state machine.
   */
  record(id: string, result: ProbeResult): EndpointStatus {
    const st = this._endpoints.get(id);
    if (!st) throw new Error(`Endpoint '${id}' not monitored`);
    st.samples.push(result);
    if (st.samples.length > this._config.windowSize) st.samples.shift();
    st.lastProbeAt = result.at;

    if (result.ok) {
      st.consecutiveSuccesses++;
      st.consecutiveFailures = 0;
      st.ewmaLatencyMs =
        st.ewmaLatencyMs === undefined
          ? result.latencyMs
          : this._config.ewmaAlpha * result.latencyMs + (1 - this._config.ewmaAlpha) * st.ewmaLatencyMs;
    } else {
      st.consecutiveFailures++;
      st.consecutiveSuccesses = 0;
    }

    st.health = this._classify(st);
    return st;
  }

  /** Probe every watched endpoint (requires a configured probe fn). */
  async probeAll(): Promise<Map<string, ProbeResult>> {
    if (!this._probe) throw new Error('No probe configured');
    const results = new Map<string, ProbeResult>();
    for (const st of this._endpoints.values()) {
      try {
        const r = await this._probe(st.endpoint);
        results.set(st.endpoint.id, r);
        this.record(st.endpoint.id, r);
      } catch {
        const r: ProbeResult = { ok: false, latencyMs: 0, status: 0, at: this._now() };
        results.set(st.endpoint.id, r);
        this.record(st.endpoint.id, r);
      }
    }
    return results;
  }

  /**
   * State classification from the rolling window + consecutive counts.
   * Hysteresis: DOWN needs consecutive failures; recovery needs
   * consecutive successes — a single good sample never flaps us back.
   */
  private _classify(st: EndpointStatus): EndpointHealth {
    if (st.samples.length === 0) return EndpointHealth.UNKNOWN;
    if (st.consecutiveFailures >= this._config.downAfterConsecutive) return EndpointHealth.DOWN;
    if (st.health === EndpointHealth.DOWN) {
      return st.consecutiveSuccesses >= this._config.recoverAfterConsecutive ? EndpointHealth.HEALTHY : EndpointHealth.DOWN;
    }
    const failures = st.samples.filter((s) => !s.ok).length;
    const ratio = failures / st.samples.length;
    if (ratio >= this._config.degradedRatio) return EndpointHealth.DEGRADED;
    if (st.consecutiveSuccesses > 0 || st.samples.every((s) => s.ok)) return EndpointHealth.HEALTHY;
    return EndpointHealth.UNKNOWN;
  }

  /** Roll up per-partner health: worst-case across its endpoints. */
  partnerHealth(entityId: string): EndpointHealth {
    const order = [EndpointHealth.DOWN, EndpointHealth.DEGRADED, EndpointHealth.UNKNOWN, EndpointHealth.HEALTHY];
    let worst = EndpointHealth.HEALTHY;
    let any = false;
    for (const st of this._endpoints.values()) {
      if (st.endpoint.entityId !== entityId) continue;
      any = true;
      if (order.indexOf(st.health) < order.indexOf(worst)) worst = st.health;
    }
    return any ? worst : EndpointHealth.UNKNOWN;
  }

  /** Fleet summary for dashboards. */
  summary(): Record<EndpointHealth, number> {
    const out: Record<EndpointHealth, number> = {
      [EndpointHealth.UNKNOWN]: 0,
      [EndpointHealth.HEALTHY]: 0,
      [EndpointHealth.DEGRADED]: 0,
      [EndpointHealth.DOWN]: 0,
    };
    for (const st of this._endpoints.values()) out[st.health]++;
    return out;
  }
}
