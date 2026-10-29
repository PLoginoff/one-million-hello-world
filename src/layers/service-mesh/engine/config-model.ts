/**
 * Service Mesh — control-plane data model
 *
 * The types here model the Envoy-like proxy configuration a mesh
 * control plane pushes to sidecars: listeners accept traffic, routes
 * match and forward it, clusters describe upstream endpoints with load
 * balancing, outlier ejection and retry policy.
 *
 * Everything is plain data (`toJSON`-friendly) — the generator classes
 * in `ProxyConfigGenerator` produce these shapes from a service
 * registry.
 *
 * @module ServiceMeshLayer/Engine
 */

export type Protocol = 'http' | 'grpc' | 'tcp';

/** SPIFFE-like workload identity: spiffe://trust-domain/ns/namespace/sa/account */
export type SpiffeId = string;

/** A single upstream endpoint (one workload instance). */
export interface Endpoint {
  readonly address: string;
  readonly port: number;
  /** Locality for topology-aware routing (region/zone/subzone). */
  readonly locality?: { region: string; zone: string; subzone?: string };
  /** Weights >1 bias the endpoint within a locality. */
  readonly weight?: number;
  /** True while the endpoint is ejected by outlier detection. */
  readonly healthy?: boolean;
  readonly identity?: SpiffeId;
}

/** Weighted backend cluster reference for traffic splitting. */
export interface WeightedCluster {
  readonly name: string;
  /** 0-100; all weights for one route must sum to 100. */
  readonly weight: number;
  /** Optional per-cluster override of route-level retry budget. */
  readonly requestHeadersToAdd?: Readonly<Record<string, string>>;
}

/** Retry policy attached to a route or cluster. */
export interface RetryPolicy {
  readonly attempts: number;
  readonly perTryTimeoutMs: number;
  /** e.g. '5xx,reset,connect-failure' — conditions that trigger a retry. */
  readonly retryOn: ReadonlyArray<string>;
  /** Budget: max active retries as a fraction of active requests (0-1). */
  readonly budgetPercent?: number;
  /** Budget: max absolute concurrent retries. */
  readonly budgetMax?: number;
}

/** A route: match → action. */
export interface RouteConfig {
  readonly name: string;
  /** Path prefix match (e.g. '/api/'). */
  readonly prefix?: string;
  /** Exact path match. */
  readonly path?: string;
  /** Header matches — all must hold. */
  readonly headers?: Readonly<Record<string, string>>;
  /** Single destination cluster (mutually exclusive with weighted). */
  readonly cluster?: string;
  /** Weighted split across clusters — must sum to 100. */
  readonly weightedClusters?: ReadonlyArray<WeightedCluster>;
  readonly timeoutMs?: number;
  readonly retryPolicy?: RetryPolicy;
}

/** A listener binds a port and routes to upstream clusters. */
export interface ListenerConfig {
  readonly name: string;
  readonly port: number;
  readonly protocol: Protocol;
  readonly routes: ReadonlyArray<RouteConfig>;
  /** mTLS required on the inbound connection. */
  readonly requireClientCert?: boolean;
}

/** Outlier detection: eject an endpoint after N consecutive 5xx. */
export interface OutlierDetectionConfig {
  readonly consecutive5xx: number;
  /** Ejection base duration; grows exponentially per subsequent ejection. */
  readonly baseEjectionMs: number;
  /** Cap on ejection duration growth. */
  readonly maxEjectionMs: number;
  /** Max % of endpoints allowed to be ejected simultaneously. */
  readonly maxEjectionPercent: number;
  /** Analysis interval — counters reset each interval. */
  readonly intervalMs: number;
}

/** A cluster = one upstream service version + its endpoints + policies. */
export interface ClusterConfig {
  readonly name: string;
  /** Service this cluster belongs to (a service may have v1/v2 clusters). */
  readonly service: string;
  /** Version label, e.g. 'v1', 'canary', 'stable'. */
  readonly version: string;
  readonly endpoints: ReadonlyArray<Endpoint>;
  readonly connectTimeoutMs?: number;
  readonly outlierDetection?: OutlierDetectionConfig;
  /** Circuit breaker thresholds. */
  readonly circuitBreakers?: {
    readonly maxConnections?: number;
    readonly maxPendingRequests?: number;
    readonly maxRequests?: number;
    readonly maxRetries?: number;
  };
  readonly lbPolicy?: 'round-robin' | 'least-request' | 'random' | 'locality-aware';
}

/** A full proxy snapshot pushed to a sidecar. */
export interface ProxyConfig {
  readonly nodeId: string;
  readonly listeners: ReadonlyArray<ListenerConfig>;
  readonly clusters: ReadonlyArray<ClusterConfig>;
  /** mTLS identity config for the workload itself. */
  readonly identity?: {
    readonly spiffeId: SpiffeId;
    readonly certExpiresMs: number;
    readonly rootCa: string;
  };
  readonly generatedAtMs: number;
  readonly version: number;
}
