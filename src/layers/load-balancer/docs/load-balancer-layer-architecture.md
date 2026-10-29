# LoadBalancer Layer Architecture

## Position
Layer 27. Responsibility: load balancing and traffic distribution across upstream backends.

## Backend Model
`types/backend.ts` defines the backend lifecycle — `healthy` (eligible), `degraded` (eligible but weighted down), `unhealthy` (excluded). `BackendPool` (`strategies/BackendPool.ts`) is the shared registry: tracks per-backend health, in-flight connection counts, and latency statistics, and notifies registered strategies on membership changes so e.g. `ConsistentHashing` can rebuild its ring.

Health transitions: `unhealthy → healthy` on probe success, `healthy → unhealthy` after N probe failures or admin action.

## Balancing Strategies (`strategies/`)

| Strategy | Algorithm |
|----------|-----------|
| `RoundRobinStrategy` | Sequential rotation over eligible backends |
| `WeightedRoundRobinStrategy` | Smooth weighted round robin — proportional distribution without bursts |
| `LeastConnectionsStrategy` | Routes to the backend with fewest active connections; O(N) scan |
| `LeastResponseTimeStrategy` | Routes to lowest observed latency from pool stats |
| `ConsistentHashingStrategy` | Karger-style ring with virtual nodes; `hash("${backend.id}#${i}")` points on a 32-bit ring, binary-search lookup O(log V). Key-affinity routing with minimal remapping on membership change |
| `RandomStrategy` | Uniform random pick |
| `IPHashStrategy` | Hashes client IP to a backend — sticky sessions without state |
| `PowerOfTwoChoicesStrategy` | Mitzenmacher's two-choice: sample two backends, route to the less loaded; O(1) with Θ(log log n) max load vs Θ(log n/log log n) for d=1. Generalized to d choices |

The generic `ILoadBalancerStrategy` set (`default`, `fast`, `reliable`, `cached`, `batch`) also exists for pipeline compatibility, created via `LoadBalancerStrategyFactory`.

## Layer Contract
`ILoadBalancer` (`interfaces/`): `execute(context)`, `configure(config)`, `getStatus()`. `LoadBalancer` (`implementations/`) returns `LoadBalancerResult` (`{ success, data?, error? }`, code `LOADBALANCER_EXECUTION_ERROR`) and tracks `successCount`/`failureCount`/`lastExecutionTime` metrics.

## Adapters
`RoundRobinAdapter` and `WeightedAdapter` expose round-robin and weighted selection behind adapter interfaces (the standard InMemory/Mock/Stub triple is absent here — these are the concrete adapters).

## Domain Model (`domain/`)
Entities (`LoadBalancerEntity`, `ConfigState`, `Execution`, `MetricsSnapshot`), value objects, domain/execution/query/validation services, events, handlers, in-memory repository, mapper, decorators, observer, pipeline, policies, specifications.

## Supporting
`configuration/` (builders, defaults, validators), `factories/` (`LoadBalancerFactory`, `LoadBalancerStrategyFactory`), `health/`, `metrics/` (Prometheus), `statistics/`, `utils/` (`LoadBalancerError`, `LoadBalancerErrorMapper`).
