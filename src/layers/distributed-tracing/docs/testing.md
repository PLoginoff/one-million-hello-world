# Testing: DistributedTracing Layer

## Running tests

```bash
bun test ./src/layers/distributed-tracing/
```

## Test files

`__tests__/`:

| File | Covers |
|------|--------|
| `DistributedTracing.test.ts` | `execute()` success/failure, `configure()` merge, `getStatus()` + metrics |
| `DistributedTracingStrategies.test.ts` | Five strategies + `DistributedTracingStrategyFactory` |
| `DistributedTracingConfiguration.test.ts` | Config builder/validator, defaults |

`domain/__tests__/` — `DistributedTracingDomain`, `ExtendedDomain`, `Services`, `Patterns` cover entities, value objects, services, repository, events, handlers, decorators, observer, pipeline, policies, specifications.

## Conventions
- `createContext(input)` builds `DistributedTracingContext` fixtures; strategy tests are table-driven.
- All adapters are in-memory — no exporter or network needed.
