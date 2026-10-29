/**
 * ConsulLikeAdapter
 *
 * In-memory simulation of HashiCorp Consul's service catalog + health checks.
 * Models the parts a client actually depends on:
 *
 *  - `catalog.services`   — list of service names
 *  - `health.service(name, passing)` — instances filtered by aggregated check
 *  - `agent.service.register/deregister` — local registration API
 *  - checks with statuses `passing | warning | critical`
 *  - blocking query emulation via {@link ConsulLikeAdapter.watch}
 *
 * Aggregation rule (matches real Consul): an instance is `passing` iff ALL of
 * its checks are passing; a single `critical` check makes the instance
 * unreachable even if other checks pass.
 *
 * @module ServiceDiscoveryLayer/Adapters
 */

import {
  InstanceHealth,
  IServiceRegistry,
  RegistryEvent,
  RegistryWatcher,
  ServiceInstance,
  createInstance,
} from '../types/service-instance';

export type ConsulCheckStatus = 'passing' | 'warning' | 'critical';

export interface ConsulCheck {
  readonly checkId: string;
  readonly name: string;
  status: ConsulCheckStatus;
  readonly notes?: string;
}

export interface ConsulServiceEntry {
  readonly id: string;
  readonly service: string;
  readonly address: string;
  readonly port: number;
  readonly tags: string[];
  readonly meta: Record<string, string>;
  checks: ConsulCheck[];
  readonly registeredAt: number;
}

/**
 * Convert Consul check statuses to an {@link InstanceHealth}.
 */
export function aggregateHealth(checks: ConsulCheck[]): InstanceHealth {
  if (checks.length === 0) {
    return 'unknown';
  }
  if (checks.some((c) => c.status === 'critical')) {
    return 'down';
  }
  if (checks.every((c) => c.status === 'passing')) {
    return 'up';
  }
  return 'unknown'; // some warning → warn but not dead
}

/**
 * Mock Consul agent + catalog.
 */
export class ConsulLikeAdapter implements IServiceRegistry {
  private readonly _services: Map<string, ConsulServiceEntry>;
  private readonly _watchers: Set<RegistryWatcher>;
  private _datacenter: string;
  private _nodeName: string;

  constructor(nodeName = 'consul-node-1', datacenter = 'dc1') {
    this._services = new Map();
    this._watchers = new Set();
    this._nodeName = nodeName;
    this._datacenter = datacenter;
  }

  /** Agent API: register a service instance. */
  registerService(opts: {
    id: string;
    name: string;
    address: string;
    port: number;
    tags?: string[];
    meta?: Record<string, string>;
    check?: Partial<ConsulCheck>;
  }): ConsulServiceEntry {
    const entry: ConsulServiceEntry = {
      id: opts.id,
      service: opts.name,
      address: opts.address,
      port: opts.port,
      tags: opts.tags ?? [],
      meta: opts.meta ?? {},
      checks: opts.check
        ? [
            {
              checkId: opts.check.checkId ?? `check-${opts.id}`,
              name: opts.check.name ?? 'default',
              status: opts.check.status ?? 'passing',
              notes: opts.check.notes,
            },
          ]
        : [],
      registeredAt: Date.now(),
    };
    this._services.set(entry.id, entry);
    this._emit({
      type: 'instance-registered',
      instance: this._toInstance(entry),
      at: Date.now(),
    });
    return entry;
  }

  /** Agent API: update a check status (simulates TTL/HTTP check results). */
  setCheckStatus(serviceId: string, checkId: string, status: ConsulCheckStatus): boolean {
    const entry = this._services.get(serviceId);
    if (!entry) {
      return false;
    }
    const check = entry.checks.find((c) => c.checkId === checkId);
    if (!check) {
      return false;
    }
    const prev = aggregateHealth(entry.checks);
    check.status = status;
    const now = Date.now();
    const next = aggregateHealth(entry.checks);
    if (prev !== next) {
      this._emit({
        type: 'instance-health-changed',
        instance: this._toInstance(entry),
        previousHealth: prev,
        at: now,
      });
    }
    return true;
  }

