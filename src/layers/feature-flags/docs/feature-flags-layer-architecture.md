# FeatureFlags Layer Architecture

## Position
Layer 29. Responsibility: feature flags and dynamic toggles.

## Core Contract
`IFeatureFlags` (`interfaces/`): `execute(context: FeatureFlagsContext)`, `configure(config)`, `getStatus()` → `{ config, metrics, active }`.

`FeatureFlags` (`implementations/`) returns `FeatureFlagsResult` (`{ success, data?, error? }`, code `FEATUREFLAGS_EXECUTION_ERROR`) and records `successCount`/`failureCount`/`lastExecutionTime` metrics.

## Types (`types/feature-flags-types.ts`)
`FeatureFlagsContext` `{ input, metadata, timestamp }` — flag evaluation inputs (flag name, user/targeting attributes) flow through `input`/`metadata`; `FeatureFlagsResult<T>`; `FeatureFlagsError`; `FeatureFlagsConfig` (`enabled`, `timeout`, `retries`, `logLevel`).

## Strategies (`strategies/`)
`IFeatureFlagsStrategy` (`name`/`priority`/`canHandle`/`execute`) implementations via `FeatureFlagsStrategyFactory`: `default` (0), `fast` (1), `reliable` (2), `batch` (3), `cached` (4). `fast` serves hot-path flag checks; `cached` memoizes evaluations for repeated user+flag pairs; `batch` evaluates flag sets in one call.

## Domain Model (`domain/`)
Entities (`FeatureFlagsEntity`, `ConfigState`, `Execution`, `MetricsSnapshot`), value objects (`Priority`, `Threshold`, `TimeWindow` — rollout windows), domain/execution/query/validation services, events (`FeatureFlagsExecuted`/`Failed`), handlers, in-memory repository, mapper, decorators, observer, pipeline, policies (access/rate — natural homes for targeting rules), specifications.

## Supporting
- `adapters/` — InMemory, Mock, Stub (extension points for LaunchDarkly/Unleash-style backends)
- `configuration/` — builders, `DEFAULT_FEATUREFLAGS_CONFIG`, validators
- `health/`, `metrics/` (Prometheus), `statistics/`, `utils/` (`FeatureFlagsError`, `FeatureFlagsErrorMapper`)
