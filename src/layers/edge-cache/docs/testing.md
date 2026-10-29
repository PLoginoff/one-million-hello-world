# Testing: EdgeCache Layer

## Running tests

```bash
bun test ./src/layers/edge-cache/
```

## Test files

`__tests__/`:

| File | Covers |
|------|--------|
| `EdgeCache.test.ts` | `execute()` success/failure, `configure()` merge, `getStatus()` + metrics |
| `EdgeCacheStrategies.test.ts` | Five strategies + `EdgeCacheStrategyFactory` |
| `EdgeCacheConfiguration.test.ts` | Config builder/validator, defaults |

`domain/__tests__/` — `EdgeCacheDomain`, `ExtendedDomain`, `Services`, `Patterns` cover entities, value objects (`TimeWindow` TTL logic), services, repository, events, handlers, decorators, observer, pipeline, policies, specifications.

## Conventions
- `createContext(input)` builds `EdgeCacheContext` fixtures; strategy tests are table-driven.
- In-memory adapters only — no CDN provider or network needed.
