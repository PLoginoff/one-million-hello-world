# Testing: Facade Layer

## Running tests

```bash
bun test ./src/layers/facade/
```

## Actual test files

`__tests__/`:

| File | Covers |
|------|--------|
| `Facade.test.ts` | `execute(operations[])` — sequential run, `data[]` aggregation, `operations[]` naming (`operation_N`), partial-failure reporting, `setConfig`/`getConfig` toggles (`enableAggregation`, `enableComposition`) |
| `FacadeStrategies.test.ts` | Five strategies + `FacadeStrategyFactory` |
| `FacadeConfiguration.test.ts` | Config builder/validator, defaults |

`domain/__tests__/` — `FacadeExtendedDomain`, `FacadePatterns` cover the extended domain model (specifications, policies, decorators, repository, events, handlers).

## Conventions
- Tests pass inline `async () => value` operations — no mocks needed.
- Partial-failure cases assert `operations` lists only the steps that ran before the throw.
