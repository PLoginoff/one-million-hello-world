# ADR: Encryption Layer

## Status
Accepted

## Decisions

### 1. AES-256-GCM as the sole cipher
`AesGcm` produces a versioned `EncryptedEnvelope` (`v: 1`, `alg: 'A256GCM'`) with the GCM tag appended to ciphertext. AEAD gives confidentiality + integrity in one primitive; a single algorithm avoids downgrade/negotiation bugs. The `v` field allows future format evolution.

*Alternative rejected:* offering multiple ciphers — increases misuse surface without benefit here.

### 2. Envelope encryption for stored data
`KeyRing` generates a fresh DEK per record, wraps it under a KEK, and stores `{ wrappedDek, data, kekKid }`. Rotation only re-wraps DEKs — data is never re-encrypted wholesale.

### 3. KDF minimums enforced in code
`Kdf` refuses PBKDF2 < 100k iterations and scrypt N < 2^14. Weak parameters are a runtime error, not a lint rule — callers can't accidentally ship insecure settings. argon2id is a documented stub delegating to pbkdf2 rather than pulling a native dep.

### 4. AAD binds ciphertext to context
`FieldEncryptor` uses `recordId:path` as AAD by default so a ciphertext copied to a different row or field fails to decrypt — cheap protection against cut-and-paste attacks on encrypted columns.

### 5. Pure Node `crypto`, zero dependencies
All primitives use built-in `crypto` (`randomBytes`, `createCipheriv`, `pbkdf2`, `scrypt`, `hkdf`) — no native modules, portable across runtimes.

### 6. Non-throwing `execute()` contract
`Encryption.execute()` returns `EncryptionResult` with code `ENCRYPTION_EXECUTION_ERROR` on failure, matching the uniform layer contract so crypto operations compose into pipelines.
