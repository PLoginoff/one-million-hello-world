# MessageBus Layer Architecture

## Position
Layer 43

## Responsibility
Enterprise message bus and event streaming.

## Structure

```
message-bus/
├── index.ts                       — barrel export
├── interfaces/IMessageBus.ts      — layer contract
├── implementations/MessageBus.ts  — execute/configure/getStatus implementation
├── strategies/                    — five pluggable strategies
├── factories/                     — MessageBusFactory, MessageBusStrategyFactory
├── configuration/                 — builder, defaults, validators
├── domain/                        — entities, events, handlers, policies,
│                                    specifications, value objects, services
├── adapters/                      — InMemory, Mock, Stub
├── health/MessageBusHealthCheck.ts
├── metrics/MessageBusPrometheusMetricsCollector.ts
├── statistics/MessageBusMetricsCollector.ts
├── types/message-bus-types.ts
└── utils/                         — MessageBusError, MessageBusErrorMapper
```

## Components

### Core
- **`IMessageBus`** — interface with `execute(context)`, `configure(config)`, `getStatus()`.
- **`MessageBus`** — concrete implementation; wraps `_process` with timing and
  success/failure metric recording (`successCount`, `failureCount`,
  `lastExecutionTime`) in an internal `Map`.

### Strategies (`strategies/`)
Each implements `IMessageBusStrategy` (`name`, `priority`, `canHandle`, `execute`):

| Strategy | Priority | Purpose |
|----------|----------|---------|
| `MessageBusDefaultStrategy` | 0 | Standard balanced dispatch |
| `MessageBusFastStrategy` | 5 | Low-latency path |
| `MessageBusReliableStrategy` | 10 | Delivery-guarantee emphasis |
| `MessageBusCachedStrategy` | 7 | In-memory result caching |
| `MessageBusBatchStrategy` | 3 | Bulk-message processing |

`MessageBusStrategyFactory` instantiates by name (`default`, `fast`, `reliable`,
`cached`, `batch`), supports `registerStrategy` for custom strategies, and
`createByPriority()` for priority-sorted execution.

### Domain (`domain/`)
- **Entities**: `MessageBusEntity`, `MessageBusExecution`, `MessageBusConfigState`,
  `MessageBusMetricsSnapshot`.
- **Handlers**: `MessageBusCommandHandler`, `MessageBusQueryHandler`,
  `MessageBusEventHandler` — CQRS-style dispatch.
- **Services**: `MessageBusDomainService`, `MessageBusExecutionService`,
  `MessageBusQueryService`, `MessageBusValidationService`.
- **Events**: `MessageBusExecuted`, `MessageBusFailed`.
- **Policies**: `MessageBusAccessPolicy`, `MessageBusRatePolicy`.
- **Specifications**: `And`/`Or`/`Not` combinators over
  `IMessageBusSpecification` for message filtering.
- **Decorators**: `MessageBusCachingDecorator`, `MessageBusLoggingDecorator`.
- **Value objects**: `MessageBusPriority`, `MessageBusThreshold`,
  `MessageBusTimeWindow`, `MessageBusValueObject`.
- **Pipeline**: `MessageBusProcessingPipeline` — ordered processing steps.
- **Repository**: `MessageBusInMemoryRepository`.

### Adapters (`adapters/`)
- `InMemoryAdapter` — working in-memory bus for tests/dev.
- `MockAdapter`, `StubAdapter` — test doubles.

## Integration
The layer receives input from the previous layer and delegates to the next
layer through `IMessageBus`. Strategies are selected via the factory;
decorators wrap the bus for cross-cutting concerns.

## Testing
See [testing.md](testing.md).
