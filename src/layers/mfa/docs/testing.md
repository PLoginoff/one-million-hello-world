# Testing: MFA Layer

## Test Files

### `__tests__/`
- `MfaReal.test.ts` — the real MFA surface. Includes the published
  RFC 4226 Appendix D HOTP vectors (secret `12345678901234567890`) and
  RFC 6238 Appendix B TOTP vectors, base32 round-trip, backup-code
  hashing/consume, enrollment begin→confirm flow, rate-limiter lockout,
  and the SMS provider against an in-memory `SmsTransport`.
- `Mfa.test.ts` — generic `Mfa` implementation: execute/configure/getStatus.
- `MfaStrategies.test.ts` — the five generic strategies.
- `MfaConfiguration.test.ts` — builder and validator.

### `domain/__tests__/`
- `MfaDomain.test.ts`, `MfaExtendedDomain.test.ts` — entities, value objects.
- `MfaPatterns.test.ts` — specifications, decorators, pipeline.
- `MfaServices.test.ts` — domain/execution/query/validation services.

## Running Tests

```bash
bun test ./src/layers/mfa/
```

Single file:

```bash
bun test ./src/layers/mfa/__tests__/MfaReal.test.ts
```

## Test Approach
- **RFC vectors** pin the crypto: TOTP and HOTP outputs are compared
  against the values published in the RFCs, so algorithm or counter bugs
  are caught immediately.
- **Clock injection** — components accept `now: () => number`, so tests
  control time instead of sleeping.
- **Constant-time verification** is exercised by feeding wrong codes of
  equal length.
