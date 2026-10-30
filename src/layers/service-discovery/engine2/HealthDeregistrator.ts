/**
 * HealthDeregistrator — deregisters instances whose health checks fail.
 *
 * Instances report heartbeats; the registrator applies a suspicion ladder:
 *
 *   missed ≤ suspectAfter   → healthy
 *   missed ≤ deregisterAfter → suspect   (still routable, flagged)
 *   missed > deregisterAfter → unhealthy → auto-deregistered
 *
 * where `missed = floor((now - lastHeartbeatMs) / intervalMs)`.
 *
 * This mirrors Consul/Serf-style behavior: a single lost probe marks the
 * node suspect, and only sustained silence removes it — transient
 * partition doesn't bounce every route.
 *
 * The registrator is storage-agnostic: it wraps any `Registry` that
 * exposes register/deregister/list, so it can sit in front of the local
 * registry, a federated one, or a mesh sidecar table.
 *
 * Complexity: O(1) per heartbeat; O(n) per sweep over tracked instances.
 *
 * @module ServiceDiscoveryLayer/Engine2
 */

import { InstanceHealth, ServiceInstance2, SdClock2, SystemSdClock2 } from './types';

/** Minimal registry surface the deregistrator needs. */
export interface DeregisterableRegistry {
  deregister(instanceId: string): boolean;
  get(instanceId: string): ServiceInstance2 | undefined;
}

export interface HealthDeregistratorOptions {
  /** Expected heartbeat interval in ms. Default 10_000. */
  intervalMs?: number;
  /** Missed beats before 'suspect'. Default 1. */
  suspectAfter?: number;
  /** Missed beats before auto-deregistration. Default 3. */
  deregisterAfter?: number;
  clock?: SdClock2;
}

export interface HealthReport {
  readonly instanceId: string;
  readonly health: InstanceHealth;
  readonly missedBeats: number;
  readonly lastHeartbeatMs: number;
  readonly deregistered: boolean;
}

interface Tracked {
  instanceId: string;
  lastHeartbeatMs: number;
  /** Set once the instance has been deregistered. */
  removed: boolean;
}

export class HealthDeregistrator {
  private readonly _registry: DeregisterableRegistry;
  private readonly _intervalMs: number;
  private readonly _suspectAfter: number;
  private readonly _deregisterAfter: number;
  private readonly _clock: SdClock2;
  private readonly _tracked = new Map<string, Tracked>();

  constructor(registry: DeregisterableRegistry, opts: HealthDeregistratorOptions = {}) {
    this._registry = registry;
    this._intervalMs = Math.max(1, opts.intervalMs ?? 10_000);
    this._suspectAfter = Math.max(1, opts.suspectAfter ?? 1);
    this._deregisterAfter = Math.max(this._suspectAfter + 1, opts.deregisterAfter ?? 3);
    this._clock = opts.clock ?? new SystemSdClock2();
  }

  /** Begin tracking an instance's heartbeats. */
  track(instanceId: string): void {
    this._tracked.set(instanceId, {
      instanceId,
      lastHeartbeatMs: this._clock.now(),
      removed: false,
    });
  }

  /** Record a heartbeat — resets the missed-beats ladder. */
  heartbeat(instanceId: string): void {
    const t = this._tracked.get(instanceId);
    if (t && !t.removed) {
      t.lastHeartbeatMs = this._clock.now();
    }
  }

  /** Current health classification for one instance. */
  healthOf(instanceId: string): HealthReport | null {
    const t = this._tracked.get(instanceId);
    if (!t) return null;
    const missed = Math.floor((this._clock.now() - t.lastHeartbeatMs) / this._intervalMs);
    const health: InstanceHealth =
      t.removed || missed > this._deregisterAfter
        ? 'unhealthy'
        : missed > this._suspectAfter
          ? 'suspect'
          : 'healthy';
    return {
      instanceId,
      health,
      missedBeats: missed,
      lastHeartbeatMs: t.lastHeartbeatMs,
      deregistered: t.removed,
    };
  }

  /**
   * Inspect every tracked instance; deregister those past the unhealthy
   * threshold. Returns the reports for instances that changed state.
   */
  sweep(): HealthReport[] {
    const changed: HealthReport[] = [];
    for (const [id, t] of this._tracked) {
      const report = this.healthOf(id);
      if (!report) continue;
      if (report.health === 'unhealthy' && !t.removed) {
        // Only remove if the registry still holds it — idempotent.
        if (this._registry.get(id) !== undefined) {
          this._registry.deregister(id);
        }
        t.removed = true;
        changed.push(report);
      }
    }
    return changed;
  }

  /** Stop tracking (does not deregister). */
  untrack(instanceId: string): boolean {
    return this._tracked.delete(instanceId);
  }

  /** All reports, for dashboards. */
  reports(): HealthReport[] {
    const out: HealthReport[] = [];
    for (const id of this._tracked.keys()) {
      const r = this.healthOf(id);
      if (r) out.push(r);
    }
    return out;
  }
}
