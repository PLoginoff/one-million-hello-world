# Testing: JwtValidation Layer

## Running tests

```bash
bun test ./src/layers/jwt-validation/
```

## Test files

`__tests__/`:

| File | Covers |
|------|--------|
| `JwtReal.test.ts` | The real `jwt/` module: parse/verify round-trips for supported algorithms, `JwtIssuer` signing, `JwkStore` lookup, `KeyRotationStrategy` grace periods, `TokenBlacklist` pruning, `TokenRefresher` rotation, algorithm-confusion rejection |
| `JwtValidation.test.ts` | `IJwtValidation` contract: `execute()` result shape, error path, `getStatus()` |
| `JwtValidationStrategies.test.ts` | Five generic strategies + `JwtValidationStrategyFactory` |
| `JwtValidationConfiguration.test.ts` | Config builder/validator, defaults |

`domain/__tests__/` — `JwtValidationDomain`, `ExtendedDomain`, `Services`, `Patterns` cover entities, value objects, services, repository, events, handlers, decorators, observer, pipeline, policies, specifications.

## Conventions
- `JwtReal` generates throwaway RSA/EC/Ed25519 keypairs in-test via Node `crypto` — no fixtures or network.
- Tampered tokens and `alg` mismatches are asserted to fail verification, not just return `success: false`.
