# PolicyEngine Layer Architecture

## Position
Layer 62

## Responsibility
Policy evaluation engine.

## Structure

```
policy-engine/
├── index.ts                              — barrel export
├── interfaces/IPolicyEngine.ts                 — layer contract
├── implementations/PolicyEngine.ts             — execute/configure/getStatus impl
├── strategies/                           — five pluggable strategies
├── factories/                            — PolicyEngineFactory, PolicyEngineStrategyFactory
├── configuration/                        — builders, defaults, validators
├── domain/                               — entities, events, handlers, policies,
│                                           specifications, value objects, services
├── adapters/                             — InMemory, Mock, Stub
├── health/PolicyEngineHealthCheck.ts
├── metrics/PolicyEnginePrometheusMetricsCollector.ts
├── statistics/PolicyEngineMetricsCollector.ts
├── types/                                — context, error, result, config types
└── utils/                                — PolicyEngineError, PolicyEngineErrorMapper
```

## Components

### Core
- **`IPolicyEngine`** — interface with `execute(context)`, `configure(config)`,
  `getStatus()`.
- **`PolicyEngine`** — concrete implementation; wraps `_process` with timing and
  records `successCount` / `failureCount` / `lastExecutionTime` metrics
  in an internal map.

### Strategies (`strategies/`)
Each implements `IPolicyEngineStrategy` (`name`, `priority`, `canHandle`,
`execute`):

| Strategy | Priority | Purpose |
|----------|----------|---------|
| `PolicyEngineDefaultStrategy` | 0 | Standard balanced path |
| `PolicyEngineFastStrategy` | 5 | Low-latency path |
| `PolicyEngineReliableStrategy` | 10 | Correctness/durability emphasis |
| `PolicyEngineCachedStrategy` | 7 | In-memory result caching |
| `PolicyEngineBatchStrategy` | 3 | Bulk processing |

`PolicyEngineStrategyFactory` instantiates by name (`default`, `fast`,
`reliable`, `cached`, `batch`), allows `registerStrategy` for
custom strategies, and `createByPriority()` returns them sorted by
priority.

### Domain (`domain/`)
- **Entities**: `PolicyEngineEntity`, `PolicyEngineExecution`,
  `PolicyEngineConfigState`, `PolicyEngineMetricsSnapshot`.
- **Handlers**: `PolicyEngineCommandHandler`, `PolicyEngineQueryHandler`,
  `PolicyEngineEventHandler` — CQRS-style dispatch.
- **Services**: `PolicyEngineDomainService`/`PolicyEngineExecutionService`,
  `PolicyEngineQueryService`, `PolicyEngineValidationService`.
- **Events**: `PolicyEngineExecuted`, `PolicyEngineFailed`.
- **Policies**: `PolicyEngineAccessPolicy`, `PolicyEngineRatePolicy`.
- **Specifications**: `And`/`Or`/`Not` combinators over
  `IPolicyEngineSpecification`.
- **Decorators**: `PolicyEngineCachingDecorator`,
  `PolicyEngineLoggingDecorator`.
- **Value objects**: `PolicyEnginePriority`, `PolicyEngineThreshold`,
  `PolicyEngineTimeWindow`, `PolicyEngineValueObject`.
- **Pipeline**: `PolicyEngineProcessingPipeline`.
- **Repository**: `PolicyEngineInMemoryRepository`.

### Adapters (`adapters/`)
- `InMemoryAdapter` — working in-memory implementation for dev/tests.
- `MockAdapter`, `StubAdapter` — test doubles.

### Cross-cutting
- `PolicyEngineHealthCheck` — liveness/status probe.
- `PolicyEnginePrometheusMetricsCollector` — Prometheus-format metrics.
- `PolicyEngineMetricsCollector` — internal statistics.
- `PolicyEngineError` / `PolicyEngineErrorMapper` — typed errors and mapping.

## Integration
The layer receives input from the previous layer and delegates onward via
`IPolicyEngine`. Strategies are selected through the factory; decorators wrap
the implementation for cross-cutting concerns.

## Testing
See [testing.md](testing.md).
