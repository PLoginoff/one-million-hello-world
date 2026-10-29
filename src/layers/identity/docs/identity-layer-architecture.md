# Identity Layer Architecture

## Position
Layer 36. Responsibility: identity and user management — user CRUD, credential lifecycle, and profile operations behind a uniform contract.

## Core Contract
`IIdentity` (`interfaces/`): `execute(context: IdentityContext)`, `configure(config)`, `getStatus()` → `{ config, metrics, active }`.

`Identity` (`implementations/`) returns `IdentityResult` (`{ success, data?, error? }`, code `IDENTITY_EXECUTION_ERROR`) and records `successCount`/`failureCount`/`lastExecutionTime` metrics.

## Types (`types/identity-types.ts`)
`IdentityContext` `{ input, metadata, timestamp }` — identity operations flow through `input`; `IdentityResult<T>`; `IdentityError`; `IdentityConfig` (`enabled`, `timeout`, `retries`, `logLevel`).

## Strategies (`strategies/`)
`IIdentityStrategy` (`name`/`priority`/`canHandle`/`execute`) implementations via `IdentityStrategyFactory`: `default` (0), `fast` (1), `reliable` (2), `batch` (3), `cached` (4). `cached` memoizes repeated identity lookups; `batch` suits bulk provisioning.

## Domain Model (`domain/`)
Entities (`IdentityEntity`, `ConfigState`, `Execution`, `MetricsSnapshot`), value objects (`Priority`, `Threshold`, `TimeWindow`), domain/execution/query/validation services, events (`IdentityExecuted`/`Failed` — lifecycle hooks for provisioning/deprovisioning), handlers, in-memory repository, mapper, decorators, observer, pipeline, policies, specifications.

## Supporting
- `adapters/` — InMemory, Mock, Stub (extension points for LDAP/SCIM/DB-backed identity stores)
- `configuration/` — builders, `DEFAULT_IDENTITY_CONFIG`, validators
- `health/`, `metrics/` (Prometheus), `statistics/`, `utils/` (`IdentityError`, `IdentityErrorMapper`)
