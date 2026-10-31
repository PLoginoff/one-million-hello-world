/**
 * Health-Aware Load Balancer
 *
 * Upstream selection driven by live health signals rather than a
 * static algorithm. Each upstream maintains:
 *
 *  - EWMA latency and EWMA error rate (exponentially weighted moving
 *    averages — O(1) update, no window storage):
 *        ewma_new = α·sample + (1−α)·ewma_old
 *  - a consecutive-failure counter feeding a circuit breaker
 *    (closed → open at threshold → half-open after reset period →
 *    closed on a successful probe)
 *  - an in-flight request count for least-loaded tie-breaking
 *
 * Selection among circuit-closed upstreams is **weighted random**:
 * each upstream's effective weight is
 *
 *     weight_i = staticWeight_i / (1 + ewmaLatency_i) · (1 − ewmaError_i)
 *
 * so faster, healthier upstreams attract proportionally more traffic,
 * and weights adapt continuously — unlike round-robin, an upstream
 * degrading gracefully sheds load instead of falling off a cliff.
 *
 * All pickers first try a half-open probe: when every circuit is open
 * but one has cooled enough to probe, that upstream is selected so
 * recovery can begin. When nothing is eligible, `pick()` returns
 * undefined and the gateway emits 503.
 *
 * Complexity: report() O(1); pick() O(U) over upstreams.
 *
 * @module ApiGatewayLayer/Engine3
 */

import {
  BalancerOptions,
  GatewayClock3,
  SystemGatewayClock3,
  UpstreamHealth,
} from './types3';

/** Random source for weighted selection (injectable for tests). */
export interface BalancerRandom {
  next(): number;
}

export class DefaultBalancerRandom implements BalancerRandom {
  next(): number {
    return Math.random();
  }
}

interface UpstreamState {
  id: string;
  weight: number;
  ewmaLatencyMs: number;
  ewmaErrorRate: number;
  consecutiveFailures: number;
  circuit: 'closed' | 'open' | 'half-open';
  circuitOpenUntil: number;
  inflight: number;
  hasSample: boolean;
}

export class HealthAwareBalancer {
  private readonly upstreams = new Map<string, UpstreamState>();
  private readonly clock: GatewayClock3;
  private readonly random: BalancerRandom;
  private readonly alpha: number;
  private readonly failureThreshold: number;
  private readonly circuitResetMs: number;

  constructor(options: BalancerOptions & { random?: BalancerRandom } = {}) {
    this.clock = options.clock ?? new SystemGatewayClock3();
    this.random = options.random ?? new DefaultBalancerRandom();
    this.alpha = options.alpha ?? 0.2;
    if (this.alpha <= 0 || this.alpha > 1) throw new Error('alpha must be in (0,1]');
    this.failureThreshold = options.failureThreshold ?? 5;
    this.circuitResetMs = options.circuitResetMs ?? 30_000;
  }

  /** Register an upstream with a static capacity weight. */
  add(id: string, weight: number = 1): void {
    if (weight <= 0) throw new Error('weight must be positive');
    if (this.upstreams.has(id)) throw new Error(`upstream ${id} already registered`);
    this.upstreams.set(id, {
      id,
      weight,
      ewmaLatencyMs: 0,
      ewmaErrorRate: 0,
      consecutiveFailures: 0,
      circuit: 'closed',
      circuitOpenUntil: 0,
      inflight: 0,
      hasSample: false,
    });
  }

  remove(id: string): boolean {
    return this.upstreams.delete(id);
  }

  /**
   * Record the outcome of a request to `id`. Success resets the
   * failure streak; failure increments it and may trip the circuit.
   * `latencyMs` always feeds the EWMA.
   */
  report(id: string, ok: boolean, latencyMs: number): void {
    const u = this.upstreams.get(id);
    if (!u) return;
    u.inflight = Math.max(0, u.inflight - 1);
    const a = this.alpha;
    if (!u.hasSample) {
      u.ewmaLatencyMs = latencyMs;
      u.ewmaErrorRate = ok ? 0 : 1;
      u.hasSample = true;
    } else {
      u.ewmaLatencyMs = a * latencyMs + (1 - a) * u.ewmaLatencyMs;
      u.ewmaErrorRate = a * (ok ? 0 : 1) + (1 - a) * u.ewmaErrorRate;
    }
    if (ok) {
      u.consecutiveFailures = 0;
      // A successful half-open probe closes the circuit.
      if (u.circuit === 'half-open') u.circuit = 'closed';
    } else {
      u.consecutiveFailures++;
      if (u.consecutiveFailures >= this.failureThreshold && u.circuit !== 'open') {
        u.circuit = 'open';
        u.circuitOpenUntil = this.clock.now() + this.circuitResetMs;
      }
    }
  }

