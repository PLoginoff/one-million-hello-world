# Testing: Service Layer

## Test Files

| File | Scope |
|------|-------|
| `__tests__/Service.test.ts` | `Service` facade: `getConfig`/`setConfig`, `createContext`, `registerUseCase`/`getUseCase`/`clearUseCases`, `execute` |
| `__tests__/ControllerServiceIntegration.test.ts` | Controller → service integration |
| `__tests__/ServiceStrategies.test.ts` | Strategy implementations + `ServiceStrategyFactory` |
| `__tests__/ServiceConfiguration.test.ts` | `ServiceConfigurationBuilder`, `ServiceConfigurationValidator` |
| `__tests__/ServiceErrorMapper.test.ts` | `ServiceErrorMapper` |
| `__tests__/ServiceHealthCheck.test.ts` | `ServiceHealthCheck` |
| `__tests__/ServiceMetricsCollector.test.ts` | `ServiceMetricsCollector` |
| `domain/__tests__/` | `ServiceExtendedDomain`, `ServicePatterns`, `ServiceServices` — entities, value objects, policies, specifications, pipeline, decorators, handlers, repository |

## Running Tests

```bash
bun test ./src/layers/service/
```

Single file:

```bash
bun test ./src/layers/service/__tests__/Service.test.ts
```

Tests use `bun:test` (`describe`/`it`/`expect`). Use-cases are plain
async functions — no controller or transport layer is required.
