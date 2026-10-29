/**
 * HeartbeatHealthChecker
 *
 * Implements TTL-based health: instances must call {@link InMemoryRegistry.heartbeat}
 * at least every `ttlMs`. A sweep (`tick`) downgrades stale instances to
 * `unknown`, then evicts after `evictAfter` consecutive misses.
 *
 * This mirrors:
 *  - Eureka: lease renewal every 30s, eviction after 90s
 *  - Consul: TTL check + serf gossip
 *  - K8s: livenessProbe period/timeout/failureThreshold
 *
 * The checker does NOT own a timer — the host calls `tick()` (cron-friendly,
 * test-friendly).
 *
 * @module ServiceDiscoveryLayer/Strategies
 */

import { IServiceRegistry, ServiceInstance } from '../types/service-instance';

export interface HeartbeatSweep {
  now: number;
  /** Instances transitioned to `unknown` in this sweep. */
  expired: ServiceInstance[];
  /** Instances physically removed in this sweep. */
  evicted: ServiceInstance[];
  /** Number of instances still fully healthy. */
  healthy: number;
}

export class HeartbeatHealthChecker {
  private readonly _registry: IServiceRegistry;
  private _sweepCount: number;
  private _lastSweepAt: number | null;

  constructor(registry: IServiceRegistry) {
    this._registry = registry;
    this._sweepCount = 0;
    this._lastSweepAt = null;
  }

  /** Run a sweep at `now`. */
  tick(now: number = Date.now()): HeartbeatSweep {
    const { expired, evicted } = this._registry.tick(now);
    this._sweepCount += 1;
    this._lastSweepAt = now;
    return {
      now,
      expired,
      evicted,
      healthy: this._registry.query({ healthIn: ['up'] }).length,
    };
  }

  /** Send a heartbeat for `instanceId`. */
  heartbeat(instanceId: string, at?: number): boolean {
    return this._registry.heartbeat(instanceId, at);
  }

  /** Currently-healthy instances for a service. */
  healthyFor(serviceName: string): ServiceInstance[] {
    return this._registry.query({ serviceName, healthIn: ['up'] });
  }

  get sweepCount(): number {
    return this._sweepCount;
  }

  get lastSweepAt(): number | null {
    return this._lastSweepAt;
  }
}
