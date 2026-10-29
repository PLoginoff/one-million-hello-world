# ADR: ServiceDiscovery Layer

## Status
Accepted

## Context
Service lookup needs a backend-neutral contract. Real deployments use
Consul, etcd, or DNS, but tests and local runs cannot depend on those
services being up.

## Decisions

### 1. One `IServiceRegistry` contract for every backend
Register/deregister/heartbeat/query/watch/tick is the full surface.
`ServiceInstance` carries health, tags, metadata, and heartbeat fields
shared by all implementations.

### 2. `InMemoryRegistry` is the reference implementation
Remote adapters emulate its semantics: name-indexed lookup, tag
queries, synchronous FIFO watch dispatch, and heartbeat-driven liveness
(soft-fail to `unknown`, then evict after `evictAfterMissed` windows).
Behavioral parity is enforced by running the same expectations against
each adapter in tests.

### 3. Heartbeat checking is timer-free
`HeartbeatHealthChecker` exposes `tick(now)` instead of owning an
interval. Hosts drive it from cron/loops; tests drive it with explicit
timestamps. Same model as Eureka leases and K8s liveness probes.

### 4. Faithful backend semantics in emulations
- `ConsulLikeAdapter` aggregates checks the way Consul does: one
  `critical` check marks the whole instance unreachable.
- `EtcdLikeAdapter` keeps a global `revision` bumped once per mutation
  in commit order — the invariant watch clients rely on.
- `DnsResolver` orders SRV records per RFC 2782 (priority ascending,
  weight-proportional random within a class).

### 5. Watch with filter + replay
`WatchNotifier` adds `EventFilter` (types/service/instance) and a
replay buffer so late subscribers see recent history, matching Consul
blocking-query semantics (`X-Consul-Index`).

## Consequences
- Callers swap backends by swapping an adapter — no code changes.
- No timers or network inside the layer: everything is deterministic in
  tests.
- Emulations model client-visible semantics, not wire protocols; real
  Consul/etcd adapters would replace them behind the same interface.
