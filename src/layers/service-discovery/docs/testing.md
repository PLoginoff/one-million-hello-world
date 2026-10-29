# Testing: ServiceDiscovery Layer

## Test Files

| File | Scope |
|------|-------|
| `__tests__/InMemoryRegistry.test.ts` | `InMemoryRegistry` (register/deregister/query/watch/heartbeat eviction), `HeartbeatHealthChecker` sweeps, `WatchNotifier` filtering and replay |
| `__tests__/DnsResolver.test.ts` | `DnsResolver` A/SRV lookup and weighted selection |
| `__tests__/ConsulLikeAdapter.test.ts` | `aggregateHealth` rule (all checks passing) and the Consul-emulating adapter |
| `__tests__/EtcdLikeAdapter.test.ts` | `EtcdLikeAdapter` leases, revisions, prefix watches |
| `__tests__/ServiceDiscoveryAdapters.test.ts` | `InMemoryDiscoveryAdapter`, `ConsulDiscoveryAdapter` |
| `__tests__/ServiceDiscovery.test.ts` | Facade: config, `execute()` result envelope |
| `__tests__/ServiceDiscoveryStrategies.test.ts` | Generic strategies + `ServiceDiscoveryStrategyFactory` |
| `__tests__/ServiceDiscoveryConfiguration.test.ts` | Builder and validator |

## Running Tests

```bash
bun test ./src/layers/service-discovery/
```

Single file:

```bash
bun test ./src/layers/service-discovery/__tests__/InMemoryRegistry.test.ts
```

Tests use `bun:test`. All registries/adapters are in-memory and
time-driven — tests inject timestamps via `tick(now)` / `heartbeat(id,
at)` rather than waiting on real timers.