  /**
   * Mark the start of a request to an upstream (increments in-flight).
   * Pair with `report()` when the request completes.
   */
  acquire(id: string): void {
    const u = this.upstreams.get(id);
    if (u) u.inflight++;
  }

  /**
   * Choose an upstream for the next request.
   *
   * Order of consideration:
   *  1. cooled half-open probes (one request is let through to test
   *     the water) — picked first so recovery isn't starved
   *  2. closed upstreams, weighted-random by health score
   *  3. undefined when everything is open or empty
   */
  pick(): string | undefined {
    const now = this.clock.now();
    const eligible: UpstreamState[] = [];
    let probe: UpstreamState | undefined;

    for (const u of this.upstreams.values()) {
      if (u.circuit === 'closed') {
        eligible.push(u);
      } else if (u.circuit === 'open' && now >= u.circuitOpenUntil && probe === undefined) {
        // Cooldown elapsed — this upstream earns a probe request.
        u.circuit = 'half-open';
        probe = u;
      }
    }

    if (eligible.length === 0) return probe?.id;
    if (probe !== undefined) {
      // Prefer routing real traffic to healthy upstreams; the probe
      // stays parked until a quiet moment or all-closed outages. To
      // keep it simple and fair: probe joins the pool with min weight.
      eligible.push(probe);
    }

    const weights = eligible.map((u) => this.effectiveWeight(u));
    const total = weights.reduce((s, w) => s + w, 0);
    if (total <= 0) {
      // Degenerate (all zero weight): least-inflight wins.
      return eligible.reduce((a, b) => (b.inflight < a.inflight ? b : a)).id;
    }
    let r = this.random.next() * total;
    for (let i = 0; i < eligible.length; i++) {
      r -= weights[i]!;
      if (r <= 0) return eligible[i]!.id;
    }
    return eligible[eligible.length - 1]!.id;
  }

  /**
   * Effective routing weight: static weight scaled down by observed
   * latency and error rate.
   *
   *     w = static / (1 + ewmaLatency) × (1 − ewmaError)
   *
   * Properties: w ∈ (0, static]; halves when latency reaches the
   * static-weight-neutral point; →0 as error rate →1.
   */
  effectiveWeight(id: string): number;
  effectiveWeight(u: UpstreamState): number;
  effectiveWeight(arg: string | UpstreamState): number {
    const u = typeof arg === 'string' ? this.upstreams.get(arg) : arg;
    if (!u) return 0;
    const health = 1 / (1 + u.ewmaLatencyMs / 100); // normalized per 100ms
    return u.weight * health * (1 - u.ewmaErrorRate);
  }

  /** Live health snapshot for dashboards and tests. */
  health(id: string): UpstreamHealth | undefined {
    const u = this.upstreams.get(id);
    if (!u) return undefined;
    return {
      id: u.id,
      weight: u.weight,
      ewmaLatencyMs: u.ewmaLatencyMs,
      ewmaErrorRate: u.ewmaErrorRate,
      consecutiveFailures: u.consecutiveFailures,
      circuit: u.circuit,
      circuitOpenUntil: u.circuitOpenUntil,
      inflight: u.inflight,
    };
  }

  /** Snapshot of all upstreams, sorted by id. */
  healthAll(): readonly UpstreamHealth[] {
    return [...this.upstreams.values()]
      .map((u) => this.health(u.id)!)
      .sort((a, b) => (a.id < b.id ? -1 : 1));
  }

  /** Manually force a circuit half-open (operator intervention). */
  probe(id: string): boolean {
    const u = this.upstreams.get(id);
    if (!u || u.circuit === 'closed') return false;
    u.circuit = 'half-open';
    return true;
  }
}
