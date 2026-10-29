# DataWarehouse Layer Architecture

## Position
Layer 77. Responsibility: data warehouse abstraction — a uniform `execute(context)` entry point that front-ends warehouse operations (load, query, aggregation) behind strategy selection.

## Core Contract
`IDataWarehouse` (`interfaces/`) defines three methods:

- `execute(context: DataWarehouseContext): Promise<DataWarehouseResult<unknown>>`
- `configure(config: Record<string, unknown>): void` — shallow-merges config
- `getStatus(): Record<string, unknown>` — returns `{ config, metrics, active }`

`DataWarehouse` (`implementations/DataWarehouse.ts`) is the default implementation: it processes the context, records `successCount`/`failureCount`/`lastExecutionTime` metrics in an internal `Map`, and returns `DataWarehouseResult` (`{ success, data?, error? }`) with error code `DATAWAREHOUSE_EXECUTION_ERROR` on failure.

## Types (`types/data-warehouse-types.ts`)
- `DataWarehouseContext` — `{ input, metadata, timestamp }`
- `DataWarehouseResult<T>` / `DataWarehouseError`
- `DataWarehouseConfig` — `{ enabled, timeout, retries, logLevel }`

## Strategies (`strategies/`)
All strategies implement `IDataWarehouseStrategy` (`name`, `priority`, `canHandle`, `execute`) and are created via `DataWarehouseStrategyFactory` (`factories/`):

| Strategy | Priority | Purpose |
|----------|----------|---------|
| `default` | 0 | Balanced pass-through processing |
| `fast` | 1 | Low-latency path |
| `reliable` | 2 | Reliability-oriented execution |
| `cached` | 4 | Caches results for repeated inputs |
| `batch` | 3 | Bulk/batch-oriented operations |

## Domain Model (`domain/`)
Self-contained DDD layer exercised by `domain/__tests__/`:

- **Entities**: `DataWarehouseEntity`, `DataWarehouseConfigState`, `DataWarehouseExecution`, `DataWarehouseMetricsSnapshot`
- **Value objects**: `DataWarehouseValueObject`, `DataWarehousePriority`, `DataWarehouseThreshold`, `DataWarehouseTimeWindow`
- **Services**: `DataWarehouseDomainService`, `ExecutionService`, `QueryService`, `ValidationService`
- **Events**: `DataWarehouseExecuted`, `DataWarehouseFailed`
- **Handlers**: command, query, and event handlers
- **Supporting**: `DataWarehouseInMemoryRepository`, `DataWarehouseMapper`, caching/logging decorators, `DataWarehouseEventObserver`, `DataWarehouseProcessingPipeline`, access/rate policies, And/Or/Not specifications

## Adapters (`adapters/`)
`InMemoryAdapter`, `MockAdapter`, `StubAdapter` — test/integration doubles for the layer contract.

## Cross-cutting
- `configuration/` — `DataWarehouseConfigurationBuilder`, defaults (`DEFAULT_DATAWAREHOUSE_CONFIG`), validators
- `health/DataWarehouseHealthCheck`, `metrics/` Prometheus collector, `statistics/` metrics collector
- `utils/` — `DataWarehouseError`, `DataWarehouseErrorMapper`
