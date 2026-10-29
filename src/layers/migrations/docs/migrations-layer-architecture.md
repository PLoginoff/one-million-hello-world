# Migrations Layer Architecture

## Position
Layer 40

## Responsibility
Database migration and versioning.

## Structure

```
migrations/
├── index.ts                              — barrel export
├── interfaces/IMigrations.ts                 — layer contract
├── implementations/Migrations.ts             — execute/configure/getStatus impl
├── strategies/                           — five pluggable strategies
├── factories/                            — MigrationsFactory, MigrationsStrategyFactory
├── configuration/                        — builders, defaults, validators
├── domain/                               — entities, events, handlers, policies,
│                                           specifications, value objects, services
├── adapters/                             — InMemory, Mock, Stub
├── health/MigrationsHealthCheck.ts
├── metrics/MigrationsPrometheusMetricsCollector.ts
├── statistics/MigrationsMetricsCollector.ts
├── types/                                — context, error, result, config types
└── utils/                                — MigrationsError, MigrationsErrorMapper
```

## Components

### Core
- **`IMigrations`** — interface with `execute(context)`, `configure(config)`,
  `getStatus()`.
- **`Migrations`** — concrete implementation; wraps `_process` with timing and
  records `successCount` / `failureCount` / `lastExecutionTime` metrics
  in an internal map.

### Strategies (`strategies/`)
Each implements `IMigrationsStrategy` (`name`, `priority`, `canHandle`,
`execute`):

| Strategy | Priority | Purpose |
|----------|----------|---------|
| `MigrationsDefaultStrategy` | 0 | Standard balanced path |
| `MigrationsFastStrategy` | 5 | Low-latency path |
| `MigrationsReliableStrategy` | 10 | Correctness/durability emphasis |
| `MigrationsCachedStrategy` | 7 | In-memory result caching |
| `MigrationsBatchStrategy` | 3 | Bulk processing |

`MigrationsStrategyFactory` instantiates by name (`default`, `fast`,
`reliable`, `cached`, `batch`), allows `registerStrategy` for
custom strategies, and `createByPriority()` returns them sorted by
priority.

### Domain (`domain/`)
- **Entities**: `MigrationsEntity`, `MigrationsExecution`,
  `MigrationsConfigState`, `MigrationsMetricsSnapshot`.
- **Handlers**: `MigrationsCommandHandler`, `MigrationsQueryHandler`,
  `MigrationsEventHandler` — CQRS-style dispatch.
- **Services**: `MigrationsDomainService`/`MigrationsExecutionService`,
  `MigrationsQueryService`, `MigrationsValidationService`.
- **Events**: `MigrationsExecuted`, `MigrationsFailed`.
- **Policies**: `MigrationsAccessPolicy`, `MigrationsRatePolicy`.
- **Specifications**: `And`/`Or`/`Not` combinators over
  `IMigrationsSpecification`.
- **Decorators**: `MigrationsCachingDecorator`,
  `MigrationsLoggingDecorator`.
- **Value objects**: `MigrationsPriority`, `MigrationsThreshold`,
  `MigrationsTimeWindow`, `MigrationsValueObject`.
- **Pipeline**: `MigrationsProcessingPipeline`.
- **Repository**: `MigrationsInMemoryRepository`.

### Adapters (`adapters/`)
- `InMemoryAdapter` — working in-memory implementation for dev/tests.
- `MockAdapter`, `StubAdapter` — test doubles.

### Cross-cutting
- `MigrationsHealthCheck` — liveness/status probe.
- `MigrationsPrometheusMetricsCollector` — Prometheus-format metrics.
- `MigrationsMetricsCollector` — internal statistics.
- `MigrationsError` / `MigrationsErrorMapper` — typed errors and mapping.

## Integration
The layer receives input from the previous layer and delegates onward via
`IMigrations`. Strategies are selected through the factory; decorators wrap
the implementation for cross-cutting concerns.

## Testing
See [testing.md](testing.md).
