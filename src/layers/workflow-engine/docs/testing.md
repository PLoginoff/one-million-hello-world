# Testing: WorkflowEngine Layer

## Test Files

| File | Scope |
|------|-------|
| `__tests__/WorkflowEngine.test.ts` | Facade: default config, `configure()`, `execute()` success path |
| `__tests__/WorkflowEngineStrategies.test.ts` | All five strategies (name, priority, `execute()`, execution count) and `WorkflowEngineStrategyFactory` (create/list/sort/unknown-name error) |
| `__tests__/WorkflowEngineConfiguration.test.ts` | `WorkflowEngineConfigurationBuilder` fluent API and `WorkflowEngineConfigurationValidator` limits |
| `domain/__tests__/WorkflowEngineDomain.test.ts` | `WorkflowEngineEntity`, `WorkflowEngineValueObject`, `WorkflowEngineDomainService` |
| `domain/__tests__/WorkflowEngineExtendedDomain.test.ts` | `WorkflowEngineExecution`, `WorkflowEngineThreshold`, `WorkflowEngineTimeWindow`, `WorkflowEnginePriority`, `WorkflowEngineExecuted`/`WorkflowEngineFailed` events |
| `domain/__tests__/WorkflowEnginePatterns.test.ts` | Access/rate policies, And/Or/Not specifications, `WorkflowEngineEventObserver`, `WorkflowEngineProcessingPipeline`, caching/logging decorators, `WorkflowEngineEventHandler` |
| `domain/__tests__/WorkflowEngineServices.test.ts` | Execution/validation/query services, `WorkflowEngineInMemoryRepository`, `WorkflowEngineMapper`, command/query handlers |

## Running Tests

```bash
bun test ./src/layers/workflow-engine/
```

Single file:

```bash
bun test ./src/layers/workflow-engine/__tests__/WorkflowEngineStrategies.test.ts
```

Tests use `bun:test` (`describe`/`it`/`expect`) and need no
external services — all strategies and adapters are in-memory.
