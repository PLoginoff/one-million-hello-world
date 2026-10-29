/**
 * Service Discovery Types
 *
 * Shared model for service instances, health states, and registry events
 * used by all discovery mechanisms (in-memory, Consul-like, ETCD-like, DNS).
 *
 * @module ServiceDiscoveryLayer/Types
 */

/** Health status of a registered instance. */
export type InstanceHealth = 'up' | 'down' | 'unknown' | 'starting';

/** A single registered service instance. */
export interface ServiceInstance {
  /** Unique instance id, e.g. `orders-api-7c9f5d8f66-x2p`. */
  readonly id: string;
  /** Logical service name, e.g. `orders-api`. */
  readonly serviceName: string;
  /** Hostname or IP. */
  readonly host: string;
  /** Port. */
  readonly port: number;
  /** Registration scheme, e.g. `http`, `https`, `grpc`. */
  readonly scheme: string;
  /** Current health. */
  health: InstanceHealth;
  /** Free-form labels used for filtering/routing (`region=us-east-1`). */
  readonly tags: ReadonlySet<string>;
  /** Structured metadata (version, weight, datacenter). */
  readonly metadata: Readonly<Record<string, string>>;
  /** Unix ms timestamp of registration. */
  readonly registeredAt: number;
  /** Unix ms timestamp of last successful heartbeat. */
  lastHeartbeatAt: number;
  /** Consecutive missed heartbeats (for heartbeat-based eviction). */
  missedHeartbeats: number;
}

/** Options accepted by {@link createInstance}. */
export interface InstanceOptions {
  scheme?: string;
  health?: InstanceHealth;
  tags?: string[];
  metadata?: Record<string, string>;
  now?: number;
}

/** Construct a ServiceInstance with defaults. */
export function createInstance(
  id: string,
  serviceName: string,
  host: string,
  port: number,
  options: InstanceOptions = {}
): ServiceInstance {
  const now = options.now ?? Date.now();
  return {
    id,
    serviceName,
    host,
    port,
    scheme: options.scheme ?? 'http',
    health: options.health ?? 'starting',
    tags: new Set(options.tags ?? []),
    metadata: Object.freeze({ ...(options.metadata ?? {}) }),
    registeredAt: now,
    lastHeartbeatAt: now,
    missedHeartbeats: 0,
  };
}

/** Events emitted by the registry for watch subscribers. */
export type RegistryEventType =
  | 'instance-registered'
  | 'instance-deregistered'
  | 'instance-health-changed'
  | 'instance-heartbeat'
  | 'instance-expired';

/** A single registry event delivered to watchers. */
export interface RegistryEvent {
  readonly type: RegistryEventType;
  readonly instance: ServiceInstance;
  readonly at: number;
  /** Previous health, for `instance-health-changed`. */
  readonly previousHealth?: InstanceHealth;
}

/** Watcher callback signature. */
export type RegistryWatcher = (event: RegistryEvent) => void;

/**
 * Predicate used to filter instances returned by `query`.
 * All specified criteria must match (AND semantics).
 */
export interface InstanceQuery {
  /** Match exact service name. */
  serviceName?: string;
  /** Require ALL of these tags to be present. */
  requireTags?: string[];
  /** Require ANY of these tags to be present (OR within the set). */
  anyTags?: string[];
  /** Only these health states. */
  healthIn?: InstanceHealth[];
  /** Metadata key/value must equal. */
  metadataEquals?: Record<string, string>;
}

/** True when `instance` satisfies `query`. */
export function matchesQuery(instance: ServiceInstance, query: InstanceQuery): boolean {
  if (query.serviceName !== undefined && instance.serviceName !== query.serviceName) {
    return false;
  }
  if (query.requireTags) {
    for (const t of query.requireTags) {
      if (!instance.tags.has(t)) {
        return false;
      }
    }
  }
  if (query.anyTags && query.anyTags.length > 0) {
    let any = false;
    for (const t of query.anyTags) {
      if (instance.tags.has(t)) {
        any = true;
        break;
      }
    }
    if (!any) {
      return false;
    }
  }
  if (query.healthIn && query.healthIn.length > 0) {
    if (!query.healthIn.includes(instance.health)) {
      return false;
    }
  }
  if (query.metadataEquals) {
    for (const [k, v] of Object.entries(query.metadataEquals)) {
      if (instance.metadata[k] !== v) {
        return false;
      }
    }
  }
  return true;
}

/** Public shape of a service registry. */
export interface IServiceRegistry {
  register(instance: ServiceInstance): ServiceInstance;
  deregister(instanceId: string): boolean;
  heartbeat(instanceId: string, at?: number): boolean;
  get(instanceId: string): ServiceInstance | undefined;
  query(q: InstanceQuery): ServiceInstance[];
  watch(watcher: RegistryWatcher): () => void;
  /** Advance the eviction clock: mark instances whose heartbeat TTL elapsed. */
  tick(now?: number): { expired: ServiceInstance[]; evicted: ServiceInstance[] };
  size: number;
}
