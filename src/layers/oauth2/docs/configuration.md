# Configuration: OAuth2 Layer

## Generic Layer Config

`Oauth2Config` (in `types/oauth2-types.ts`), used by
`implementations/Oauth2.ts`:

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `enabled` | `boolean` | `true` | Enable/disable the layer |
| `timeout` | `number` | `30000` | Operation timeout in ms |
| `retries` | `number` | `3` | Retry attempts |
| `logLevel` | `'debug' \| 'info' \| 'warn' \| 'error'` | `'info'` | Logging verbosity |

Defaults: `configuration/defaults/Oauth2Defaults.ts`. Build via
`Oauth2ConfigurationBuilder` / `Oauth2Builder`; validate via
`Oauth2ConfigurationValidator` / `Oauth2Validator`.

## Authorization Server

`new OAuth2AuthorizationServer({ issuer, now })`:

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `issuer` | `string` | `'https://auth.local'` | Issuer stamped on tokens/introspection |
| `now` | `() => number` | `Date.now` | Clock for deterministic tests |

## Per-Client Registration (`OAuth2Client`)

| Field | Type | Description |
|-------|------|-------------|
| `clientId` | `string` | Client identifier |
| `clientSecret` | `string` | Provided at registration; stored hashed |
| `isPublic` | `boolean` | Public clients have no secret |
| `redirectUris` | `string[]` | Allowed redirect URIs |
| `allowedGrantTypes` | `GrantType[]` | Permitted grants |
| `allowedScopes` | `string[]` | Permitted scopes |
| `requirePkce` | `boolean` | Require PKCE on authorization_code |
| `accessTokenTtlSeconds` | `number` | Access-token TTL |
| `refreshTokenTtlSeconds` | `number` | Refresh-token TTL (optional) |

## Device Grant

`DeviceAuthorizationRequest` controls `scope` and poll `interval`
(RFC 8628 default 5 s); `slow_down` is returned when the client polls
faster than the interval.

## Testability

Every component accepts `now: () => number` for deterministic expiry and
rate-limit testing.
