# Configuration: Sso Layer

## SsoEngine options
`new SsoEngine(opts)` (`federation/SsoEngine.ts`):

| Option | Default | Description |
|--------|---------|-------------|
| `now` | `Date.now` | Clock injection (tests use fixed time) |
| `ticketTtlMs` | 300,000 (5 min) | `SessionTicket` lifetime |
| `sloTransport` | none | `SloTransport` used to propagate LogoutRequests to IdPs |

`OidcFlowOptions`: `clientId`, `clientSecret?`, `redirectUri`,
`scope?`, `tokenEndpoint?` (test override).

`SessionTicketStore` accepts `{ now?, ttlMs? }`.

## Default Configuration
Defaults are defined in `configuration/defaults/SsoDefaults.ts`
as `DEFAULT_SSO_CONFIG`:

```typescript
export const DEFAULT_SSO_CONFIG: SsoConfig = {
  enabled: true,
  timeout: 30000,
  retries: 3,
  logLevel: 'info',
};
```

## Configuration Options
| Option | Type | Default | Description |
|--------|------|---------|-------------|
| enabled | boolean | true | Enable/disable the layer |
| timeout | number | 30000 | Operation timeout in ms (validated 1,000–300,000) |
| retries | number | 3 | Retry attempts (validated 0–10) |
| logLevel | string | "info" | Logging verbosity (`debug`/`info`/`warn`/`error`) |
| strategy | string | "default" | Execution strategy: `default`, `fast`, `reliable`, `cached`, `batch` |

## Builder and Validator
- `SsoConfigurationBuilder` (`configuration/builders/`) — fluent
  construction of the config object.
- `SsoConfigurationValidator` (`configuration/validators/`) —
  returns `{ valid, errors, warnings }`; enforces the timeout/retries
  bounds and the strategy allowlist, warns on unknown `logLevel`.
