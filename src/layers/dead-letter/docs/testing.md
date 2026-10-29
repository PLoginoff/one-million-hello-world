# Testing: DeadLetter Layer

## Running tests

```bash
bun test ./src/layers/dead-letter/
```

## Test files

`__tests__/`:

| File | Covers |
|------|--------|
| `DeadLetter.test.ts` | `execute()` success/failure, `configure()` merge, `getStatus()` shape + metrics |
| `DeadLetterStrategies.test.ts` | All five strategies (name, priority, execute, execution count) + `DeadLetterStrategyFactory` |
| `DeadLetterConfiguration.test.ts` | Config builder/validator, defaults |

`domain/__tests__/` — `DeadLetterDomain`, `ExtendedDomain`, `Services`, `Patterns` cover entities, value objects, services, repository, events, handlers, decorators, observer, pipeline, policies, specifications.

## Conventions
- `createContext(input)` builds `DeadLetterContext` fixtures.
- Strategy tests are table-driven over `{ name, cls }`; repository is in-memory — no external services needed.
