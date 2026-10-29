/**
 * Mesh Control Plane
 *
 * Holds the service registry and derives `ProxyConfig` snapshots per
 * workload. This is the "what should each sidecar know" half of the
 * mesh — data-plane traffic decisions (load balancing, ejection) live
 * in `HealthTracker` / `LocalityRouter`.
 *
 * @module ServiceMeshLayer/Engine
 */

import {
  ClusterConfig,
  Endpoint,
  ListenerConfig,
  OutlierDetectionConfig,
  ProxyConfig,
  RetryPolicy,
  RouteConfig,
  WeightedCluster,
} from './config-model';
import { SpiffeIdentityManager } from './mtls';
import { IClock, SystemClock } from '../../observability/engine/signals';

/** A registered service with one or more versions (clusters). */
export interface ServiceRegistration {
  readonly name: string;
  /** Inbound port the sidecar listens on for this service. */
  readonly port: number;
  readonly protocol: 'http' | 'grpc' | 'tcp';
  /** Version → endpoints. */
  readonly versions: Map<string, Endpoint[]>;
  /** Default outlier detection for all clusters of this service. */
  readonly outlierDetection?: OutlierDetectionConfig;
  /** Default retry policy applied to routes. */
  readonly retryPolicy?: RetryPolicy;
  /** Traffic split (version → weight 0-100). Sum must be 100 when >1 version. */
  trafficSplit?: Record<string, number>;
}

export interface ControlPlaneConfig {
  readonly trustDomain: string;
  readonly defaultConnectTimeoutMs?: number;
}

export class MeshControlPlane {
  private readonly _services: Map<string, ServiceRegistration> = new Map();
  private readonly _identities: SpiffeIdentityManager;
  private readonly _trustDomain: string;
  private readonly _connectTimeout: number;
  private readonly _clock: IClock;
  private _version = 0;

  constructor(config: ControlPlaneConfig, clock: IClock = new SystemClock()) {
    this._trustDomain = config.trustDomain;
    this._connectTimeout = config.defaultConnectTimeoutMs ?? 5_000;
    this._clock = clock;
    this._identities = new SpiffeIdentityManager(config.trustDomain, clock);
  }

  get identityManager(): SpiffeIdentityManager {
    return this._identities;
  }

  registerService(reg: ServiceRegistration): void {
    if (reg.trafficSplit) {
      const sum = Object.values(reg.trafficSplit).reduce((a, b) => a + b, 0);
      if (sum !== 100) {
        throw new MeshConfigError(`trafficSplit for ${reg.name} sums to ${sum}, expected 100`);
      }
      for (const v of Object.keys(reg.trafficSplit)) {
        if (!reg.versions.has(v)) {
          throw new MeshConfigError(`trafficSplit references unknown version "${v}" on ${reg.name}`);
        }
      }
    }
    this._services.set(reg.name, reg);
  }

  unregisterService(name: string): boolean {
    return this._services.delete(name);
  }

  getService(name: string): ServiceRegistration | undefined {
    return this._services.get(name);
  }

  setTrafficSplit(service: string, split: Record<string, number>): void {
    const reg = this._services.get(service);
    if (!reg) throw new MeshConfigError(`unknown service ${service}`);
    const sum = Object.values(split).reduce((a, b) => a + b, 0);
    if (sum !== 100) {
      throw new MeshConfigError(`split for ${service} sums to ${sum}, expected 100`);
    }
    for (const v of Object.keys(split)) {
      if (!reg.versions.has(v)) throw new MeshConfigError(`unknown version "${v}"`);
    }
    reg.trafficSplit = split;
  }

  /** Generate a sidecar snapshot for `workload` (a service name). */
  generateProxyConfig(workload: {
    nodeId: string;
    namespace: string;
    serviceAccount: string;
    /** Services this workload calls. */
    upstreams: ReadonlyArray<string>;
    /** Inbound routes the workload serves. */
    inboundPort: number;
    inboundProtocol?: 'http' | 'grpc' | 'tcp';
  }): ProxyConfig {
    this._version++;
    const listeners: ListenerConfig[] = [];
    const clusters: ClusterConfig[] = [];

    // Inbound listener for the workload itself.
    const self = this._services.get(workload.nodeId);
    listeners.push({
      name: `inbound_${workload.inboundPort}`,
      port: workload.inboundPort,
      protocol: workload.inboundProtocol ?? 'http',
      requireClientCert: true,
      routes: [
        {
          name: 'inbound-default',
          prefix: '/',
          cluster: `inbound|${workload.nodeId}`,
          timeoutMs: 15_000,
        },
      ],
    });

    // Outbound routes + clusters for each upstream.
    for (const up of workload.upstreams) {
      const svc = this._services.get(up);
      if (!svc) continue;
      const { route, clusters: cls } = this._routeFor(svc);
      listeners.push({
        name: `outbound_${svc.port}`,
        port: svc.port,
        protocol: svc.protocol,
        routes: [route],
      });
      clusters.push(...cls);
    }

    // Inbound cluster for the local workload.
    clusters.push({
      name: `inbound|${workload.nodeId}`,
      service: workload.nodeId,
      version: 'local',
      endpoints: [{ address: '127.0.0.1', port: workload.inboundPort }],
      lbPolicy: 'round-robin',
    });

    const cert = this._identities.issue(workload.namespace, workload.serviceAccount);
    return {
      nodeId: workload.nodeId,
      listeners,
      clusters,
      identity: {
        spiffeId: cert.spiffeId,
        certExpiresMs: cert.expiresAtMs,
        rootCa: this._trustDomain,
      },
      generatedAtMs: this._clock.nowMs(),
      version: this._version,
    };
  }

  private _routeFor(svc: ServiceRegistration): { route: RouteConfig; clusters: ClusterConfig[] } {
    const clusters: ClusterConfig[] = [];
    const versions = [...svc.versions.keys()];
    const split = svc.trafficSplit;

    for (const version of versions) {
      const endpoints = svc.versions.get(version) ?? [];
      clusters.push({
        name: `outbound|${svc.port}|${svc.name}.${version}`,
        service: svc.name,
        version,
        endpoints,
        connectTimeoutMs: this._connectTimeout,
        outlierDetection: svc.outlierDetection,
        lbPolicy: endpoints.some((e) => e.locality) ? 'locality-aware' : 'round-robin',
      });
    }

    const clusterName = (v: string) => `outbound|${svc.port}|${svc.name}.${v}`;
    let weighted: WeightedCluster[] | undefined;
    if (split && Object.keys(split).length > 1) {
      weighted = Object.entries(split)
        .filter(([, w]) => w > 0)
        .map(([v, w]) => ({ name: clusterName(v), weight: w }));
    }

    const route: RouteConfig = {
      name: `route-${svc.name}`,
      prefix: '/',
      ...(weighted && weighted.length > 1
        ? { weightedClusters: weighted }
        : { cluster: clusterName(split ? Object.keys(split)[0] : versions[0]) }),
      timeoutMs: 15_000,
      retryPolicy: svc.retryPolicy,
    };
    return { route, clusters };
  }

  serviceNames(): string[] {
    return [...this._services.keys()];
  }
}

export class MeshConfigError extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = 'MeshConfigError';
  }
}
