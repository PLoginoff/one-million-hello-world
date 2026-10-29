# Secrets Layer Architecture

## Position
Layer 31

## Responsibility
Secrets management and vault abstraction. Callers resolve a secret key
through the `Secrets` facade or an adapter; every call returns a
`SecretsResult<T>` envelope (`success`, `data`, `error`) — e.g.
`SECRET_NOT_FOUND` for a missing key.

## Components

### Contract and facade
- **`ISecrets`** (`interfaces/`) — `execute(context)`, `configure()`,
  `getStatus()`.
- **`Secrets`** (`implementations/Secrets.ts`) — in-process facade.

### Adapters (`adapters/`)
- **`EnvSecretsAdapter`** — reads `process.env`; maps a key to
  `<PREFIX>_<KEY>` (upper-cased) when a prefix is configured, else
  `<KEY>`. Returns `SECRET_NOT_FOUND` when unset.
- **`VaultSecretsAdapter`** — HashiCorp Vault–shaped adapter (mock):
  configurable `vaultUrl`/`token`, caches resolved values in a
  `Map` (`source: 'vault-cache'` on hits).

### Strategies (`strategies/`)
`SecretsDefault` (0), `SecretsFast` (10), `SecretsReliable` (5),
`SecretsCached` (7), `SecretsBatch` (3) — `ISecretsStrategy`
implementations created by `SecretsStrategyFactory`; `SecretsStrategy.ts`
holds the shared contract.

### Domain (`domain/`)
Entities (`SecretsEntity`, `SecretsExecution`, `SecretsConfigState`,
`SecretsMetricsSnapshot`), value objects (`SecretsValueObject`,
`SecretsThreshold`, `SecretsPriority`, `SecretsTimeWindow`), services
(execution/validation/query/domain), `SecretsInMemoryRepository`,
specifications, access/rate policies, processing pipeline,
caching/logging decorators, mapper, observer, command/query/event
handlers, `SecretsExecuted`/`SecretsFailed` events.

### Cross-cutting
`SecretsHealthCheck`, `SecretsMetricsCollector`,
`SecretsPrometheusMetricsCollector`, `SecretsError`/`SecretsErrorMapper`.

## Configuration
`SecretsConfigurationBuilder` / `SecretsBuilder`,
`SecretsConfigurationValidator` / `SecretsValidator`, and
`SecretsDefaults.ts` — see `configuration.md`.

## Testing
See `testing.md` — includes dedicated adapter tests
(`SecretsAdapters.test.ts`).
