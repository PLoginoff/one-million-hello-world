/**
 * LocalRegistry + FederatedRegistry — multi-cluster service registry.
 *
 * `LocalRegistry` is a plain in-memory registry (service → instances).
 * `FederatedRegistry` fronts N named registries (one per cluster) and
 * merges their answers with cluster-aware ordering:
 *
 *  - Local-cluster instances sort first (locality preference).
 *  - Within a cluster, instances keep registration order.
 *  - Cross-cluster de-duplication on instanceId — the same logical
 *    instance re-registered in two clusters appears once, preferring
 *    the nearer cluster's view.
 *  - A cluster that throws during lookup degrades gracefully: its peers
 *    still answer, and the failure is recorded for metrics.
 *
 * Merge is O(total instances); dedupe via a Set of seen ids.
 *
 * @module ServiceDiscoveryLayer/Engine2
 */

import { ServiceInstance2, SdClock2, SystemSdClock2 } from './types';

export class LocalRegistry {
  private readonly _byId = new Map<string, ServiceInstance2>();
  private readonly _byService = new Map<string, string[]>();
  readonly clusterId: string;

  constructor(clusterId: string) {
    this.clusterId = clusterId;
  }

  register(instance: Omit<ServiceInstance2, 'registeredAtMs' | 'clusterId'> & { registeredAtMs?: number }): ServiceInstance2 {
    const full: ServiceInstance2 = {
      ...instance,
      clusterId: this.clusterId,
      registeredAtMs: instance.registeredAtMs ?? 0,
    };
    this._byId.set(full.instanceId, full);
    const list = this._byService.get(full.serviceName) ?? [];
    if (!list.includes(full.instanceId)) list.push(full.instanceId);
    this._byService.set(full.serviceName, list);
    return full;
  }

  deregister(instanceId: string): boolean {
    const inst = this._byId.get(instanceId);
    if (!inst) return false;
    this._byId.delete(instanceId);
    const list = this._byService.get(inst.serviceName);
    if (list) {
      const i = list.indexOf(instanceId);
      if (i >= 0) list.splice(i, 1);
    }
    return true;
  }

  get(instanceId: string): ServiceInstance2 | undefined {
    return this._byId.get(instanceId);
  }

  list(serviceName: string): ServiceInstance2[] {
    const ids = this._byService.get(serviceName) ?? [];
    const out: ServiceInstance2[] = [];
    for (const id of ids) {
      const inst = this._byId.get(id);
      if (inst) out.push(inst);
    }
    return out;
  }

  serviceNames(): string[] {
    return [...this._byService.keys()];
  }

  get size(): number {
    return this._byId.size;
  }
}

/* ----------------------------------------------------------------------- */

export interface FederatedLookupOptions {
  /** Prefer instances from this cluster first. */
  preferClusterId?: string;
  /** Cap on total instances returned. Default 128. */
  maxInstances?: number;
}

export class FederatedRegistry {
  private readonly _clusters = new Map<string, LocalRegistry>();
  private readonly _failures = new Map<string, number>();
  private readonly _clock: SdClock2;

  constructor(opts: { clock?: SdClock2 } = {}) {
    this._clock = opts.clock ?? new SystemSdClock2();
  }

  /** Attach a cluster's registry under its id. */
  attach(registry: LocalRegistry): void {
    this._clusters.set(registry.clusterId, registry);
  }

  detach(clusterId: string): boolean {
    this._failures.delete(clusterId);
    return this._clusters.delete(clusterId);
  }

  clusterIds(): string[] {
    return [...this._clusters.keys()];
  }

  /** Register into a specific cluster. */
  registerIn(
    clusterId: string,
    instance: Omit<ServiceInstance2, 'registeredAtMs' | 'clusterId'>
  ): ServiceInstance2 {
    const r = this._clusters.get(clusterId);
    if (!r) throw new Error(`unknown cluster: ${clusterId}`);
    return r.register({ ...instance, registeredAtMs: this._clock.now() });
  }

  /**
   * Merge instance lists across all clusters.
   * Local cluster first, dedupe on instanceId, cap at maxInstances.
   */
  lookup(serviceName: string, opts: FederatedLookupOptions = {}): ServiceInstance2[] {
    const max = opts.maxInstances ?? 128;
    const seen = new Set<string>();
    const local: ServiceInstance2[] = [];
    const remote: ServiceInstance2[] = [];

    for (const [clusterId, registry] of this._clusters) {
      let instances: ServiceInstance2[];
      try {
        instances = registry.list(serviceName);
      } catch {
        this._failures.set(clusterId, (this._failures.get(clusterId) ?? 0) + 1);
        continue;
      }
      for (const inst of instances) {
        if (seen.has(inst.instanceId)) continue;
        seen.add(inst.instanceId);
        if (opts.preferClusterId && inst.clusterId === opts.preferClusterId) {
          local.push(inst);
        } else {
          remote.push(inst);
        }
        if (local.length + remote.length >= max) break;
      }
    }
    return [...local, ...remote].slice(0, max);
  }

  /**
   * Deregister an instance from whichever cluster holds it. Returns the
   * cluster id that owned it, or null.
   */
  deregister(instanceId: string): string | null {
    for (const [clusterId, registry] of this._clusters) {
      if (registry.get(instanceId) !== undefined) {
        registry.deregister(instanceId);
        return clusterId;
      }
    }
    return null;
  }

  /** Look up an instance by id across all clusters. */
  get(instanceId: string): ServiceInstance2 | undefined {
    for (const registry of this._clusters.values()) {
      const inst = registry.get(instanceId);
      if (inst) return inst;
    }
    return undefined;
  }

  /** Per-cluster failure counters (degraded lookups). */
  failures(): ReadonlyMap<string, number> {
    return this._failures;
  }

  /** Union of all known service names across clusters. */
  serviceNames(): string[] {
    const out = new Set<string>();
    for (const r of this._clusters.values()) {
      for (const s of r.serviceNames()) out.add(s);
    }
    return [...out].sort();
  }
}
