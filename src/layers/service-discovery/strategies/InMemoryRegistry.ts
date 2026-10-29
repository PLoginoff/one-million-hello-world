/**
 * InMemoryRegistry
 *
 * Local, single-process service registry with:
 *  - O(1) register/deregister/get by id
 *  - Indexed lookup by service name (Map<string, Set<id>>)
 *  - Tag-based querying
 *  - Watch/notify (synchronous dispatch, FIFO per watcher)
 *  - Heartbeat-driven liveness: instances whose heartbeats stop are first
 *    marked `unknown` (soft-fail), then evicted after `evictAfterMissed`.
 *
 * This is the reference implementation all remote adapters emulate.
 *
 * @module ServiceDiscoveryLayer/Strategies
 */

import {
  InstanceQuery,
  IServiceRegistry,
  RegistryEvent,
  RegistryWatcher,
  ServiceInstance,
  matchesQuery,
} from '../types/service-instance';

export interface InMemoryRegistryConfig {
  /**
   * Milliseconds without a heartbeat before an instance is marked `unknown`.
   * Default 30_000.
   */
  heartbeatTtlMs?: number;
  /**
   * Number of missed-heartbeat windows after which an `unknown` instance is
   * physically evicted from the registry. Default 3.
   */
  evictAfterMissed?: number;
}

export class InMemoryRegistry implements IServiceRegistry {
  private readonly _byId: Map<string, ServiceInstance>;
  private readonly _byService: Map<string, Set<string>>;
  private readonly _watchers: Set<RegistryWatcher>;
  private readonly _heartbeatTtlMs: number;
  private readonly _evictAfterMissed: number;
  private readonly _eventLog: RegistryEvent[];
  private readonly _maxEventLog: number;

  constructor(config: InMemoryRegistryConfig = {}) {
    this._byId = new Map();
    this._byService = new Map();
    this._watchers = new Set();
    this._heartbeatTtlMs = config.heartbeatTtlMs ?? 30_000;
    this._evictAfterMissed = config.evictAfterMissed ?? 3;
    this._eventLog = [];
    this._maxEventLog = 512;
  }

  /** Register or overwrite an instance. Returns the stored instance. */
  register(instance: ServiceInstance): ServiceInstance {
    const existing = this._byId.get(instance.id);
    if (existing) {
      this.deregister(instance.id);
    }
    this._byId.set(instance.id, instance);
    let set = this._byService.get(instance.serviceName);
    if (!set) {
      set = new Set();
      this._byService.set(instance.serviceName, set);
    }
    set.add(instance.id);
    this._emit({ type: 'instance-registered', instance, at: Date.now() });
    return instance;
  }

  /** Remove by id. Returns true if present. */
  deregister(instanceId: string): boolean {
    const inst = this._byId.get(instanceId);
    if (!inst) {
      return false;
    }
    this._byId.delete(instanceId);
    const set = this._byService.get(inst.serviceName);
    if (set) {
      set.delete(instanceId);
      if (set.size === 0) {
        this._byService.delete(inst.serviceName);
      }
    }
    this._emit({ type: 'instance-deregistered', instance: inst, at: Date.now() });
    return true;
  }

  /**
   * Record a heartbeat. Resets missed counter, updates lastHeartbeatAt, and
   * transitions `starting`/`unknown` → `up`.
   */
  heartbeat(instanceId: string, at: number = Date.now()): boolean {
    const inst = this._byId.get(instanceId);
    if (!inst) {
      return false;
    }
    inst.lastHeartbeatAt = at;
    inst.missedHeartbeats = 0;
    const prev = inst.health;
    if (inst.health === 'starting' || inst.health === 'unknown') {
      inst.health = 'up';
      if (prev !== inst.health) {
        this._emit({
          type: 'instance-health-changed',
          instance: inst,
          at,
          previousHealth: prev,
        });
      }
    }
    this._emit({ type: 'instance-heartbeat', instance: inst, at });
    return true;
  }

  get(instanceId: string): ServiceInstance | undefined {
    return this._byId.get(instanceId);
  }

  /**
   * Lookup by predicate. Fast path: `serviceName` uses the name index,
   * then the remaining filters run in-memory.
   */
  query(q: InstanceQuery): ServiceInstance[] {
    let candidates: ServiceInstance[];
    if (q.serviceName !== undefined) {
      const ids = this._byService.get(q.serviceName);
      if (!ids) {
        return [];
      }
      candidates = [];
      for (const id of ids) {
        const inst = this._byId.get(id);
        if (inst) {
          candidates.push(inst);
        }
      }
    } else {
      candidates = Array.from(this._byId.values());
    }
    return candidates.filter((i) => matchesQuery(i, q));
  }

  /** Subscribe to registry events. Returns unsubscribe function. */
  watch(watcher: RegistryWatcher): () => void {
    this._watchers.add(watcher);
    return () => {
      this._watchers.delete(watcher);
    };
  }

  /**
   * Drive the liveness clock forward. For each instance:
   *  - if `now - lastHeartbeatAt > ttl`, increment `missedHeartbeats` and
   *    mark `unknown`
   *  - if `missedHeartbeats > evictAfterMissed`, evict
   *
   * Returns `{expired, evicted}` — expired are the newly-`unknown` instances.
   */
  tick(now: number = Date.now()): { expired: ServiceInstance[]; evicted: ServiceInstance[] } {
    const expired: ServiceInstance[] = [];
    const evicted: ServiceInstance[] = [];

    for (const inst of Array.from(this._byId.values())) {
      if (now - inst.lastHeartbeatAt > this._heartbeatTtlMs) {
        inst.missedHeartbeats += 1;
        inst.lastHeartbeatAt = now; // next window starts now
        if (inst.missedHeartbeats > this._evictAfterMissed) {
          this._byId.delete(inst.id);
          const set = this._byService.get(inst.serviceName);
          if (set) {
            set.delete(inst.id);
            if (set.size === 0) {
              this._byService.delete(inst.serviceName);
            }
          }
          evicted.push(inst);
          this._emit({ type: 'instance-expired', instance: inst, at: now });
        } else {
          const prev = inst.health;
          inst.health = 'unknown';
          expired.push(inst);
          if (prev !== 'unknown') {
            this._emit({
              type: 'instance-health-changed',
              instance: inst,
              at: now,
              previousHealth: prev,
            });
          }
        }
      }
    }

    return { expired, evicted };
  }

  get size(): number {
    return this._byId.size;
  }

  /** Service names currently registered. */
  serviceNames(): string[] {
    return Array.from(this._byService.keys());
  }

  /** Last N events (for tests/debug). */
  eventLog(): readonly RegistryEvent[] {
    return this._eventLog;
  }

  private _emit(event: RegistryEvent): void {
    this._eventLog.push(event);
    if (this._eventLog.length > this._maxEventLog) {
      this._eventLog.shift();
    }
    for (const w of this._watchers) {
      try {
        w(event);
      } catch {
        // Watcher errors must not break the registry.
      }
    }
  }
}
