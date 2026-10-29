# Testing: Serialization Layer

## Test Files

Top-level (`__tests__/`):

| File | Scope |
|------|-------|
| `Serializer.test.ts` | Facade: config, `serialize`/`deserialize`, `negotiateContentType`, strategies, plugins, hooks, validation, versioning |
| `SerializationStrategies.test.ts` | Format strategies + factory |
| `SerializationConfiguration.test.ts` | Config builder and validator |
| `index.test.ts` | Public surface exports |

Per-subsystem suites (one file each unless noted):

| Directory | Covers |
|-----------|--------|
| `strategies/` | `JSONStrategy`, `XMLStrategy`, `StringStrategy` |
| `content-negotiation/` | `ContentNegotiationManager` (Accept, q-values, fallback) |
| `versioning/` | `VersioningManager` + versioning strategies |
| `validation/` | `ValidationPipeline`, `CompositeValidator` |
| `plugins/` | `PluginManager` lifecycle + hooks |
| `hooks/` | `HookManager` types/priority |
| `middleware/` | `MiddlewarePipeline` |
| `cache/` | `Cache` |
| `registry/` | `StrategyRegistry` |
| `factories/` | `SerializationStrategyFactory` |
| `builders/` | `SerializerBuilder` |
| `di/` | `DIContainer` |
| `events/` | `SerializationEventEmitter` |
| `errors/` | `SerializationError`, `BaseSerializationError` |
| `logging/` | `Logger` |
| `metrics/` | `Metrics` |
| `resilience/` | `ResiliencePatterns` |
| `decorators/` | `CachingDecorator` |
| `config/` | `ConfigSchema` |
| `utils/` | type guards |
| `integration/` | `SerializerIntegration` (end-to-end) |
| `domain/__tests__/` | `SerializationExtendedDomain`, `SerializationPatterns`, `SerializationServices` |

## Running Tests

```bash
bun test ./src/layers/serialization/
```

A subtree, e.g.:

```bash
bun test ./src/layers/serialization/__tests__/strategies/
bun test ./src/layers/serialization/__tests__/Serializer.test.ts
```

Tests use `bun:test` (`describe`/`it`/`expect`) — all formats run
in-process, no external serializer service needed.
