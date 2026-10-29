# Testing: SecretsRotation Layer

## Test Files

| File | Scope |
|------|-------|
| `__tests__/SecretsRotation.test.ts` | Facade: default config, `configure()`, `execute()` success path |
| `__tests__/SecretsRotationStrategies.test.ts` | All five strategies (name, priority, `execute()`, execution count) and `SecretsRotationStrategyFactory` (create/list/sort/unknown-name error) |
| `__tests__/SecretsRotationConfiguration.test.ts` | `SecretsRotationConfigurationBuilder` fluent API and `SecretsRotationConfigurationValidator` limits |
| `domain/__tests__/SecretsRotationDomain.test.ts` | `SecretsRotationEntity`, `SecretsRotationValueObject`, `SecretsRotationDomainService` |
| `domain/__tests__/SecretsRotationExtendedDomain.test.ts` | `SecretsRotationExecution`, `SecretsRotationThreshold`, `SecretsRotationTimeWindow`, `SecretsRotationPriority`, `SecretsRotationExecuted`/`SecretsRotationFailed` events |
| `domain/__tests__/SecretsRotationPatterns.test.ts` | Access/rate policies, And/Or/Not specifications, `SecretsRotationEventObserver`, `SecretsRotationProcessingPipeline`, caching/logging decorators, `SecretsRotationEventHandler` |
| `domain/__tests__/SecretsRotationServices.test.ts` | Execution/validation/query services, `SecretsRotationInMemoryRepository`, `SecretsRotationMapper`, command/query handlers |

## Running Tests

```bash
bun test ./src/layers/secrets-rotation/
```

Single file:

```bash
bun test ./src/layers/secrets-rotation/__tests__/SecretsRotationStrategies.test.ts
```

Tests use `bun:test` (`describe`/`it`/`expect`) and need no
external services — all strategies and adapters are in-memory.
