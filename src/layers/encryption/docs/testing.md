# Testing: Encryption Layer

## Running tests

```bash
bun test ./src/layers/encryption/
```

## Test files

`__tests__/`:

| File | Covers |
|------|--------|
| `EncryptionReal.test.ts` | The real crypto path: `AesGcm` round-trips, `Kdf` derivations, `KeyRing` envelope encrypt/decrypt + rotation, `FieldEncryptor` per-field encryption |
| `Encryption.test.ts` | `IEncryption` contract: `execute()` result shape, error path, `getStatus()` metrics |
| `EncryptionAdapters.test.ts` | InMemory / Mock / Stub adapters |
| `EncryptionStrategies.test.ts` | Five generic strategies + `EncryptionStrategyFactory` |
| `EncryptionConfiguration.test.ts` | Config builder/validator, defaults |

`domain/__tests__/` — `EncryptionDomain`, `ExtendedDomain`, `Services`, `Patterns` cover entities, value objects, services, repository, events, handlers, decorators, observer, pipeline, policies, specifications.

## Conventions
- `EncryptionReal` tests use real `crypto` primitives with short/fast parameters where KDF cost would slow the suite.
- All keys are generated via `SecureRandom` — no hardcoded key material.
