# Configuration: Encryption Layer

## Layer defaults
`DEFAULT_ENCRYPTION_CONFIG` (`configuration/defaults/`):

```ts
{ enabled: true, timeout: 30000, retries: 3, logLevel: 'info' }
```

`configure()` merges `Record<string, unknown>` over the current config. Use `EncryptionConfigurationBuilder` / `EncryptionConfigurationValidator` for typed construction and validation.

## Crypto parameters
Per-component options are constructor arguments, not layer config:

| Component | Options | Notes |
|-----------|---------|-------|
| `AesGcm.encrypt(key, plaintext, { aad, kid })` | `aad`, `kid` | Key must be 32 bytes; 12-byte IV generated per call |
| `Kdf.derive(...)` | algorithm (`pbkdf2`/`scrypt`/`hkdf`), iterations/N, salt | Enforced minimums: PBKDF2 ≥ 100,000 iterations; scrypt N ≥ 16384 |
| `KeyRing` | registered KEKs (`kid`) | `kekKid` recorded per ciphertext for rotation |
| `FieldEncryptor` | `FieldSpec[]` — `path` (dot-separated), optional `aad` | Default AAD is `` `${recordId}:${path}` `` |

## Security requirements
- Keys are `Buffer`s; `SecureRandom` is the supported way to generate them.
- Envelope fields (`EncryptedEnvelope`) are safe to store/serialize — they contain no plaintext or raw keys.
- `FieldEncryptor` output is a `{ __enc: true, wrapped, kekKid }` marker object — detectable by downstream tooling.

## Status inspection
`getStatus()` → `{ config, metrics, active }` with `successCount`/`failureCount`/`lastExecutionTime` metrics.
