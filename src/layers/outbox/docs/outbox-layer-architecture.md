# Outbox Layer Architecture

## Position
Layer 56

## Responsibility
Transactional outbox pattern: persist domain messages alongside the
aggregate change, then publish them asynchronously with retries and a
dead-letter-equivalent `failed` state.

## Structure

```
outbox/
├── index.ts                           — barrel export
├── interfaces/IOutbox.ts
├── implementations/Outbox.ts          — generic execute/configure/getStatus impl
├── strategies/                        — default / fast / reliable / cached / batch
│                                        (+ OutboxStrategy contract)
├── factories/                         — OutboxFactory, OutboxStrategyFactory
├── configuration/                     — builders, defaults, validators
├── domain/                            — entities, events, handlers, policies,
│                                        specifications, value objects, services
├── adapters/                          — InMemory, Mock, Stub
├── errors/OutboxErrors.ts             — typed error hierarchy
├── health/OutboxHealthCheck.ts
├── metrics/OutboxPrometheusMetricsCollector.ts
├── statistics/OutboxMetricsCollector.ts
├── types/outbox-types.ts              — message model, status enum, events,
│                                        adapter contract, metrics shapes
└── utils/                             — OutboxError, OutboxErrorMapper
```

## Message Model (`types/outbox-types.ts`)

`OutboxMessage<T>` carries `id`, `aggregateId`, `aggregateType`,
`eventType`, `payload`, `metadata`, `createdAt`, `processedAt`,
`retryCount`, `maxRetries`, and a `status` in
`OutboxMessageStatus` (`pending → processing → processed | failed →
archived`). `OutboxStats` aggregates per-status counts.

`OutboxConfiguration` extends the base layer config with
`strategy`, `maxBatchSize`, `pollIntervalMs`, `retentionDays`,
`enableMetrics`, `enableHealthCheck`.

## Adapter Contract (`IOutboxAdapter`)

Persistence is abstracted behind `IOutboxAdapter`:

```
connect / disconnect / isConnected
saveMessage / getMessage / getMessages({status, limit, offset})
updateMessage / markProcessed / markFailed / archiveMessage
getStats / clear
```

Three adapters ship: `InMemoryAdapter` (working store),
`MockAdapter`, `StubAdapter` (test doubles).

## Events (`OutboxEventType`)

Lifecycle events are first-class: `message_created`, `message_processing`,
`message_processed`, `message_failed`, `message_retried`,
`message_archived`, `batch_processed`, `config_changed` — each with a
typed payload (`MessageCreatedPayload`, `MessageFailedPayload`, …).

## Strategies (`strategies/`)

`IOutboxStrategy` takes an `OutboxStrategyContext` (`operation`, optional
`message`, `batchSize`, `config`) and returns `OutboxStrategyResult`.
Five strategies ship: `DefaultStrategy` (priority 0), `FastStrategy` (5),
`ReliableStrategy` (10), `CachedStrategy` (7), `BatchStrategy` (3).
`OutboxStrategyFactory` creates them by name.

## Errors (`errors/OutboxErrors.ts`)

Typed hierarchy rooted at `OutboxError`:
`MessageNotFoundError`, `MaxRetriesExceededError`,
`MessageAlreadyProcessedError`, `InvalidConfigurationError`,
`AdapterConnectionFailedError`, `AdapterOperationFailedError`,
`SerializationFailedError`, `DeserializationFailedError`.

## Domain (`domain/`)

`OutboxEntity`, `OutboxExecution`, `OutboxConfigState`,
`OutboxMetricsSnapshot`; CQRS handlers (`Command`/`Query`/`Event`);
`OutboxAccessPolicy`, `OutboxRatePolicy`; `And`/`Or`/`Not` specifications;
`OutboxProcessingPipeline`; `OutboxInMemoryRepository`; decorators for
caching and logging.

## Observability

`OutboxHealthCheck` reports `healthy | degraded | unhealthy` with
per-check entries; `OutboxPrometheusMetricsCollector` exports
`outbox_messages_total`, `outbox_processed_total`,
`outbox_failed_total`, `outbox_avg_processing_time_ms`,
`outbox_pending_count`, `outbox_processing_count`.

## Testing
See [testing.md](testing.md).
