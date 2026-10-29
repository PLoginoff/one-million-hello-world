# ADR: MFA Layer

## Status
Accepted

## Context
The application needs real MFA — not just a layer-shaped stub — including
authenticator-app TOTP, recovery codes, and brute-force protection.

## Decisions

### 1. RFC-compliant TOTP/HOTP implementation in `totp/`
TOTP (RFC 6238) and HOTP (RFC 4226) are implemented from the specs using
Node `crypto` HMAC, verified against the RFC test vectors. Supporting
SHA-1/256/512 and configurable digits/step covers both current
authenticator apps and legacy devices.

### 2. Secrets distributed as base32 via otpauth:// URIs
`Totp.generateSecret()` returns raw bytes plus a base32 encoding; the
otpauth URI builder follows the de-facto Google Authenticator format so
any standard app can scan the QR.

### 3. Backup codes stored hashed, not plaintext
Each backup code is stored as `SHA-256(salt + code)`. A database leak
yields only hashes — codes are single-use and unrecoverable, which is the
desired trade-off (users generate new ones rather than recover old ones).

### 4. Rate limiting as a separate component, not inside TOTP
`MfaRateLimiter` is a standalone token-bucket keyed by principal. Keeping
it out of `Totp.verify` means the same limiter protects SMS verification,
backup-code redemption, and TOTP confirmation uniformly.

### 5. Two-phase enrollment with proof-of-possession
`beginTotp` only creates a `pending` factor; `confirmTotp` requires a
valid code before activation. This prevents a user from locking
themselves out by scanning the wrong QR or mistyping the secret.

### 6. SMS via injected transport
`SmsCodeProvider` depends on an `SmsTransport` interface rather than a
concrete provider — in tests a stub captures messages; in production a
Twilio-class adapter is injected. Only hashes of phone + code are stored.

## Consequences
- The MFA surface is genuinely usable: generation, verification,
  enrollment, recovery, and throttling are all real.
- Test coverage uses the published RFC vectors, catching subtle HMAC or
  counter bugs.
- In-memory stores (factors, buckets, pending SMS) mean this layer is not
  yet horizontally scalable — a Redis-backed store would be needed for
  multi-instance deployments.
