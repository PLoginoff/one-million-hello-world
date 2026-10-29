# QueryObject Layer Architecture

## Position
Layer 64

## Responsibility
Query object and specification queries.

## Structure

```
query-object/
├── index.ts                              — barrel export
├── interfaces/IQueryObject.ts                 — layer contract
├── implementations/QueryObject.ts             — execute/configure/getStatus impl
├── strategies/                           — five pluggable strategies
├── factories/                            — QueryObjectFactory, QueryObjectStrategyFactory
├── configuration/                        — builders, defaults, validators
├── domain/                               — entities, events, handlers, policies,
│                                           specifications, value objects, services
├── adapters/                             — InMemory, Mock, Stub
├── health/QueryObjectHealthCheck.ts
├── metrics/QueryObjectPrometheusMetricsCollector.ts
├── statistics/QueryObjectMetricsCollector.ts
├── types/                                — context, error, result, config types
└── utils/                                — QueryObjectError, QueryObjectErrorMapper
```

## Components

### Core
- **`IQueryObject`** — interface with `execute(context)`, `configure(config)`,
  `getStatus()`.
- **`QueryObject`** — concrete implementation; wraps `_process` with timing and
  records `successCount` / `failureCount` / `lastExecutionTime` metrics
  in an internal map.

### Strategies (`strategies/`)
Each implements `IQueryObjectStrategy` (`name`, `priority`, `canHandle`,
`execute`):

| Strategy | Priority | Purpose |
|----------|----------|---------|
| `QueryObjectDefaultStrategy` | 0 | Standard balanced path |
| `QueryObjectFastStrategy` | 5 | Low-latency path |
| `QueryObjectReliableStrategy` | 10 | Correctness/durability emphasis |
| `QueryObjectCachedStrategy` | 7 | In-memory result caching |
| `QueryObjectBatchStrategy` | 3 | Bulk processing |

`QueryObjectStrategyFactory` instantiates by name (`default`, `fast`,
`reliable`, `cached`, `batch`), allows `registerStrategy` for
custom strategies, and `createByPriority()` returns them sorted by
priority.

### Domain (`domain/`)
- **Entities**: `QueryObjectEntity`, `QueryObjectExecution`,
  `QueryObjectConfigState`, `QueryObjectMetricsSnapshot`.
- **Handlers**: `QueryObjectCommandHandler`, `QueryObjectQueryHandler`,
  `QueryObjectEventHandler` — CQRS-style dispatch.
- **Services**: `QueryObjectDomainService`/`QueryObjectExecutionService`,
  `QueryObjectQueryService`, `QueryObjectValidationService`.
- **Events**: `QueryObjectExecuted`, `QueryObjectFailed`.
- **Policies**: `QueryObjectAccessPolicy`, `QueryObjectRatePolicy`.
- **Specifications**: `And`/`Or`/`Not` combinators over
  `IQueryObjectSpecification`.
- **Decorators**: `QueryObjectCachingDecorator`,
  `QueryObjectLoggingDecorator`.
- **Value objects**: `QueryObjectPriority`, `QueryObjectThreshold`,
  `QueryObjectTimeWindow`, `QueryObjectValueObject`.
- **Pipeline**: `QueryObjectProcessingPipeline`.
- **Repository**: `QueryObjectInMemoryRepository`.

### Adapters (`adapters/`)
- `InMemoryAdapter` — working in-memory implementation for dev/tests.
- `MockAdapter`, `StubAdapter` — test doubles.

### Cross-cutting
- `QueryObjectHealthCheck` — liveness/status probe.
- `QueryObjectPrometheusMetricsCollector` — Prometheus-format metrics.
- `QueryObjectMetricsCollector` — internal statistics.
- `QueryObjectError` / `QueryObjectErrorMapper` — typed errors and mapping.

## Integration
The layer receives input from the previous layer and delegates onward via
`IQueryObject`. Strategies are selected through the factory; decorators wrap
the implementation for cross-cutting concerns.

## Testing
See [testing.md](testing.md).
