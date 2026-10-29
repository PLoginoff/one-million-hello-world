# Testing: IdentityProvider Layer

## Running tests

```bash
bun test ./src/layers/identity-provider/
```

## Test files

`__tests__/`:

| File | Covers |
|------|--------|
| `IdentityProvider.test.ts` | `execute()` success/failure, `configure()` merge, `getStatus()` + metrics |
| `IdentityProviderStrategies.test.ts` | Five strategies + `IdentityProviderStrategyFactory` |
| `IdentityProviderConfiguration.test.ts` | Config builder/validator, defaults |

`domain/__tests__/` — `IdentityProviderDomain`, `ExtendedDomain`, `Services`, `Patterns` cover entities, value objects, services, repository, events, handlers, decorators, observer, pipeline, policies, specifications.

## Conventions
- `createContext(input)` builds `IdentityProviderContext` fixtures; strategy tests are table-driven.
- In-memory providers only — no real IdP needed.
