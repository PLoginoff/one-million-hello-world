# Testing: Decorator Layer

## Running tests

```bash
bun test ./src/layers/decorator/
```

## Actual test files

`__tests__/`:

| File | Covers |
|------|--------|
| `Decorator.test.ts` | `execute()` — success result carries `data` + merged `decorators` list; `enableLogging`/`enableMetrics` config adds `'logging'`/`'metrics'`; operation failure returns `{ success: false, error }` with decorators still reported; `setConfig`/`getConfig` |
| `DecoratorStrategies.test.ts` | Five strategies + `DecoratorStrategyFactory` |
| `DecoratorConfiguration.test.ts` | Config builder/validator, defaults |

`domain/__tests__/`:

| File | Covers |
|------|--------|
| `DecoratorExtendedDomain.test.ts` | Repository, mapper, events, handlers, observer, pipeline |
| `DecoratorServices.test.ts` | Domain/execution/query/validation services |
| `DecoratorPatterns.test.ts` | Specifications, policies, decorators |

## Conventions
- Tests pass `async () => value` operations and assert on `DecoratorResult.decorators` — decoration is verified through the result, not mocks.
- Config-toggle tests assert the built-in names appear only when enabled.
