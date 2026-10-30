/**
 * DiscoveryFacade — composes federation, DNS fallback, health-driven
 * deregistration, and metrics into one lookup path.
 *
 * Lookup order:
 *   1. Federated registries (local + remote clusters)
 *   2. DNS-based discovery with TTL cache (only when federation is empty)
 *
 * Every lookup is timed and recorded in DiscoveryMetrics. Heartbeat-fed
 * `sweepHealth()` deregisters silent instances from the owning cluster.
 *
 * @module ServiceDiscoveryLayer/Engine2
 */

import { LookupResult, ServiceInstance2, SdClock2, SystemSdClock2 } from './types';
import { FederatedRegistry, FederatedLookupOptions, LocalRegistry } from './FederatedRegistry';
import { TtlDnsDiscovery } from './TtlDnsDiscovery';
import { HealthDeregistrator, HealthReport } from './HealthDeregistrator';
import { DiscoveryMetrics } from './DiscoveryMetrics';

export interface DiscoveryFacadeOptions {
  /** Fall back to DNS when federation returns nothing. Default true. */
  dnsFallback?: boolean;
  clock?: SdClock2;
}

export class DiscoveryFacade {
  readonly federation: FederatedRegistry;
  readonly dns: TtlDnsDiscovery | null;
  readonly metrics: DiscoveryMetrics;
  readonly health: HealthDeregistrator;
  private readonly _localClusterId: string;
  private readonly _dnsFallback: boolean;
  private readonly _clock: SdClock2;

  constructor(
    localClusterId: string,
    opts: DiscoveryFacadeOptions & {
      dns?: TtlDnsDiscovery;
      metrics?: DiscoveryMetrics;
      healthOpts?: ConstructorParameters<typeof HealthDeregistrator>[1];
    } = {}
  ) {
    this._clock = opts.clock ?? new SystemSdClock2();
    this._localClusterId = localClusterId;
    this._dnsFallback = opts.dnsFallback ?? true;
    this.federation = new FederatedRegistry({ clock: this._clock });
    this.federation.attach(new LocalRegistry(localClusterId));
    this.dns = opts.dns ?? null;
    this.metrics = opts.metrics ?? new DiscoveryMetrics({ clock: this._clock });
    // Adapt the federation (deregister returns the owning cluster id) to
    // the boolean DeregisterableRegistry contract.
    const federated = this.federation;
    this.health = new HealthDeregistrator(
      {
        deregister: (id) => federated.deregister(id) !== null,
        get: (id) => federated.get(id),
      },
      { ...opts.healthOpts, clock: this._clock }
    );
  }

  /** Register an instance into the local cluster and start heartbeat tracking. */
  registerLocal(
    instance: Omit<ServiceInstance2, 'registeredAtMs' | 'clusterId'>
  ): ServiceInstance2 {
    const inst = this.federation.registerIn(this._localClusterId, instance);
    this.health.track(inst.instanceId);
    return inst;
  }

  /** Unified lookup: federation first, DNS fallback. */
  async lookup(serviceName: string, opts: FederatedLookupOptions = {}): Promise<LookupResult> {
    const start = this._clock.now();
    const prefer = { preferClusterId: this._localClusterId, ...opts };

    const federated = this.federation.lookup(serviceName, prefer);
    if (federated.length > 0) {
      const res: LookupResult = {
        instances: federated,
        source: this._localClusterId,
        cached: false,
        latencyMs: this._clock.now() - start,
      };
      this.metrics.record(res);
      return res;
    }

    if (this.dns && this._dnsFallback) {
      const wasCached = this.dns.isCachedFresh(serviceName);
      try {
        const instances = await this.dns.resolve(serviceName);
        const res: LookupResult = {
          instances,
          source: 'dns',
          cached: wasCached,
          latencyMs: this._clock.now() - start,
        };
        this.metrics.record(res);
        return res;
      } catch (err) {
        this.metrics.recordError('dns', this._clock.now() - start);
        throw err;
      }
    }

    const res: LookupResult = {
      instances: [],
      source: this._localClusterId,
      cached: false,
      latencyMs: this._clock.now() - start,
    };
    this.metrics.record(res);
    return res;
  }

  /** Run a health sweep across all tracked instances. */
  sweepHealth(): HealthReport[] {
    return this.health.sweep();
  }
}
