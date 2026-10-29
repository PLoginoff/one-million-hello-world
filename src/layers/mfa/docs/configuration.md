# Configuration: MFA Layer

## Generic Layer Config

`MfaConfig` (in `types/mfa-types.ts`), used by `implementations/Mfa.ts`:

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `enabled` | `boolean` | `true` | Enable/disable the layer |
| `timeout` | `number` | `30000` | Operation timeout in ms |
| `retries` | `number` | `3` | Retry attempts |
| `logLevel` | `'debug' \| 'info' \| 'warn' \| 'error'` | `'info'` | Logging verbosity |

Defaults: `DEFAULT_MFA_CONFIG` in `configuration/defaults/MfaDefaults.ts`.
Build via `MfaConfigurationBuilder` / `MfaBuilder`; validate via
`MfaConfigurationValidator` / `MfaValidator`.

## TOTP Options

`TotpOptions` (per call, `totp/Totp.ts`):

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `stepSeconds` | `number` | `30` | Time step (RFC 6238 recommends 30) |
| `digits` | `number` | `6` | Code length |
| `algorithm` | `'sha1' \| 'sha256' \| 'sha512'` | `'sha1'` | HMAC algorithm |
| `t0` | `number` | `0` | Epoch offset in seconds |
| `window` | `number` | `1` | ±steps tolerance on `verify` |

## Rate Limiter

`RateLimiterConfig` (`totp/MfaRateLimiter.ts`):

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `maxAttempts` | `number` | `5` | Failed attempts before lockout |
| `lockoutMs` | `number` | `300000` | Lockout duration (5 min) |
| `windowMs` | `number` | `600000` | Failure-decay window (10 min) |

## SMS Provider

`SmsCodeProvider` options: `codeLength` (6), `ttlMs` (5 min),
`maxAttempts` (5). Transport is injected — there is no built-in SMS
gateway.

## Testability

All components accept an optional `now: () => number` clock for
deterministic tests.
