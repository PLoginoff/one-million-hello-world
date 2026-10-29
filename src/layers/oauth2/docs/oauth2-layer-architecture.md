# OAuth2 Layer Architecture

## Position
Layer 69

## Responsibility
OAuth2 authorization server: all four grant types, PKCE, token
introspection and revocation — RFC 6749, 7636, 8628, 7662, 7009.

## Structure

```
oauth2/
├── index.ts                           — barrel export
├── OAuth2AuthorizationServer.ts       — facade wiring registry + store + grants
├── core/
│   ├── types.ts                       — error codes, client/token/device types
│   ├── ClientRegistry.ts              — client store, hashed-secret auth
│   ├── TokenStore.ts                  — codes, access/refresh tokens, device grants
│   └── Pkce.ts                        — RFC 7636 verifier/challenge helpers
├── grants/
│   ├── AuthorizationCodeGrant.ts      — RFC 6749 §4.1 + PKCE
│   ├── ClientCredentialsGrant.ts      — RFC 6749 §4.4
│   ├── RefreshTokenGrant.ts           — RFC 6749 §6 with rotation + reuse detection
│   └── DeviceCodeGrant.ts             — RFC 8628 device authorization
├── interfaces/IOauth2.ts
├── implementations/Oauth2.ts          — generic execute/configure/getStatus impl
├── strategies/                        — default / fast / reliable / cached / batch
├── factories/                         — Oauth2Factory, Oauth2StrategyFactory
├── configuration/                     — builders, defaults, validators
├── domain/                            — entities, events, handlers, policies,
│                                        specifications, value objects, services
├── adapters/                          — InMemory, Mock, Stub
├── health/Oauth2HealthCheck.ts
├── metrics/Oauth2PrometheusMetricsCollector.ts
├── statistics/Oauth2MetricsCollector.ts
├── types/oauth2-types.ts
└── utils/                             — Oauth2Error, Oauth2ErrorMapper
```

## Authorization Server (`OAuth2AuthorizationServer.ts`)

Facade that composes the registry, token store, and all four grants, and
exposes a uniform endpoint surface:

- `tokenEndpoint(req)` — dispatches on `grant_type`
  (`authorization_code`, `client_credentials`, `refresh_token`,
  `urn:ietf:params:oauth:grant-type:device_code`); unknown types raise
  `unsupported_grant_type`.
- `deviceAuthorizationEndpoint(req)` — RFC 8628 device authorization.
- `introspect(req)` — RFC 7662 token introspection.
- `revoke(...)` — RFC 7009; returns success even for unknown tokens.

## Core (`core/`)

- **`ClientRegistry`** — stores `OAuth2Client` records
  (`clientId`, hashed secret, `isPublic`, `redirectUris`,
  `allowedGrantTypes`, `allowedScopes`, `requirePkce`, token TTLs).
  Secrets stored as SHA-256 + per-client salt; authentication is
  constant-time.
- **`TokenStore`** — in-memory store for `AuthorizationCode`,
  `AccessToken`, `RefreshToken`, `DeviceGrant`; backs introspection and
  revocation.
- **`Pkce`** — `generateVerifier()`, `challenge(verifier, 'S256')`,
  `verify(...)`; supports `S256` and `plain` methods.
- **`types.ts`** — `OAuth2Error` with all RFC 6749 §5.2 and RFC 8628 §3.5
  error codes (`invalid_request`, `invalid_client`, `invalid_grant`,
  `unauthorized_client`, `unsupported_grant_type`, `invalid_scope`,
  `authorization_pending`, `slow_down`, `access_denied`, `expired_token`,
  ...), each mapped to its RFC-compliant HTTP status; plus `parseScope` /
  `scopeToString` / `scopeSubset` helpers.

## Grants (`grants/`)

- **`AuthorizationCodeGrant`** — models the flow as a state machine:
  `START → CODE_ISSUED → TOKEN_ISSUED`. Verifies redirect URI match, code
  expiry, single-use codes, and PKCE `S256` challenges.
- **`ClientCredentialsGrant`** — M2M flow: client authenticates directly,
  receives an access token with no subject and no refresh token.
- **`RefreshTokenGrant`** — rotates refresh tokens per use; reusing a
  rotated token revokes the entire family (RFC 6819 §5.2.2.4 theft
  detection).
- **`DeviceCodeGrant`** — issues `device_code` + `user_code`, polls via
  `token()` which returns `authorization_pending` (or `slow_down` if the
  client polls faster than `interval`) until the user approves or the
  code expires.

## Generic Pipeline (`implementations/`, `strategies/`)

The `Oauth2` class and five generic strategies satisfy the uniform layer
contract; the real OAuth2 surface is the authorization server + grants
described above.

## Domain (`domain/`)

`Oauth2Entity`, `Oauth2Execution`, `Oauth2ConfigState`,
`Oauth2MetricsSnapshot`; CQRS handlers; `Oauth2AccessPolicy`,
`Oauth2RatePolicy`; `And`/`Or`/`Not` specifications;
`Oauth2ProcessingPipeline`; `Oauth2InMemoryRepository`.

## Testing
See [testing.md](testing.md).
