/**
 * EtcdLikeAdapter
 *
 * In-memory emulation of etcd's role as a service-discovery backend.
 * Models:
 *  - key-value store with `/services/<name>/<id>` layout
 *  - **leases** (TTL + keepalive — the etcd equivalent of a heartbeat)
 *  - **revisions** (monotonically-increasing change counter — the
 *    `X-Etcd-Index` Consul clients use for blocking queries)
 *  - **watches** on key prefixes
 *
 * Key invariant: every mutation bumps the global `revision` by exactly 1 and
 * creates a WatchEvent, in commit order.
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

export interface EtcdLease {
  readonly leaseId: number;
  /** TTL in seconds. */
  readonly ttlSec: number;
  /** Last keepalive in ms. */
  grantedAt: number;
  lastKeepaliveAt: number;
}

export interface EtcdKvEntry {
  readonly key: string;
  readonly instance: ServiceInstance;
  readonly leaseId: number | null;
  readonly createRevision: number;
  modRevision: number;
  version: number;
}

export interface EtcdWatchEvent {
  readonly type: 'put' | 'delete';
  readonly key: string;
  readonly instance?: ServiceInstance;
  readonly revision: number;
}

export type EtcdWatchHandler = (ev: EtcdWatchEvent) => void;

interface WatchSub {
  prefix: string;
  handler: EtcdWatchHandler;
  /** Deliver events with revision >= startRevision (etcd's `--rev` flag). */
  startRevision: number;
}

/**
 * Mock etcd server for service discovery.
 */
export class EtcdLikeAdapter implements IServiceRegistry {
  private readonly _kv: Map<string, EtcdKvEntry>;
  private readonly _leases: Map<number, EtcdLease>;
  private readonly _watchers: Set<WatchSub>;
  private readonly _registryWatchers: Set<RegistryWatcher>;
  private _revision: number;
  private _nextLeaseId: number;
  private readonly _history: EtcdWatchEvent[];

  constructor() {
    this._kv = new Map();
    this._leases = new Map();
    this._watchers = new Set();
    this._registryWatchers = new Set();
    this._revision = 0;
    this._nextLeaseId = 1;
    this._history = [];
  }

  // --- etcd-native API --------------------------------------------------------

  /** Grant a lease (etcd `LeaseGrant`). */
  grantLease(ttlSec: number): EtcdLease {
    const lease: EtcdLease = {
      leaseId: this._nextLeaseId++,
      ttlSec,
      grantedAt: Date.now(),
      lastKeepaliveAt: Date.now(),
    };
    this._leases.set(lease.leaseId, lease);
    return lease;
  }

  /** Keepalive (etcd `LeaseKeepAlive`). */
  keepalive(leaseId: number, at: number = Date.now()): boolean {
    const l = this._leases.get(leaseId);
    if (!l) {
      return false;
    }
    l.lastKeepaliveAt = at;
    return true;
  }

  /** Revoke a lease and delete all attached keys. */
  revokeLease(leaseId: number): number {
    if (!this._leases.delete(leaseId)) {
      return 0;
    }
    let deleted = 0;
    for (const [k, v] of Array.from(this._kv.entries())) {
      if (v.leaseId === leaseId) {
        this._deleteKey(k, v);
        deleted++;
      }
    }
    return deleted;
  }

  /** Put a service record at `/services/<name>/<id>` with optional lease. */
  putService(instance: ServiceInstance, leaseId: number | null = null): EtcdKvEntry {
    const key = `/services/${instance.serviceName}/${instance.id}`;
    this._revision += 1;
    const existing = this._kv.get(key);
    const entry: EtcdKvEntry = {
      key,
      instance,
      leaseId,
      createRevision: existing ? existing.createRevision : this._revision,
      modRevision: this._revision,
      version: existing ? existing.version + 1 : 1,
    };
    this._kv.set(key, entry);
    const ev: EtcdWatchEvent = { type: 'put', key, instance, revision: this._revision };
    this._record(ev);
    this._emitRegistry({ type: 'instance-registered', instance, at: Date.now() });
    return entry;
  }

  /** Delete by instance id. Returns true if found. */
  deleteService(serviceName: string, instanceId: string): boolean {
    const key = `/services/${serviceName}/${instanceId}`;
    const entry = this._kv.get(key);
    if (!entry) {
      return false;
    }
    this._deleteKey(key, entry);
    return true;
  }