  /** Catalog API: services currently known. */
  services(): Map<string, string[]> {
    const out = new Map<string, string[]>();
    for (const e of this._services.values()) {
      const list = out.get(e.service) ?? [];
      out.set(e.service, [...list, ...e.tags]);
    }
    return out;
  }

  /**
   * Health API: instances of a service, optionally only passing.
   * Equivalent to `GET /v1/health/service/<name>?passing=true`.
   */
  healthy(serviceName: string, passingOnly: boolean = true): ConsulServiceEntry[] {
    const out: ConsulServiceEntry[] = [];
    for (const e of this._services.values()) {
      if (e.service !== serviceName) {
        continue;
      }
      if (passingOnly && aggregateHealth(e.checks) !== 'up') {
        continue;
      }
      out.push(e);
    }
    return out;
  }

  // --- IServiceRegistry surface ------------------------------------------------

  register(instance: ServiceInstance): ServiceInstance {
    const entry: ConsulServiceEntry = {
      id: instance.id,
      service: instance.serviceName,
      address: instance.host,
      port: instance.port,
      tags: Array.from(instance.tags),
      meta: { ...instance.metadata },
      checks: [{ checkId: `check-${instance.id}`, name: 'ttl', status: 'passing' }],
      registeredAt: instance.registeredAt,
    };
    this._services.set(entry.id, entry);
    this._emit({ type: 'instance-registered', instance, at: Date.now() });
    return instance;
  }

  deregister(instanceId: string): boolean {
    const entry = this._services.get(instanceId);
    if (!entry) {
      return false;
    }
    this._services.delete(instanceId);
    this._emit({
      type: 'instance-deregistered',
      instance: this._toInstance(entry),
      at: Date.now(),
    });
    return true;
  }

  heartbeat(instanceId: string, at: number = Date.now()): boolean {
    const entry = this._services.get(instanceId);
    if (!entry) {
      return false;
    }
    this._emit({
      type: 'instance-heartbeat',
      instance: this._toInstance(entry),
      at,
    });
    return true;
  }

  get(instanceId: string): ServiceInstance | undefined {
    const entry = this._services.get(instanceId);
    return entry ? this._toInstance(entry) : undefined;
  }

  query(q: { serviceName?: string; healthIn?: InstanceHealth[] }): ServiceInstance[] {
    const out: ServiceInstance[] = [];
    for (const e of this._services.values()) {
      const inst = this._toInstance(e);
      if (q.serviceName !== undefined && inst.serviceName !== q.serviceName) {
        continue;
      }
      if (q.healthIn && !q.healthIn.includes(inst.health)) {
        continue;
      }
      out.push(inst);
    }
    return out;
  }

  watch(watcher: RegistryWatcher): () => void {
    this._watchers.add(watcher);
    return () => {
      this._watchers.delete(watcher);
    };
  }

  /** Consul has its own TTL logic — here we just no-op (checks drive health). */
  tick(): { expired: ServiceInstance[]; evicted: ServiceInstance[] } {
    return { expired: [], evicted: [] };
  }

  get size(): number {
    return this._services.size;
  }

  get nodeName(): string {
    return this._nodeName;
  }

  get datacenter(): string {
    return this._datacenter;
  }

  private _toInstance(e: ConsulServiceEntry): ServiceInstance {
    const inst = createInstance(e.id, e.service, e.address, e.port, {
      tags: e.tags,
      metadata: e.meta,
      health: aggregateHealth(e.checks),
      now: e.registeredAt,
    });
    return inst;
  }

  private _emit(event: RegistryEvent): void {
    for (const w of this._watchers) {
      try {
        w(event);
      } catch {
        // Ignore subscriber errors.
      }
    }
  }
}
