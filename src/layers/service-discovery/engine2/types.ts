/**
 * ServiceDiscovery Engine2 — Shared Types
 *
 * Second-generation discovery primitives: sidecar mesh sync, DNS discovery
 * with TTL caching, multi-cluster registry federation, health-driven
 * deregistration, and lookup metrics.
 *
 * @module ServiceDiscoveryLayer/Engine2
 */

/** Injectable clock for TTLs, heartbeats, and metric windows. */
export interface SdClock2 {
  now(): number;
}

export class SystemSdClock2 implements SdClock2 {
  now(): number {
    return Date.now();
  }
}

/** Test clock with manual time control. */
export class ManualSdClock2 implements SdClock2 {
  private _t: number;
  constructor(start: number = 0) {
    this._t = start;
  }
  now(): number {
    return this._t;
  }
  advance(ms: number): void {
    this._t += ms;
  }
  set(ms: number): void {
    this._t = ms;
  }
}

/** A discovered service instance endpoint. */
export interface ServiceInstance2 {
  /** Unique instance id within the registry. */
  readonly instanceId: string;
  /** Logical service name (e.g. "payments", "user.api"). */
  readonly serviceName: string;
  readonly host: string;
  readonly port: number;
  /** Weight for client-side load balancing (default 1). */
  readonly weight: number;
  /** Originating cluster/zone — populated by federation. */
  readonly clusterId: string;
  /** Instance metadata (version, region, tags). */
  readonly metadata: Readonly<Record<string, string>>;
  /** When the instance was registered (epoch ms). */
  readonly registeredAtMs: number;
}

/** Health state driving deregistration. */
export type InstanceHealth = 'healthy' | 'suspect' | 'unhealthy';

/** A lookup result annotated with its provenance. */
export interface LookupResult {
  readonly instances: ServiceInstance2[];
  /** Which registry served the answer ('local', a cluster id, or 'dns'). */
  readonly source: string;
  /** True if the answer came from a cache rather than the origin. */
  readonly cached: boolean;
  /** Lookup wall-time in ms. */
  readonly latencyMs: number;
}
