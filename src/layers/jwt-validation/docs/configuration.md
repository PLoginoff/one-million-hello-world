# Configuration: JwtValidation Layer

## Layer defaults
`DEFAULT_JWTVALIDATION_CONFIG` (`configuration/defaults/`):

```ts
{ enabled: true, timeout: 30000, retries: 3, logLevel: 'info' }
```

`configure()` merges `Record<string, unknown>`; `JwtValidationConfigurationBuilder` and validator provide typed construction.

## Verifier options
`JwtVerifier` is configured per call/site, not via layer config:

- **Allowed algorithms** — required; pass only the `alg` values you actually issue (e.g. `['RS256']`). Never allow `none`.
- **Key material** — secret `Buffer` for HS*, PEM/`KeyObject` for RS*/ES*/PS*, Ed25519 public key for EdDSA. Family is checked against the token `alg`.
- **Claims** — `exp`, `nbf`, `iss`, `aud` validated per standard rules.

## Key management
| Component | Option |
|-----------|--------|
| `JwkStore` | `maxKeys` on fetch (DoS guard); resolve by `kid` + algorithm |
| `KeyRotationStrategy` | grace period for retired keys (`status: 'active' | 'retired'`) |
| `TokenRefresher` | access-token TTL (`expiresInSeconds`), refresh rotation |
| `TokenBlacklist` | revocation by `jti` or token hash; auto-pruned at `exp` |

## Issuing
`JwtIssuer.sign(claims, { algorithm, key, kid, expiresInSeconds, notBeforeSeconds })` — supports HS256/RS256/ES256.

## Status inspection
`getStatus()` → `{ config, metrics, active }` with `successCount`/`failureCount`/`lastExecutionTime`.
