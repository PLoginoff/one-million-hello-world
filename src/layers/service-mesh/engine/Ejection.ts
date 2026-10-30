/**
 * Recovery Probing & Ejection Registry
 *
 * `OutlierDetector` (HealthTracker.ts) ejects on consecutive 5xx and
 * re-admits when the ejection expires — but blind re-admission is what
 * makes flapping endpoints flap: an endpoint that still fails gets
 * re-ejected, waits out the backoff, re-admits, fails again.
 *
 * This module adds the missing half:
 *
 *   - `RecoveryProber` — after ejection expiry the endpoint enters a
 *     PROBING state: it receives at most `probeConcurrency` in-flight
 *     requests until `probeSuccesses` consecutive successes promote it
 *     back to HEALTHY. A probe failure re-ejects immediately with
 *     escalated backoff. This is the Envoy pattern (health-check +
 *     outlier interplay).
 *   - `EjectionRegistry` — cluster-wide ledger of who is ejected, why,
 *     and how much of the cluster is currently out (panic-mode metrics
 *     for dashboards).
 *
 * States: healthy → ejected → probing → healthy | ejected.
 *
 * @module ServiceMeshLayer/Engine
 */

import { IClock, SystemClock } from '../../observability/engine/signals';
import { RequestResult } from './HealthTracker';

export type HostState = 'healthy' | 'ejected' | 'probing';

export interface RecoveryConfig {
  /** Successes needed in probing to return to healthy. */
  readonly probeSuccesses: number;
  /** Max simultaneous probe requests. */
  readonly probeConcurrency: number;
  /** Backoff multiplier applied on re-ejection after a failed probe. */
  readonly backoffMultiplier: number;
}

const DEFAULTS: RecoveryConfig = {
  probeSuccesses: 2,
  probeConcurrency: 1,
  backoffMultiplier: 1.5,
};

interface HostRecovery {
  state: HostState;
  ejectedUntilMs: number;
  /** Consecutive probe successes in probing state. */
  probeOk: number;
  /** In-flight probe requests. */
  inflight: number;
  /** Lifetime ejections. */
  ejections: number;
}

export class RecoveryProber {
  private readonly _config: RecoveryConfig;
  private readonly _clock: IClock;
  private readonly _baseEjectionMs: number;
  private readonly _hosts = new Map<string, HostRecovery>();

  constructor(baseEjectionMs: number, clock: IClock = new SystemClock(), config: Partial<RecoveryConfig> = {}) {
    this._baseEjectionMs = baseEjectionMs;
    this._clock = clock;
    this._config = { ...DEFAULTS, ...config };
  }

  private _host(key: string): HostRecovery {
    let h = this._hosts.get(key);
    if (!h) {
      h = { state: 'healthy', ejectedUntilMs: 0, probeOk: 0, inflight: 0, ejections: 0 };
      this._hosts.set(key, h);
    }
    return h;
  }

  /**
   * Called by the OutlierDetector when it ejects `key` — the prober takes
   * over lifecycle management from here.
   */
  notifyEjected(key: string, untilMs: number): void {
    const h = this._host(key);
    h.state = 'ejected';
    h.ejectedUntilMs = untilMs;
    h.probeOk = 0;
    h.ejections++;
  }

  /**
   * Is `key` allowed to receive a request right now?
   * ejected → no. probing → only under probeConcurrency. healthy → yes.
   * Also drives the ejected → probing transition when the ejection expires.
   */
  allows(key: string): boolean {
    const h = this._host(key);
    const now = this._clock.nowMs();
    if (h.state === 'ejected') {
      if (now < h.ejectedUntilMs) return false;
      h.state = 'probing';
      h.probeOk = 0;
    }
    if (h.state === 'probing') {
      return h.inflight < this._config.probeConcurrency;
    }
    return true;
  }

  /** Acquire a probe slot; call `release` via recordProbeResult. */
  acquireProbe(key: string): boolean {
    if (!this.allows(key)) return false;
    const h = this._host(key);
    if (h.state === 'probing') h.inflight++;
    return true;
  }

  /**
   * Report the probe request's result.
   * Success → probeOk++; reaching probeSuccesses promotes to healthy.
   * Failure → immediate re-ejection with multiplied backoff.
   */
  recordProbeResult(key: string, result: RequestResult): HostState {
    const h = this._host(key);
    h.inflight = Math.max(0, h.inflight - 1);
    if (h.state !== 'probing') return h.state;

    const ok = result === 'success' || result === 'error-4xx';
    if (ok) {
      h.probeOk++;
      if (h.probeOk >= this._config.probeSuccesses) {
        h.state = 'healthy';
        h.probeOk = 0;
      }
    } else {
      const backoff = this._baseEjectionMs * this._config.backoffMultiplier * Math.max(1, h.ejections);
      h.state = 'ejected';
      h.ejectedUntilMs = this._clock.nowMs() + backoff;
      h.probeOk = 0;
    }
    return h.state;
  }

  stateOf(key: string): HostState {
    const h = this._hosts.get(key);
    if (!h) return 'healthy';
    if (h.state === 'ejected' && this._clock.nowMs() >= h.ejectedUntilMs) {
      h.state = 'probing';
      h.probeOk = 0;
    }
    return h.state;
  }

  /** Snapshot for dashboards/tests. */
  describe(key: string): { state: HostState; probeOk: number; ejections: number; inflight: number } {
    const h = this._hosts.get(key);
    if (!h) return { state: 'healthy', probeOk: 0, ejections: 0, inflight: 0 };
    return { state: this.stateOf(key), probeOk: h.probeOk, ejections: h.ejections, inflight: h.inflight };
  }
}

/**
 * Cluster-wide ejection ledger: current states + ejected fraction.
 * The control plane uses `ejectedFraction` for panic-mode decisions
 * (route to ejected hosts anyway when nearly all are out).
 */
export class EjectionRegistry {
  private readonly _prober: RecoveryProber;
  private readonly _members = new Set<string>();

  constructor(prober: RecoveryProber) {
    this._prober = prober;
  }

  addMember(key: string): void {
    this._members.add(key);
  }

  removeMember(key: string): void {
    this._members.delete(key);
  }

  /** Fraction of members currently ejected (0..1). */
  ejectedFraction(): number {
    if (this._members.size === 0) return 0;
    let n = 0;
    for (const k of this._members) {
      if (this._prober.stateOf(k) === 'ejected') n++;
    }
    return n / this._members.size;
  }

  /** Panic mode: more than `threshold` (0..1) of members ejected. */
  panicMode(threshold = 0.5): boolean {
    return this.ejectedFraction() > threshold;
  }

  /** Members that may serve right now (healthy + probeable). */
  servable(): string[] {
    const out: string[] = [];
    for (const k of this._members) {
      if (this._prober.allows(k)) out.push(k);
    }
    return out;
  }

  /** Full state map for status endpoints. */
  states(): Record<string, HostState> {
    const out: Record<string, HostState> = {};
    for (const k of this._members) out[k] = this._prober.stateOf(k);
    return out;
  }
}
