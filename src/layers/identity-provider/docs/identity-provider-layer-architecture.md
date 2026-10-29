# IdentityProvider Layer Architecture

## Position
Layer 66. Responsibility: identity provider abstraction — a uniform interface over external IdPs (OIDC/SAML/LDAP-style backends). Distinct from `identity` (Layer 36), which manages local user entities; this layer federates to providers.

## Core Contract
`IIdentityProvider` (`interfaces/`): `execute(context: IdentityProviderContext)`, `configure(config)`, `getStatus()` → `{ config, metrics, active }`.

`IdentityProvider` (`implementations/`) returns `IdentityProviderResult` (`{ success, data?, error? }`, code `IDENTITYPROVIDER_EXECUTION_ERROR`) and records `successCount`/`failureCount`/`lastExecutionTime` metrics.

## Types (`types/identity-provider-types.ts`)
`IdentityProviderContext` `{ input, metadata, timestamp }` — provider operations (authenticate, fetch profile, validate assertion) flow through `input`/`metadata`; `IdentityProviderResult<T>`; `IdentityProviderError`; `IdentityProviderConfig` (`enabled`, `timeout`, `retries`, `logLevel`).

## Strategies (`strategies/`)
`IIdentityProviderStrategy` (`name`/`priority`/`canHandle`/`execute`) implementations via `IdentityProviderStrategyFactory`: `default` (0), `fast` (1), `reliable` (2), `batch` (3), `cached` (4). `cached` memoizes provider metadata/profile lookups (JWKS doc, userinfo); `reliable` suits token-exchange paths.

## Domain Model (`domain/`)
Entities (`IdentityProviderEntity`, `ConfigState`, `Execution`, `MetricsSnapshot`), value objects (`Priority`, `Threshold`, `TimeWindow`), domain/execution/query/validation services, events (`IdentityProviderExecuted`/`Failed`), handlers, in-memory repository, mapper, decorators, observer, pipeline, policies, specifications.

## Supporting
- `adapters/` — InMemory, Mock, Stub (extension points for real OIDC/SAML providers)
- `configuration/` — builders, `DEFAULT_IDENTITYPROVIDER_CONFIG`, validators
- `health/`, `metrics/` (Prometheus), `statistics/`, `utils/` (`IdentityProviderError`, `IdentityProviderErrorMapper`)
