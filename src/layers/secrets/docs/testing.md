# Testing: Secrets Layer

## Test Files

| File | Scope |
|------|-------|
| `__tests__/SecretsAdapters.test.ts` | `EnvSecretsAdapter` (env lookup, prefixing, `SECRET_NOT_FOUND`) and `VaultSecretsAdapter` (fetch, cache hits) |
| `__tests__/Secrets.test.ts` | `Secrets` facade: config, `execute()` result envelope |
| `__tests__/SecretsStrategies.test.ts` | Five strategies + `SecretsStrategyFactory` |
| `__tests__/SecretsConfiguration.test.ts` | `SecretsConfigurationBuilder`, `SecretsConfigurationValidator` |
| `domain/__tests__/` | `SecretsDomain`, `SecretsExtendedDomain`, `SecretsPatterns`, `SecretsServices` — entities, value objects, specifications, policies, pipeline, decorators, handlers, repository |

## Running Tests

```bash
bun test ./src/layers/secrets/
```

Single file:

```bash
bun test ./src/layers/secrets/__tests__/SecretsAdapters.test.ts
```

Tests use `bun:test`. The Vault adapter is a mock and env vars are
manipulated inside the test process — no external secret store needed.
