# Testing: Governance Layer

## Running tests

```bash
bun test ./src/layers/governance/
```

## Test files

`__tests__/`:

| File | Covers |
|------|--------|
| `Governance.test.ts` | `execute()` contract, `configure()` merge, `getStatus()` |
| `GovernanceStrategies.test.ts` | Five strategies + `GovernanceStrategyFactory` |
| `GovernanceConfiguration.test.ts` | Config builder/validator, defaults |

`domain/__tests__/` — `GovernanceDomain`, `ExtendedDomain`, `Services`, `Patterns` cover entities, value objects, services, repository, events, handlers, decorators, observer, pipeline, access/rate policies, and specifications — the compliance-rule surface.

## Conventions
- `createContext(input)` builds `GovernanceContext` fixtures; all tests run in-memory.
