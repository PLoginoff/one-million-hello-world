# Localization Layer Architecture

## Position
Layer 2 — near the bottom of the stack. Responsibility: internationalization and locale management.

## Core Contract
`ILocalization` (`interfaces/`): `execute(context: LocalizationContext)`, `configure(config)`, `getStatus()`.

`Localization` (`implementations/`) returns `LocalizationResult` (`{ success, data?, error? }`) — translate/locale-resolution operations flow through `context.input`/`metadata`.

## Types (`types/localization-types.ts`)
`LocalizationContext` `{ input, metadata, timestamp }`, `LocalizationResult<T>`, `LocalizationError`, `LocalizationConfig` (`enabled`, `timeout`, `retries`, `logLevel`).

## Strategies (`strategies/`)
Five strategy classes — `LocalizationDefaultStrategy`, `FastStrategy`, `ReliableStrategy`, `CachedStrategy`, `BatchStrategy` — via `LocalizationStrategyFactory`. `cached` is the natural default for message-bundle lookups; `batch` resolves whole message sets per locale.

## Domain Model (`domain/`)
Entities (`LocalizationEntity`, `ConfigState`, `Execution`, `MetricsSnapshot`), value objects (`Priority`, `Threshold`, `TimeWindow`), domain/execution/query/validation services, events (`LocalizationExecuted`/`Failed`), handlers, in-memory repository (message catalog seam), mapper, decorators, observer, pipeline, policies, specifications.

## Supporting
- `adapters/` — InMemory, Mock, Stub (extension points for message-catalog providers / i18n services)
- `configuration/` — `LocalizationConfigurationBuilder`, `DEFAULT_LOCALIZATION_CONFIG`, validator
- `health/`, `metrics/` (Prometheus), `statistics/`, `utils/` (`LocalizationError`, `LocalizationErrorMapper`)

Note: no `LocalizationFactory` — only `LocalizationStrategyFactory` exists.
