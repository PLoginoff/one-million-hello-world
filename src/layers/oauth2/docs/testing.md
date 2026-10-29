# Testing: OAuth2 Layer

## Test Files

### `__tests__/`
- `OAuth2Real.test.ts` — the real authorization-server surface:
  PKCE verifier/challenge generation and verification; all four grants
  (authorization code + PKCE S256, client credentials, refresh-token
  rotation and family-reuse revocation, device flow including
  `authorization_pending` and `slow_down`); introspection, revocation,
  scope validation, and RFC error codes.
- `Oauth2.test.ts` — generic `Oauth2` implementation:
  execute/configure/getStatus.
- `Oauth2Strategies.test.ts` — the five generic strategies.
- `Oauth2Configuration.test.ts` — builder and validator.

### `domain/__tests__/`
- `Oauth2Domain.test.ts`, `Oauth2ExtendedDomain.test.ts` — entities and
  value objects.
- `Oauth2Patterns.test.ts` — specifications, decorators, pipeline.
- `Oauth2Services.test.ts` — domain/execution/query/validation services.

## Running Tests

```bash
bun test ./src/layers/oauth2/
```

Single file:

```bash
bun test ./src/layers/oauth2/__tests__/OAuth2Real.test.ts
```

## Test Approach
- Tests build a real `OAuth2AuthorizationServer` with a fixed `now` clock
  and drive it end-to-end: register client → authorize → exchange →
  refresh → introspect → revoke.
- Error assertions use the RFC error codes (`invalid_grant`,
  `authorization_pending`, `slow_down`, `unsupported_grant_type`), not
  just error presence.
