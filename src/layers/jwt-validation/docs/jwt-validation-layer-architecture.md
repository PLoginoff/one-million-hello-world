# JwtValidation Layer Architecture

## Position
Layer 70. Responsibility: JWT parsing, signature verification, claims validation, and token lifecycle (issue, refresh, revoke, rotate keys).

## JWT Module (`jwt/`)
From-scratch implementation over Node `crypto`:

| Component | Role |
|-----------|------|
| `JwtParser` | Decodes `header.payload.signature` via base64url without verifying; use `JwtVerifier` for full validation |
| `JwtVerifier` | Signature verification + claims validation for HS256/RS256/ES256/PS256/EdDSA. Algorithm-confusion prevention: caller supplies allowed `alg` list; verifier rejects tokens whose `alg` isn't allowed **or** whose family mismatches the key material (e.g. HMAC token vs RSA key) |
| `JwtIssuer` | Signs tokens with HS256/RS256/ES256 (`SignOptions`: algorithm, key, `kid`, `expiresInSeconds`, `notBeforeSeconds`) |
| `JwkStore` | JWK set handling: resolves keys by `kid` + algorithm; fetches/refreshes from a remote JWKS endpoint with a `maxKeys` DoS guard |
| `KeyRotationStrategy` | Signing-key rotation: active key signs new tokens, retired keys verify until their grace period elapses |
| `TokenBlacklist` | Revocation by `jti` or token hash; entries pruned automatically once `exp` passes |
| `TokenRefresher` | Access/refresh pairs: short-lived HS256 access tokens + opaque random refresh tokens stored server-side as SHA-256 hashes with rotation-on-use |
| `base64url`, `types` | Encoding helpers, `DecodedJwt`, `JwtClaims`, `JwtHeader`, `JwtTokenError`, algorithm guards |

## Layer Contract
`IJwtValidation` (`interfaces/`): `execute(context)`, `configure(config)`, `getStatus()`. `JwtValidation` (`implementations/`) returns `JwtValidationResult` (`{ success, data?, error? }`, code `JWTVALIDATION_EXECUTION_ERROR`) and tracks `successCount`/`failureCount`/`lastExecutionTime`.

## Generic Processing Strategies
`default`, `fast`, `reliable`, `cached`, `batch` — `IJwtValidationStrategy` implementations created via `JwtValidationStrategyFactory`.

## Domain Model (`domain/`)
Entities (`JwtValidationEntity`, `ConfigState`, `Execution`, `MetricsSnapshot`), value objects, domain/execution/query/validation services, events, handlers, in-memory repository, mapper, decorators, observer, pipeline, policies, specifications.

## Supporting
- `adapters/` — InMemory, Mock, Stub
- `configuration/` — builders, `DEFAULT_JWTVALIDATION_CONFIG`, validators
- `health/`, `metrics/` (Prometheus), `statistics/`, `utils/` (`JwtValidationError`, `JwtValidationErrorMapper`)
