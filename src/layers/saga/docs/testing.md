# Testing: Saga Layer

## Test Files

| File | Scope |
|------|-------|
| `__tests__/SagaManager.test.ts` | Facade: config (`enableLogging`/`enableCompensation` defaults), `setConfig`/`getConfig`, saga execution |
| `__tests__/SagaOrchestrator.test.ts` | Orchestrated execution flow |
| `__tests__/CompensationOrchestrator.test.ts` | Compensation orchestration on failure |
| `__tests__/CompensationStrategy.test.ts` | Reverse-order compensation |
| `__tests__/StepExecutor.test.ts` | Sequential step execution |
| `__tests__/SagaState.test.ts` | State tracking and snapshots |
| `__tests__/SagaValidator.test.ts` | Step validation rules |
| `__tests__/ErrorHandler.test.ts` | Severity-based error handling |
| `__tests__/Logger.test.ts` | Level-filtered logging |
| `__tests__/SagaStrategies.test.ts` | Strategy implementations + `SagaStrategyFactory` |
| `__tests__/SagaConfiguration.test.ts` | Config builders and validators |
| `domain/__tests__/SagaPatterns.test.ts` | Domain-layer patterns (policies, specifications, decorators, handlers) |

## Running Tests

```bash
bun test ./src/layers/saga/
```

Single file:

```bash
bun test ./src/layers/saga/__tests__/SagaManager.test.ts
```

Tests use `bun:test` (`describe`/`it`/`expect`). Steps and compensation
functions are plain async closures — no external orchestrator, message
bus, or database required.
