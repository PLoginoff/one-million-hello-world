# Testing: Inbox Layer

## Running tests

```bash
bun test ./src/layers/inbox/
```

## Test files

`__tests__/`:

| File | Covers |
|------|--------|
| `Inbox.test.ts` | `execute()` success/failure, `configure()` merge, `getStatus()` + metrics |
| `InboxStrategies.test.ts` | Five strategies + `InboxStrategyFactory` |
| `InboxConfiguration.test.ts` | Config builder/validator, defaults |

`domain/__tests__/` — `InboxDomain`, `ExtendedDomain`, `Services`, `Patterns` cover entities, value objects (incl. `TimeWindow` retention), services, repository (dedup store), events, handlers, decorators, observer, pipeline, policies, specifications.

## Conventions
- `createContext(input)` builds `InboxContext` fixtures; strategy tests are table-driven.
- Dedup store is in-memory — no broker needed.
