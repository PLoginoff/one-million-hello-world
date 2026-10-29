# Testing: FeatureFlags Layer

## Running tests

```bash
bun test ./src/layers/feature-flags/
```

## Test files

`__tests__/`:

| File | Covers |
|------|--------|
| `FeatureFlags.test.ts` | `execute()` success/failure, `configure()` merge, `getStatus()` + metrics |
| `FeatureFlagsStrategies.test.ts` | Five strategies + `FeatureFlagsStrategyFactory` |
| `FeatureFlagsConfiguration.test.ts` | Config builder/validator, defaults |

`domain/__tests__/` — `FeatureFlagsDomain`, `ExtendedDomain`, `Services`, `Patterns` cover entities, value objects, services, repository, events, handlers, decorators, observer, pipeline, policies, specifications (the targeting-predicate surface).

## Conventions
- `createContext(input)` builds `FeatureFlagsContext` fixtures; strategy tests are table-driven.
- In-memory flag backends only — no provider SDK needed.
