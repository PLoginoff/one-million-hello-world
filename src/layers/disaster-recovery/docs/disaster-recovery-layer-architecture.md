# DisasterRecovery Layer Architecture

## Position
Layer 8. Responsibility: DR drills, failover, and recovery orchestration.

## Core Contract
`IDisasterRecovery` (`interfaces/`): `execute(context: DisasterRecoveryContext)`, `configure(config)`, `getStatus()`.

`DisasterRecovery` (`implementations/`) tracks an `_initialized` flag plus config, returns `DisasterRecoveryResult` (`{ success, data?, error? }`), and is the orchestration entry point for drills/failover/recovery operations passed through `context.input`.

## Types (`types/disaster-recovery-types.ts`)
`DisasterRecoveryContext` `{ input, metadata, timestamp }`, `DisasterRecoveryResult<T>`, `DisasterRecoveryError`, `DisasterRecoveryConfig` (`enabled`, `timeout`, `retries`, `logLevel`).

## Strategies (`strategies/`)
Five strategy classes — `DisasterRecoveryDefaultStrategy`, `FastStrategy`, `ReliableStrategy`, `CachedStrategy`, `BatchStrategy` — created via `DisasterRecoveryStrategyFactory`. `ReliableStrategy` suits actual failover; `FastStrategy` suits drills.

## Domain Model (`domain/`)
Entities (`DisasterRecoveryEntity`, `ConfigState`, `Execution`, `MetricsSnapshot`), value objects (`Priority`, `Threshold`, `TimeWindow`), domain/execution/query/validation services, events (`DisasterRecoveryExecuted`/`Failed`), handlers, in-memory repository, mapper, decorators, observer, pipeline, policies, specifications.

## Supporting
- `adapters/` — InMemory, Mock, Stub
- `configuration/` — `DisasterRecoveryConfigurationBuilder`, `DEFAULT_DISASTERRECOVERY_CONFIG`, validator
- `health/`, `metrics/` (Prometheus), `statistics/`, `utils/` (`DisasterRecoveryError`, `DisasterRecoveryErrorMapper`)

Note: unlike most layers, this one has no `DisasterRecoveryFactory` — only `DisasterRecoveryStrategyFactory` exists.
