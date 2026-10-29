# Testing: LoadBalancer Layer

## Running tests

```bash
bun test ./src/layers/load-balancer/
```

## Test files

`__tests__/` — one file per real strategy plus pool/adapters/contract:

| File | Covers |
|------|--------|
| `BackendPool.test.ts` | Health state machine, in-flight tracking, membership notifications |
| `RoundRobinStrategy.test.ts` | Rotation order |
| `WeightedRoundRobinStrategy.test.ts` | Weight-proportional distribution |
| `LeastConnectionsStrategy.test.ts` | Picks least-loaded backend |
| `LeastResponseTimeStrategy.test.ts` | Latency-based routing |
| `ConsistentHashingStrategy.test.ts` | Ring construction, key affinity, remapping on membership change |
| `RandomAndIPHashStrategy.test.ts` | Random distribution, IP-hash stickiness |
| `PowerOfTwoChoicesStrategy.test.ts` | Two-choice selection, d-choice generalization, small pools |
| `LoadBalancerAdapters.test.ts` | `RoundRobinAdapter`, `WeightedAdapter` |
| `LoadBalancer.test.ts` | `ILoadBalancer` contract: `execute()`, error path, `getStatus()` |
| `LoadBalancerStrategies.test.ts` | Five generic strategies + `LoadBalancerStrategyFactory` |
| `LoadBalancerConfiguration.test.ts` | Config builder/validator, defaults |

`domain/__tests__/` — `LoadBalancerDomain`, `ExtendedDomain`, `Services`, `Patterns` cover the domain model.

## Conventions
- Pool tests inject backends and probe results directly — no real health checks or network.
- `ConsistentHashing` tests assert distribution quality and remap bounds rather than exact placement.
