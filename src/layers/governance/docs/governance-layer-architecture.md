# Governance Layer Architecture

## Position
Layer 4 — one of the lowest layers in the stack. Responsibility: policies, compliance rules, and audit governance.

## Core Contract
`IGovernance` (`interfaces/`): `execute(context: GovernanceContext)`, `configure(config)`, `getStatus()`.

`Governance` (`implementations/`) returns `GovernanceResult` (`{ success, data?, error? }`) — policy evaluation and audit operations flow through `context.input`/`metadata`.

## Types (`types/governance-types.ts`)
`GovernanceContext` `{ input, metadata, timestamp }`, `GovernanceResult<T>`, `GovernanceError`, `GovernanceConfig` (`enabled`, `timeout`, `retries`, `logLevel`).

## Strategies (`strategies/`)
Five strategy classes — `GovernanceDefaultStrategy`, `FastStrategy`, `ReliableStrategy`, `CachedStrategy`, `BatchStrategy` — via `GovernanceStrategyFactory`. `fast` serves per-request policy checks; `batch` suits compliance sweeps.

## Domain Model (`domain/`)
Entities (`GovernanceEntity`, `ConfigState`, `Execution`, `MetricsSnapshot`), value objects (`Priority`, `Threshold`, `TimeWindow`), domain/execution/query/validation services, events (`GovernanceExecuted`/`Failed` — policy-violation/audit hooks), handlers, in-memory repository, mapper, decorators, observer, pipeline, `GovernanceAccessPolicy`/`RatePolicy`, And/Or/Not specifications — the natural modeling surface for compliance rules.

## Supporting
- `adapters/` — InMemory, Mock, Stub
- `configuration/` — `GovernanceConfigurationBuilder`, `DEFAULT_GOVERNANCE_CONFIG`, validator
- `health/`, `metrics/` (Prometheus), `statistics/`, `utils/` (`GovernanceError`, `GovernanceErrorMapper`)

Note: no `GovernanceFactory` — only `GovernanceStrategyFactory` exists.