  /** List all service instances under `/services/` or `/services/<name>/`. */
  range(prefix: string = '/services/'): ServiceInstance[] {
    const out: ServiceInstance[] = [];
    for (const [k, v] of this._kv) {
      if (k.startsWith(prefix)) {
        out.push(v.instance);
      }
    }
    return out;
  }

  /**
   * etcd-style watch on a key prefix.
   * Events are delivered for every put/delete whose key starts with `prefix`
   * and whose revision >= `startRevision`.
   */
  watchPrefix(prefix: string, handler: EtcdWatchHandler, startRevision: number = 0): () => void {
    const sub: WatchSub = { prefix, handler, startRevision };
    this._watchers.add(sub);
    // Replay history for events since startRevision (blocking query emulation).
    for (const ev of this._history) {
      if (ev.revision >= startRevision && ev.key.startsWith(prefix)) {
        try {
          handler(ev);
        } catch {
          /* ignore */
        }
      }
    }
    return () => {
      this._watchers.delete(sub);
    };
  }

  /** Expire leases whose TTL has elapsed; attached keys are deleted. */
  expireLeases(now: number = Date.now()): number {
    let evicted = 0;
    for (const l of Array.from(this._leases.values())) {
      if (now - l.lastKeepaliveAt > l.ttlSec * 1000) {
        evicted += this.revokeLease(l.leaseId);
      }
    }
    return evicted;
  }

  /** Global commit revision. */
  get revision(): number {
    return this._revision;
  }

  // --- IServiceRegistry surface ------------------------------------------------

  register(instance: ServiceInstance): ServiceInstance {
    this.putService(instance);
    return instance;
  }

  deregister(instanceId: string): boolean {
    for (const [k, v] of this._kv) {
      if (v.instance.id === instanceId) {
        this._deleteKey(k, v);
        return true;
      }
    }
    return false;
  }

  heartbeat(instanceId: string, at: number = Date.now()): boolean {
    for (const v of this._kv.values()) {
      if (v.instance.id === instanceId) {
        if (v.leaseId !== null) {
          return this.keepalive(v.leaseId, at);
        }
        return true;
      }
    }
    return false;
  }

  get(instanceId: string): ServiceInstance | undefined {
    for (const v of this._kv.values()) {
      if (v.instance.id === instanceId) {
        return v.instance;
      }
    }
    return undefined;
  }

  query(q: { serviceName?: string; healthIn?: InstanceHealth[] }): ServiceInstance[] {
    const out: ServiceInstance[] = [];
    for (const v of this._kv.values()) {
      if (q.serviceName !== undefined && v.instance.serviceName !== q.serviceName) {
        continue;
      }
      if (q.healthIn && !q.healthIn.includes(v.instance.health)) {
        continue;
      }
      out.push(v.instance);
    }
    return out;
  }

  watch(watcher: RegistryWatcher): () => void {
    this._registryWatchers.add(watcher);
    return () => {
      this._registryWatchers.delete(watcher);
    };
  }

  tick(now: number = Date.now()): { expired: ServiceInstance[]; evicted: ServiceInstance[] } {
    const evicted: ServiceInstance[] = [];
    for (const l of Array.from(this._leases.values())) {
      if (now - l.lastKeepaliveAt > l.ttlSec * 1000) {
        for (const [k, v] of Array.from(this._kv.entries())) {
          if (v.leaseId === l.leaseId) {
            evicted.push(v.instance);
            this._deleteKey(k, v);
          }
        }
        this._leases.delete(l.leaseId);
      }
    }
    return { expired: [], evicted };
  }

  get size(): number {
    return this._kv.size;
  }

  // --- internals ---------------------------------------------------------------

  private _deleteKey(key: string, entry: EtcdKvEntry): void {
    this._kv.delete(key);
    this._revision += 1;
    const ev: EtcdWatchEvent = {
      type: 'delete',
      key,
      instance: entry.instance,
      revision: this._revision,
    };
    this._record(ev);
    this._emitRegistry({
      type: 'instance-deregistered',
      instance: entry.instance,
      at: Date.now(),
    });
  }

  private _record(ev: EtcdWatchEvent): void {
    this._history.push(ev);
    if (this._history.length > 1024) {
      this._history.shift();
    }
    for (const w of this._watchers) {
      if (ev.key.startsWith(w.prefix) && ev.revision >= w.startRevision) {
        try {
          w.handler(ev);
        } catch {
          /* ignore */
        }
      }
    }
  }

  private _emitRegistry(event: RegistryEvent): void {
    for (const w of this._registryWatchers) {
      try {
        w(event);
      } catch {
        /* ignore */
      }
    }
  }
}
