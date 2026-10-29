# DeadLetter Layer Architecture

## Position
Layer 58. Responsibility: dead letter queue management — the pipeline layer for handling messages that exhausted retries.

## Core Contract
`IDeadLetter` (`interfaces/`): `execute(context: DeadLetterContext)`, `configure(config)`, `getStatus()` → `{ config, metrics, active }`.

`DeadLetter` (`implementations/`) returns `DeadLetterResult` (`{ success, data?, error? }`, code `DEADLETTER_EXECUTION_ERROR`) and records `successCount`/`failureCount`/`lastExecutionTime` metrics per call.

## Types (`types/dead-letter-types.ts`)
`DeadLetterContext` `{ input, metadata, timestamp }`, `DeadLetterResult<T>`, `DeadLetterError`, `DeadLetterConfig` (`enabled`, `timeout`, `retries`, `logLevel`).

## Strategies (`strategies/`)
`IDeadLetterStrategy` (`name`/`priority`/`canHandle`/`execute`) implementations via `DeadLetterStrategyFactory`: `default` (0), `fast` (1), `reliable` (2), `batch` (3), `cached` (4).

## Domain Model (`domain/`)
Entities (`DeadLetterEntity`, `ConfigState`, `Execution`, `MetricsSnapshot`), value objects (`Priority`, `Threshold`, `TimeWindow`), domain/execution/query/validation services, events (`DeadLetterExecuted`/`Failed`), handlers, `DeadLetterInMemoryRepository`, mapper, caching/logging decorators, event observer, processing pipeline, access/rate policies, And/Or/Not specifications.

## Supporting
- `errors/DeadLetterErrors.ts` — typed error codes
- `adapters/` — InMemory, Mock, Stub
- `configuration/` — builders, `DEFAULT_DEADLETTER_CONFIG`, validators
- `health/`, `metrics/` (Prometheus), `statistics/`, `utils/` (`DeadLetterError`, `DeadLetterErrorMapper`)
