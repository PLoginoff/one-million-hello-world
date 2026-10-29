# ServiceDiscovery Layer Architecture

## Position
Layer 28

## Responsibility
Service discovery and registration. The layer provides a local registry
implementation plus in-memory emulations of real discovery backends
(Consul, etcd, DNS) so consumers can code against one contract
(`IServiceRegistry`) regardless of the backend.

## Shared model (`types/service-instance.ts`)
- `ServiceInstance` — id, serviceName, host, port, scheme, health
  (`'up' | 'down' | 'unknown' | 'starting'`), tags, metadata,
  `registeredAt`, `lastHeartbeatAt`, `missedHeartbeats`.
- `InstanceQuery` + `matchesQuery()` — filter by serviceName, required
  tags, any-of tags, health states, exact metadata.
- `IServiceRegistry` — `register`, `deregister`, `heartbeat`, `get`,
  `query`, `watch`, `tick` (drives eviction), `size`.
- `RegistryEvent`/`RegistryWatcher` — change notifications.

## Strategies (`strategies/`)
- **`InMemoryRegistry`** — reference implementation: O(1) by-id map,
  service-name index, tag queries, synchronous FIFO watch dispatch,
  heartbeat liveness (`heartbeatTtlMs` → `unknown`,
  `evictAfterMissed` → evict).
- **`HeartbeatHealthChecker`** — TTL-based health sweep; the host calls
  `tick()` (no internal timer — cron- and test-friendly). Mirrors
  Eureka/Consul/K8s lease models.
- **`WatchNotifier`** — pub/sub over `watch()` with `EventFilter`
  (type/serviceName/instanceId), buffering, and replay for late
  subscribers (Consul blocking-query style).
- **`DnsResolver`** — canned A/AAAA/SRV record table with RFC 2782
  weighted SRV selection; no real DNS traffic.
- Plus the five generic layer strategies (`ServiceDiscoveryDefault/Fast/
  Reliable/Cached/Batch`) and `ServiceDiscoveryStrategyFactory`.

## Adapters (`adapters/`)
- **`InMemoryDiscoveryAdapter`**, **`ConsulDiscoveryAdapter`** —
  `IServiceDiscovery` adapters for local/Consul-shaped flows.
- **`ConsulLikeAdapter`** — Consul catalog + health-check emulation:
  `agent.service.register`, `health.service(name, passing)`, checks
  with `passing | warning | critical`. An instance is passing iff **all**
  its checks pass (matches real Consul).
- **`EtcdLikeAdapter`** — etcd emulation: `/services/<name>/<id>` key
  layout, leases (TTL + keepalive), monotonically-increasing `revision`
  (bumped exactly once per mutation, in commit order), prefix watches.

## Layer scaffold
`ServiceDiscovery` facade + `IServiceDiscovery`, `domain/` (entities,
value objects, services, repository, specifications, policies,
pipeline, decorators, handlers, `ServiceDiscoveryExecuted/Failed`
events), `ServiceDiscoveryHealthCheck`,
`ServiceDiscoveryMetricsCollector`,
`ServiceDiscoveryPrometheusMetricsCollector`,
`ServiceDiscoveryError`/`ErrorMapper`.

## Testing
See `testing.md`.
