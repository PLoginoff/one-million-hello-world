# Inbox Layer Architecture

## Position
Layer 57. Responsibility: the inbox pattern for idempotent consumers — deduplicate incoming messages so each is processed exactly once.

## Core Contract
`IInbox` (`interfaces/`): `execute(context: InboxContext)`, `configure(config)`, `getStatus()` → `{ config, metrics, active }`.

`Inbox` (`implementations/`) returns `InboxResult` (`{ success, data?, error? }`, code `INBOX_EXECUTION_ERROR`) and records `successCount`/`failureCount`/`lastExecutionTime` metrics.

## Types (`types/inbox-types.ts`)
`InboxContext` `{ input, metadata, timestamp }` — message id + payload flow through `input`/`metadata`; `InboxResult<T>`; `InboxError`; `InboxConfig` (`enabled`, `timeout`, `retries`, `logLevel`).

## Strategies (`strategies/`)
`IInboxStrategy` (`name`/`priority`/`canHandle`/`execute`) implementations via `InboxStrategyFactory`: `default` (0), `fast` (1), `reliable` (2), `batch` (3), `cached` (4). `fast` suits high-throughput dedup checks; `reliable` suits messages where double-processing is expensive; `batch` deduplicates message batches in one pass.

## Domain Model (`domain/`)
Entities (`InboxEntity` — the stored message record, `ConfigState`, `Execution`, `MetricsSnapshot`), value objects (`Priority`, `Threshold`, `TimeWindow` — dedup retention windows), domain/execution/query/validation services, events (`InboxExecuted`/`Failed`), handlers, in-memory repository (the dedup store seam), mapper, decorators, observer, pipeline, policies, specifications.

## Supporting
- `errors/InboxErrors.ts` — typed codes for duplicate-message and store failures
- `adapters/` — InMemory, Mock, Stub (extension points for durable dedup stores)
- `configuration/` — builders, `DEFAULT_INBOX_CONFIG`, validators
- `health/`, `metrics/` (Prometheus), `statistics/`, `utils/` (`InboxError`, `InboxErrorMapper`)
