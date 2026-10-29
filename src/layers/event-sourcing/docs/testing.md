# Testing: EventSourcing Layer

## Running tests

```bash
bun test ./src/layers/event-sourcing/
```

## Test files

`__tests__/`:

| File | Covers |
|------|--------|
| `EventSourcing.test.ts` | `execute()` success/failure, `configure()` merge, `getStatus()` + metrics |
| `EventSourcingStrategies.test.ts` | Five strategies + `EventSourcingStrategyFactory` |
| `EventSourcingConfiguration.test.ts` | Config builder/validator, defaults |

`domain/__tests__/` — `EventSourcingDomain`, `ExtendedDomain`, `Services`, `Patterns` cover entities, value objects, services, repository, events, handlers, decorators, observer, pipeline, policies, specifications.

## Conventions
- `createContext(input)` builds `EventSourcingContext` fixtures; strategy tests are table-driven.
- The event store is in-memory — no external store needed.
