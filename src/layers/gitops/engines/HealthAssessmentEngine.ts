/**
 * Health Assessment Engine
 *
 * Runs probe hooks over applied resources after reconciliation — the
 * GitOps equivalent of ArgoCD's health checks (Deployment available,
 * StatefulSet ready, custom Lua per kind).
 *
 * Probes are registered per resource kind (with a '*' fallback) and may
 * be sync or async. Resources with no probe get 'unknown' — absence of
 * a probe is reported, never silently treated as healthy.
 *
 * @module GitopsLayer/Engines
 */

import { HealthProbe, HealthReport, HealthStatus, LiveStore, ResourceSpec } from './types';

export class HealthAssessmentEngine {
  private readonly _live: LiveStore;
  private readonly _probes: Map<string, HealthProbe>;

  constructor(live: LiveStore) {
    this._live = live;
    this._probes = new Map();
  }

  /** Register a probe for a kind, or '*' for a fallback probe. */
  registerProbe(kind: string, probe: HealthProbe): void {
    this._probes.set(kind, probe);
  }

  /**
   * Assess one resource. Applies the kind probe or the '*' fallback;
   * throws inside a probe map to 'unhealthy' (a crashing probe is a bad
   * sign, not a pass).
   */
  async assess(resourceKey: string): Promise<HealthReport> {
    const resource = this._live.get(resourceKey);
    if (!resource) {
      return { resourceKey, status: HealthStatus.Unknown, detail: 'resource not in live store' };
    }
    const probe = this._probes.get(resource.kind) ?? this._probes.get('*');
    if (!probe) {
      return { resourceKey, status: HealthStatus.Unknown, detail: `no probe for kind '${resource.kind}'` };
    }
    try {
      const status = await probe(resource);
      return { resourceKey, status, detail: null };
    } catch (err) {
      return {
        resourceKey,
        status: HealthStatus.Unhealthy,
        detail: err instanceof Error ? err.message : String(err),
      };
    }
  }

  /**
   * Assess many resources (e.g. everything a reconcile touched).
   * Runs probes in parallel — health checks are I/O-bound in reality.
   */
  async assessAll(resourceKeys: ReadonlyArray<string>): Promise<HealthReport[]> {
    return Promise.all(resourceKeys.map((k) => this.assess(k)));
  }

  /** True when every report is Healthy. */
  allHealthy(reports: ReadonlyArray<HealthReport>): boolean {
    return reports.every((r) => r.status === HealthStatus.Healthy);
  }
}
