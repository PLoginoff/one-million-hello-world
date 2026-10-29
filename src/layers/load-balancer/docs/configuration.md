# Configuration: LoadBalancer Layer

## Layer defaults
`DEFAULT_LOADBALANCER_CONFIG` (`configuration/defaults/`):

```ts
{ enabled: true, timeout: 30000, retries: 3, logLevel: 'info' }
```

`configure()` merges `Record<string, unknown>`; `LoadBalancerConfigurationBuilder` and validator provide typed construction.

## Backend pool
- Register backends in `BackendPool`; each has health status `healthy | degraded | unhealthy`, weight, in-flight count, and latency stats.
- Health transitions are driven by probe results: success moves `unhealthy → healthy`, N consecutive failures (or admin) move `healthy → unhealthy`.
- Strategies subscribe to pool membership changes.

## Strategy selection
Pick per deployment characteristics:

| Need | Strategy |
|------|----------|
| Even spread, homogeneous backends | `RoundRobin`, `WeightedRoundRobin` (uneven capacity) |
| Load-aware routing | `LeastConnections`, `LeastResponseTime` |
| Session affinity / cache locality | `ConsistentHashing`, `IPHash` |
| Stateless simple pick | `Random` |
| Large pools, load-aware, O(1) | `PowerOfTwoChoices` |

`ConsistentHashingStrategy` accepts `virtualNodes` per backend (more vnodes = smoother distribution, larger ring).

## Adapters
`RoundRobinAdapter`, `WeightedAdapter` wrap selection behind adapter interfaces for callers that don't use `execute()`.

## Status inspection
`getStatus()` → `{ config, metrics, active }` with `successCount`/`failureCount`/`lastExecutionTime`.
