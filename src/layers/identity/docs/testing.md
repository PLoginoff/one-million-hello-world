# Testing: Identity Layer

## Running tests

```bash
bun test ./src/layers/identity/
```

## Test files

`__tests__/`:

| File | Covers |
|------|--------|
| `Identity.test.ts` | `execute()` success/failure, `configure()` merge, `getStatus()` + metrics |
| `IdentityStrategies.test.ts` | Five strategies + `IdentityStrategyFactory` |
| `IdentityConfiguration.test.ts` | Config builder/validator, defaults |

`domain/__tests__/` — `IdentityDomain`, `ExtendedDomain`, `Services`, `Patterns` cover entities, value objects, services, repository, events, handlers, decorators, observer, pipeline, policies, specifications.

## Conventions
- `createContext(input)` builds `IdentityContext` fixtures; strategy tests are table-driven.
- In-memory identity store only — no LDAP/DB needed.
