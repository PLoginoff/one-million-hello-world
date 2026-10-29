# ADR: DataWarehouse Layer

## Status
Accepted

## Decisions

### 1. Uniform `execute(context)` contract
`IDataWarehouse` exposes a single `execute(DataWarehouseContext)` returning `Promise<DataWarehouseResult>` rather than operation-specific methods (load/query/aggregate). This keeps the layer interchangeable with the other pipeline layers that share the same `Context → Result` shape.

*Consequence:* callers pass operation details through `context.input`/`metadata`; typed operations must live in the strategies or domain services.

### 2. Five pluggable strategies behind a factory
Default, fast, reliable, cached, and batch strategies all implement `IDataWarehouseStrategy` (`name`/`priority`/`canHandle`/`execute`) and are instantiated by `DataWarehouseStrategyFactory`. Priority enables ordered selection when several strategies `canHandle` a context.

*Alternative rejected:* a single configurable strategy — rejected because caching and batching have genuinely different execution semantics.

### 3. Self-contained domain model
Entities, value objects, events, handlers, repository, specifications, and policies live under `domain/` with in-memory implementations, so domain logic is testable without a real warehouse backend.

*Consequence:* ~40 domain files; the in-memory repository is the only persistence provided — real warehouse adapters must be added downstream.

### 4. Immutable-style `DataWarehouseResult` with error codes
Failures return `{ success: false, error: { code: 'DATAWAREHOUSE_EXECUTION_ERROR', message } }` instead of throwing, so `execute()` never rejects and callers handle results uniformly.

### 5. Config as an open record + typed defaults
`configure()` accepts `Record<string, unknown>` merged over `DEFAULT_DATAWAREHOUSE_CONFIG` (`enabled`, `timeout: 30000`, `retries: 3`, `logLevel`), validated by `DataWarehouseConfigurationValidator`. Open records let callers pass strategy-specific options without changing the interface.
