# MFA Layer Architecture

## Position
Layer 68

## Responsibility
Multi-factor authentication: TOTP (RFC 6238), HOTP (RFC 4226), backup
codes, SMS codes, enrollment flow, and verification rate limiting.

## Structure

```
mfa/
├── index.ts                          — barrel export
├── totp/                             — real MFA implementation
│   ├── Base32.ts                     — RFC 4648 base32 encode/decode
│   ├── Hotp.ts                       — RFC 4226 counter-based OTP
│   ├── Totp.ts                       — RFC 6238 time-based OTP
│   ├── BackupCodes.ts                — single-use recovery codes (hashed)
│   ├── MfaRateLimiter.ts             — token-bucket lockout on verify
│   ├── MfaEnrollment.ts              — authenticator-app pairing flow
│   └── SmsCodeProvider.ts            — SMS-delivered codes (injected transport)
├── interfaces/IMfa.ts
├── implementations/Mfa.ts            — generic execute/configure/getStatus impl
├── strategies/                       — default / fast / reliable / cached / batch
├── factories/                        — MfaFactory, MfaStrategyFactory
├── configuration/                    — builders, defaults, validators
├── domain/                           — entities, events, handlers, policies,
│                                       specifications, value objects, services
├── adapters/                         — InMemory, Mock, Stub
├── health/MfaHealthCheck.ts
├── metrics/MfaPrometheusMetricsCollector.ts
├── statistics/MfaMetricsCollector.ts
├── types/mfa-types.ts
└── utils/                            — MfaError, MfaErrorMapper
```

## TOTP / HOTP (`totp/`)

- **`hotp(secret, counter, opts)`** — RFC 4226 HMAC-based OTP. Supports
  SHA-1 / SHA-256 / SHA-512 and configurable digit count (default 6).
  `hotpVerify` checks a code within a look-ahead counter window.
- **`Totp.generate(secret, timestampMs, opts)`** — RFC 6238. Derives the
  counter from `stepSeconds` (default 30) and `t0` (default 0).
  `Totp.verify` accepts a ±`window` (default ±1 step) to tolerate clock
  skew, and returns the matched step `delta`.
- **`Totp.generateSecret()`** — random secret + base32 encoding.
- **`Totp.otpauthUri({ secretBase32, accountName, issuer })`** — builds an
  `otpauth://` URI for QR-code provisioning.
- **`base32Encode` / `base32Decode`** — RFC 4648, used for secret storage
  and otpauth URIs.

## Enrollment (`totp/MfaEnrollment.ts`)

Two-step pairing lifecycle:

1. `beginTotp(userId, accountName, { issuer })` → generates a factor in
   `pending` status, returns `factorId`, `secretBase32`, and `otpauthUri`.
2. `confirmTotp(userId, factorId, code)` → verifies the first TOTP code,
   flips status to `active`, and issues backup codes.

`MfaFactor` records `kind` (`totp` | `sms` | `backup`), `status`
(`pending` | `active` | `disabled`), label, and timestamps.

## Backup Codes (`totp/BackupCodes.ts`)

Single-use recovery codes stored as SHA-256 hashes with per-code salt —
a database leak does not expose usable codes. Each successful consume
removes the entry.

## Rate Limiting (`totp/MfaRateLimiter.ts`)

Token-bucket per principal. A failed attempt adds to `failures`; a
success resets the bucket. After `maxAttempts` failures (default 5) the
principal is locked for `lockoutMs` (default 5 min). `windowMs` (default
10 min) controls failure decay.

## SMS Codes (`totp/SmsCodeProvider.ts`)

Generates a numeric code (default 6 digits, 5-min TTL), stores only
SHA-256 hash of `salt:code` plus a hash of the phone number, and delegates
delivery to an injected `SmsTransport`. Verification is constant-time
(`timingSafeEqual`) and capped at `maxAttempts` per challenge.

## Generic Pipeline (`implementations/`, `strategies/`)

The `Mfa` class implements `IMfa` (`execute` / `configure` / `getStatus`)
with metric recording, and the five generic strategies share
`IMfaStrategy` — these exist so the layer fits the uniform layer contract;
the real MFA surface is `totp/`.

## Domain (`domain/`)

`MfaEntity`, `MfaExecution`, `MfaConfigState`, `MfaMetricsSnapshot`;
CQRS handlers (`Command`/`Query`/`Event`); `MfaAccessPolicy`,
`MfaRatePolicy`; `And`/`Or`/`Not` specifications; `MfaProcessingPipeline`;
`MfaInMemoryRepository`.

## Testing
See [testing.md](testing.md).
