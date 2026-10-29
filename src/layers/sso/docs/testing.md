# Testing: Sso Layer

## Test Files

| File | Scope |
|------|-------|
| `__tests__/SsoReal.test.ts` | Full federation suite: `SamlResponseParser` (conditions, audience), `AttributeMapper`, `IdpRegistry`, `OidcFlow` (state/nonce/PKCE), `SessionTicketStore` (one-time use, TTL), `SloCoordinator` (revocation + propagation), `SsoEngine` end-to-end |
| `__tests__/Sso.test.ts` | `Sso` facade: config, `execute()` result envelope |
| `__tests__/SsoStrategies.test.ts` | Generic strategies + `SsoStrategyFactory` |
| `__tests__/SsoConfiguration.test.ts` | `SsoConfigurationBuilder`, `SsoConfigurationValidator` |

## Running Tests

```bash
bun test ./src/layers/sso/
```

Single file:

```bash
bun test ./src/layers/sso/__tests__/SsoReal.test.ts
```

Tests use `bun:test`. Clocks are injected (`now` options) and the SLO
transport is a stub callback, so no IdP or network is needed.
