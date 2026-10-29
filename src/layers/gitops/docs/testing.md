# Testing: Gitops Layer

## Running tests

```bash
bun test ./src/layers/gitops/
```

## Test files

`__tests__/`:

| File | Covers |
|------|--------|
| `Gitops.test.ts` | `execute()` success/failure, `configure()` merge, `getStatus()` + metrics |
| `GitopsStrategies.test.ts` | Five strategies + `GitopsStrategyFactory` |
| `GitopsConfiguration.test.ts` | Config builder/validator, defaults |

`domain/__tests__/` — `GitopsDomain`, `ExtendedDomain`, `Services`, `Patterns` cover entities, value objects, services, repository, events, handlers, decorators, observer, pipeline, policies, specifications.

## Conventions
- `createContext(input)` builds `GitopsContext` fixtures; strategy tests are table-driven.
- In-memory Git/cluster adapters only — no repository or cluster needed.
