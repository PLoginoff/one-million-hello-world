# Testing: Localization Layer

## Running tests

```bash
bun test ./src/layers/localization/
```

## Test files

`__tests__/`:

| File | Covers |
|------|--------|
| `Localization.test.ts` | `execute()` contract, `configure()` merge, `getStatus()` |
| `LocalizationStrategies.test.ts` | Five strategies + `LocalizationStrategyFactory` |
| `LocalizationConfiguration.test.ts` | Config builder/validator, defaults |

`domain/__tests__/` — `LocalizationDomain`, `ExtendedDomain`, `Services`, `Patterns` cover entities, value objects, services, repository (catalog seam), events, handlers, decorators, observer, pipeline, policies, specifications.

## Conventions
- `createContext(input)` builds `LocalizationContext` fixtures; all tests run in-memory.
