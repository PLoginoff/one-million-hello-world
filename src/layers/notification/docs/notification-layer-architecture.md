# Notification Layer Architecture

## Position
Product Layer 2

## Responsibility
Email, SMS, and push notification abstractions.

## Structure

```
notification/
├── index.ts                              — barrel export
├── interfaces/INotification.ts                 — layer contract
├── implementations/Notification.ts             — execute/configure/getStatus impl
├── strategies/                           — five pluggable strategies
├── factories/                            — NotificationStrategyFactory
├── configuration/                        — builders, defaults, validators
├── domain/                               — entities, events, handlers, policies,
│                                           specifications, value objects, services
├── adapters/                             — InMemory, Mock, Stub
├── health/NotificationHealthCheck.ts
├── metrics/NotificationPrometheusMetricsCollector.ts
├── statistics/NotificationMetricsCollector.ts
├── types/                                — context, error, result, config types
└── utils/                                — NotificationError, NotificationErrorMapper
```

## Components

### Core
- **`INotification`** — interface with `execute(context)`, `configure(config)`,
  `getStatus()`.
- **`Notification`** — concrete implementation; wraps `_process` with timing and
  records `successCount` / `failureCount` / `lastExecutionTime` metrics
  in an internal map.

### Strategies (`strategies/`)
Each implements `INotificationStrategy` (`name`, `priority`, `canHandle`,
`execute`):

| Strategy | Priority | Purpose |
|----------|----------|---------|
| `NotificationDefaultStrategy` | 0 | Standard balanced path |
| `NotificationFastStrategy` | 5 | Low-latency path |
| `NotificationReliableStrategy` | 10 | Correctness/durability emphasis |
| `NotificationCachedStrategy` | 7 | In-memory result caching |
| `NotificationBatchStrategy` | 3 | Bulk processing |

`NotificationStrategyFactory` instantiates by name (`default`, `fast`,
`reliable`, `cached`, `batch`), allows `registerStrategy` for
custom strategies, and `createByPriority()` returns them sorted by
priority.

### Domain (`domain/`)
- **Entities**: `NotificationEntity`, `NotificationExecution`,
  `NotificationConfigState`, `NotificationMetricsSnapshot`.
- **Handlers**: `NotificationCommandHandler`, `NotificationQueryHandler`,
  `NotificationEventHandler` — CQRS-style dispatch.
- **Services**: `NotificationDomainService`/`NotificationExecutionService`,
  `NotificationQueryService`, `NotificationValidationService`.
- **Events**: `NotificationExecuted`, `NotificationFailed`.
- **Policies**: `NotificationAccessPolicy`, `NotificationRatePolicy`.
- **Specifications**: `And`/`Or`/`Not` combinators over
  `INotificationSpecification`.
- **Decorators**: `NotificationCachingDecorator`,
  `NotificationLoggingDecorator`.
- **Value objects**: `NotificationPriority`, `NotificationThreshold`,
  `NotificationTimeWindow`, `NotificationValueObject`.
- **Pipeline**: `NotificationProcessingPipeline`.
- **Repository**: `NotificationInMemoryRepository`.

### Adapters (`adapters/`)
- `InMemoryAdapter` — working in-memory implementation for dev/tests.
- `MockAdapter`, `StubAdapter` — test doubles.

### Cross-cutting
- `NotificationHealthCheck` — liveness/status probe.
- `NotificationPrometheusMetricsCollector` — Prometheus-format metrics.
- `NotificationMetricsCollector` — internal statistics.
- `NotificationError` / `NotificationErrorMapper` — typed errors and mapping.

## Integration
The layer receives input from the previous layer and delegates onward via
`INotification`. Strategies are selected through the factory; decorators wrap
the implementation for cross-cutting concerns.

## Testing
See [testing.md](testing.md).
