# Testing: SchemaRegistry Layer

## Test Files

| File | Scope |
|------|-------|
| `__tests__/SchemaRegistry.test.ts` | Facade: default config, `configure()`, `execute()` success path |
| `__tests__/SchemaRegistryStrategies.test.ts` | All five strategies (name, priority, `execute()`, execution count) and `SchemaRegistryStrategyFactory` (create/list/sort/unknown-name error) |
| `__tests__/SchemaRegistryConfiguration.test.ts` | `SchemaRegistryConfigurationBuilder` fluent API and `SchemaRegistryConfigurationValidator` limits |
| `domain/__tests__/SchemaRegistryDomain.test.ts` | `SchemaRegistryEntity`, `SchemaRegistryValueObject`, `SchemaRegistryDomainService` |
| `domain/__tests__/SchemaRegistryExtendedDomain.test.ts` | `SchemaRegistryExecution`, `SchemaRegistryThreshold`, `SchemaRegistryTimeWindow`, `SchemaRegistryPriority`, `SchemaRegistryExecuted`/`SchemaRegistryFailed` events |
| `domain/__tests__/SchemaRegistryPatterns.test.ts` | Access/rate policies, And/Or/Not specifications, `SchemaRegistryEventObserver`, `SchemaRegistryProcessingPipeline`, caching/logging decorators, `SchemaRegistryEventHandler` |
| `domain/__tests__/SchemaRegistryServices.test.ts` | Execution/validation/query services, `SchemaRegistryInMemoryRepository`, `SchemaRegistryMapper`, command/query handlers |

## Running Tests

```bash
bun test ./src/layers/schema-registry/
```

Single file:

```bash
bun test ./src/layers/schema-registry/__tests__/SchemaRegistryStrategies.test.ts
```

Tests use `bun:test` (`describe`/`it`/`expect`) and need no
external services — all strategies and adapters are in-memory.
