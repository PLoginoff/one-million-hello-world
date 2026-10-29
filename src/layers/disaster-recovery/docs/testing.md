# Testing: DisasterRecovery Layer

## Running tests

```bash
bun test ./src/layers/disaster-recovery/
```

## Test files

`__tests__/`:

| File | Covers |
|------|--------|
| `DisasterRecovery.test.ts` | `execute()` contract, `configure()` merge, `getStatus()` |
| `DisasterRecoveryStrategies.test.ts` | Five strategies + `DisasterRecoveryStrategyFactory` |
| `DisasterRecoveryConfiguration.test.ts` | Config builder/validator, defaults |

`domain/__tests__/` — `DisasterRecoveryDomain`, `ExtendedDomain`, `Services`, `Patterns` cover entities, value objects, services, repository, events, handlers, decorators, observer, pipeline, policies, specifications.

## Conventions
- All tests run in-memory — no real failover infrastructure needed.
- `createContext(input)` builds `DisasterRecoveryContext` fixtures.
